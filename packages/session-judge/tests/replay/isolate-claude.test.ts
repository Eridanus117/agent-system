// Claude 隔离：临时配置目录里凭证、.claude.json、skill junction、CLAUDE.md 齐全；命令行带 CLAUDE_CONFIG_DIR；假 claude 跑通 start/resume。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claudeCli, prepareClaudeHome, readManifest, removeClaudeHome } from "../../src/replay/isolate-claude.ts";

const FAKE = path.join(import.meta.dir, "..", "..", "fixtures", "replay", "fake", "fake-claude.mjs");

function makeCandidate(root: string): string {
  const cand = path.join(root, "candidate");
  fs.mkdirSync(path.join(cand, "profiles", "daily"), { recursive: true });
  fs.mkdirSync(path.join(cand, "plugins", "x", "skills", "brainstorming"), { recursive: true });
  fs.writeFileSync(path.join(cand, "plugins", "x", "skills", "brainstorming", "SKILL.md"), "---\nname: brainstorming\n---\n");
  fs.writeFileSync(path.join(cand, "profiles", "daily", "manifest.json"), JSON.stringify({ skills: [{ name: "brainstorming", target: "plugins/x/skills/brainstorming" }] }));
  return cand;
}

describe("prepareClaudeHome", () => {
  test("拷凭证、写 .claude.json、投 skill、放 CLAUDE.md", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-claude-"));
    const host = path.join(root, "host-claude");
    fs.mkdirSync(host);
    fs.writeFileSync(path.join(host, ".credentials.json"), "{}");
    const prompt = path.join(root, "CLAUDE.md");
    fs.writeFileSync(prompt, "# 规则\n");
    const env = prepareClaudeHome({ tmpDir: path.join(root, "tmp"), candidate: makeCandidate(root), promptFile: prompt, hostConfigDir: host });
    expect(fs.existsSync(path.join(env.configDir, ".credentials.json"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(env.configDir, ".claude.json"), "utf8"))).toEqual({ hasCompletedOnboarding: true });
    expect(fs.existsSync(path.join(env.configDir, "skills", "brainstorming", "SKILL.md"))).toBe(true);
    expect(fs.readFileSync(path.join(env.configDir, "CLAUDE.md"), "utf8")).toBe("# 规则\n");
    expect(env.env.CLAUDE_CONFIG_DIR).toBe(env.configDir);
    removeClaudeHome(env);
    expect(fs.existsSync(env.configDir)).toBe(false);
  });
  test("主配置目录没有凭证文件报错", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-claude-"));
    fs.mkdirSync(path.join(root, "host"));
    expect(() => prepareClaudeHome({ tmpDir: path.join(root, "tmp"), candidate: makeCandidate(root), promptFile: path.join(root, "nope.md"), hostConfigDir: path.join(root, "host") })).toThrow("凭证");
  });
  test("readManifest 读候选清单", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-claude-"));
    expect(readManifest(makeCandidate(root))).toEqual([{ name: "brainstorming", target: "plugins/x/skills/brainstorming" }]);
  });
});

describe("claudeCli（假 claude）", () => {
  test("start 与 resume 写同一会话文件，sessionFile 能找到", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-claude-"));
    const host = path.join(root, "host-claude");
    fs.mkdirSync(host);
    fs.writeFileSync(path.join(host, ".credentials.json"), "{}");
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "");
    const env = prepareClaudeHome({ tmpDir: path.join(root, "tmp"), candidate: makeCandidate(root), promptFile: path.join(root, "CLAUDE.md"), hostConfigDir: host });
    const turns = path.join(root, "turns.json");
    fs.writeFileSync(turns, JSON.stringify([{ text: "范围？", rows: [] }, { text: "好", rows: [] }]));
    process.env.SJ_AGENT_CMD = `node ${FAKE}`;
    process.env.FAKE_TURNS = turns;
    try {
      const cli = claudeCli(env, { model: "m", workDir: root, timeoutMs: 20000 });
      const a = await cli.start("给 tool.ts 加开关");
      expect(a.text).toBe("范围？");
      const b = await cli.resume(a.sessionId, "只要 list");
      expect(b.text).toBe("好");
      expect(b.sessionId).toBe(a.sessionId);
      const f = cli.sessionFile(a.sessionId)!;
      expect(fs.readFileSync(f, "utf8").split("\n").filter(Boolean).length).toBe(4);
      expect(cli.sessionFile("nope")).toBeNull();
    } finally {
      delete process.env.SJ_AGENT_CMD;
      delete process.env.FAKE_TURNS;
    }
  });
  test("隔离目录在环境合并里必须赢：环境里的 CLAUDE_CONFIG_DIR 不能冲掉隔离的", async () => {
    // 回归测试：确保 mergedEnv = { ...process.env, ...env.env } 的顺序正确。
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-claude-"));
    const host = path.join(root, "host-claude");
    fs.mkdirSync(host);
    fs.writeFileSync(path.join(host, ".credentials.json"), "{}");
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "");
    const env = prepareClaudeHome({ tmpDir: path.join(root, "tmp"), candidate: makeCandidate(root), promptFile: path.join(root, "CLAUDE.md"), hostConfigDir: host });
    const turns = path.join(root, "turns.json");
    fs.writeFileSync(turns, JSON.stringify([{ text: "不该用 decoy", rows: [] }]));
    const decoy = path.join(root, "decoy");
    process.env.CLAUDE_CONFIG_DIR = decoy;
    process.env.SJ_AGENT_CMD = `node ${FAKE}`;
    process.env.FAKE_TURNS = turns;
    try {
      const cli = claudeCli(env, { model: "m", workDir: root, timeoutMs: 20000 });
      const a = await cli.start("测试隔离");
      const f = cli.sessionFile(a.sessionId);
      expect(f).not.toBeNull();
      // 确保会话文件落在真实隔离目录下，而不是虚假的 decoy
      expect(f!.startsWith(env.configDir)).toBe(true);
      // 验证虚假目录从未被创建
      expect(fs.existsSync(decoy)).toBe(false);
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
      delete process.env.SJ_AGENT_CMD;
      delete process.env.FAKE_TURNS;
    }
  });
});
