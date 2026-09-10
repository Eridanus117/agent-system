// OMP 隔离：临时 profile 下 agent.db 副本、config.yml、AGENTS.md；候选 skill 投到 work/.agents/skills；假 omp 跑通 start/resume。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ompCli, ompProfileName, prepareOmpProfile, removeOmpProfile } from "../../src/replay/isolate-omp.ts";

const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const FAKE = path.join(import.meta.dir, "..", "..", "fixtures", "replay", "fake", "fake-omp.mjs");

function scaffold(): { root: string; host: string; cand: string; work: string; prompt: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-omp-"));
  const host = path.join(root, "host-omp");
  fs.mkdirSync(path.join(host, "agent"), { recursive: true });
  fs.writeFileSync(path.join(host, "agent", "agent.db"), "db");
  const cand = path.join(root, "candidate");
  fs.mkdirSync(path.join(cand, "profiles", "daily"), { recursive: true });
  fs.mkdirSync(path.join(cand, "plugins", "x", "skills", "clarify"), { recursive: true });
  fs.writeFileSync(path.join(cand, "plugins", "x", "skills", "clarify", "SKILL.md"), "---\nname: clarify\n---\n");
  fs.writeFileSync(path.join(cand, "profiles", "daily", "manifest.json"), JSON.stringify({ skills: [{ name: "clarify", target: "plugins/x/skills/clarify" }] }));
  const work = path.join(root, "work");
  fs.mkdirSync(work);
  const prompt = path.join(root, "AGENTS.md");
  fs.writeFileSync(prompt, "# 规则\n");
  return { root, host, cand, work, prompt };
}

describe("prepareOmpProfile", () => {
  test("profile 目录齐全，skill 投到 work/.agents/skills，删得干净", () => {
    const s = scaffold();
    const env = prepareOmpProfile({ name: "sj-test", tmpDir: path.join(s.root, "tmp"), candidate: s.cand, promptFile: s.prompt, workDir: s.work, hostOmpDir: s.host });
    expect(env.profileDir).toBe(path.join(s.host, "profiles", "sj-test"));
    expect(fs.readFileSync(path.join(env.profileDir, "agent", "agent.db"), "utf8")).toBe("db");
    expect(fs.readFileSync(path.join(env.profileDir, "agent", "AGENTS.md"), "utf8")).toBe("# 规则\n");
    const cfg = fs.readFileSync(path.join(env.profileDir, "agent", "config.yml"), "utf8");
    expect(cfg).toContain("enableAgentsUser: false");
    expect(cfg).toContain("enableAgentsProject: true");
    expect(fs.existsSync(path.join(s.work, ".agents", "skills", "clarify", "SKILL.md"))).toBe(true);
    expect(env.sessionDir).toBe(path.join(s.root, "tmp", "omp-sessions"));
    removeOmpProfile(env);
    expect(fs.existsSync(env.profileDir)).toBe(false);
  });
  test("主 profile 没有 agent.db 报错", () => {
    const s = scaffold();
    fs.rmSync(path.join(s.host, "agent", "agent.db"));
    expect(() => prepareOmpProfile({ name: "sj-test", tmpDir: path.join(s.root, "tmp"), candidate: s.cand, promptFile: s.prompt, workDir: s.work, hostOmpDir: s.host })).toThrow("agent.db");
  });
  test("候选缺 skill 清单，半途炸了也不留凭证副本", () => {
    const s = scaffold();
    fs.rmSync(path.join(s.cand, "profiles", "daily", "manifest.json"));
    expect(() => prepareOmpProfile({ name: "sj-test", tmpDir: path.join(s.root, "tmp"), candidate: s.cand, promptFile: s.prompt, workDir: s.work, hostOmpDir: s.host })).toThrow(/manifest|清单/);
    expect(fs.existsSync(path.join(s.host, "profiles", "sj-test"))).toBe(false);
  });
});

describe("ompProfileName", () => {
  test("runId 带中文题号，转出的名字合法且保留可辨认片段", () => {
    const id = "20260910-013027-10-sk加json-omp-6a54";
    const name = ompProfileName(id);
    expect(name).toMatch(PROFILE_NAME_RE);
    expect(name.startsWith("sj-")).toBe(true);
    expect(name).toContain("20260910-013027");
    expect(name).toContain("omp-6a54");
    expect(name).not.toContain("--");
  });

  test("超长 runId 截到 64 字符，仍然合法", () => {
    const id = `20260910-013027-${"x".repeat(100)}-omp-6a54`;
    const name = ompProfileName(id);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(PROFILE_NAME_RE);
  });

  test("题号全是中文，退回 sj- 加 8 位随机十六进制", () => {
    const id = "加油加油加油";
    const name = ompProfileName(id);
    expect(name).toMatch(/^sj-[0-9a-f]{8}$/);
  });

  test("结果不以 . 结尾", () => {
    const id = "20260910-013027-10-story...-omp-6a54";
    const name = ompProfileName(id);
    expect(name.endsWith(".")).toBe(false);
    expect(name).toMatch(PROFILE_NAME_RE);
  });
});

describe("ompCli（假 omp）", () => {
  test("start 与 resume 续同一文件，sessionFile 能找到", async () => {
    const s = scaffold();
    const env = prepareOmpProfile({ name: "sj-test", tmpDir: path.join(s.root, "tmp"), candidate: s.cand, promptFile: s.prompt, workDir: s.work, hostOmpDir: s.host });
    const turns = path.join(s.root, "turns.json");
    fs.writeFileSync(turns, JSON.stringify([{ text: "范围？", rows: [] }, { text: "好", rows: [] }]));
    process.env.SJ_AGENT_CMD = `node ${FAKE}`;
    process.env.FAKE_TURNS = turns;
    try {
      const cli = ompCli(env, { model: "luna", workDir: s.work, timeoutMs: 20000 });
      const a = await cli.start("给 tool.ts 加开关");
      expect(a.text).toBe("范围？");
      const b = await cli.resume(a.sessionId, "只要 list");
      expect(b.text).toBe("好");
      const f = cli.sessionFile(a.sessionId)!;
      expect(f.endsWith(`_${a.sessionId}.jsonl`)).toBe(true);
      expect(fs.readFileSync(f, "utf8").split("\n").filter(Boolean).length).toBe(5);
    } finally {
      delete process.env.SJ_AGENT_CMD;
      delete process.env.FAKE_TURNS;
      removeOmpProfile(env);
    }
  });
});
