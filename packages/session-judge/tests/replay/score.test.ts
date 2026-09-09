import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git, gitHead } from "../../src/replay/git.ts";
import { defaultModel, majority, renderScoreTable, scoreAll } from "../../src/replay/score.ts";
import { parseStory } from "../../src/replay/story.ts";

// 与 tests/replay/run.test.ts 的 world()/fakeJudge() 同构：造一个最小工作区（源仓、题库、候选），
// 供 scoreAll 的假脚本用例复用；两份测试各自独立，不互相 import。
const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "replay");
const FAKE = path.join(FIX, "fake");

interface World { root: string; bank: string; storyDir: string; candidate: string; hostClaude: string; hostOmp: string; prompt: string; state: string; tmp: string }

function world(): World {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-score-"));
  // 工作区根下：fixture-repo（源仓）、agent-config/80-agent配置/60-回放题库/10-fixture（题库）、candidate（候选）
  const src = path.join(root, "fixture-repo");
  fs.mkdirSync(src);
  git(["init", "-q", "-b", "main"], src);
  fs.writeFileSync(path.join(src, "tool.ts"), "export {}\n");
  git(["add", "."], src);
  git(["-c", "user.email=t@x", "-c", "user.name=t", "commit", "-q", "-m", "初始"], src);
  const bank = path.join(root, "agent-config", "80-agent配置", "60-回放题库");
  const storyDir = path.join(bank, "10-fixture");
  fs.cpSync(path.join(FIX, "story-ok"), storyDir, { recursive: true });
  git(["init", "-q", "-b", "main"], path.join(root, "agent-config"));
  git(["add", "."], path.join(root, "agent-config"));
  git(["-c", "user.email=t@x", "-c", "user.name=t", "commit", "-q", "-m", "题库"], path.join(root, "agent-config"));
  const candidate = path.join(root, "candidate");
  fs.mkdirSync(path.join(candidate, "profiles", "daily"), { recursive: true });
  fs.writeFileSync(path.join(candidate, "profiles", "daily", "manifest.json"), JSON.stringify({ skills: [] }));
  git(["init", "-q", "-b", "main"], candidate);
  git(["add", "."], candidate);
  git(["-c", "user.email=t@x", "-c", "user.name=t", "commit", "-q", "-m", "候选"], candidate);
  const hostClaude = path.join(root, "host-claude");
  fs.mkdirSync(hostClaude);
  fs.writeFileSync(path.join(hostClaude, ".credentials.json"), "{}");
  const hostOmp = path.join(root, "host-omp", "agent");
  fs.mkdirSync(hostOmp, { recursive: true });
  fs.writeFileSync(path.join(hostOmp, "agent.db"), "db");
  const prompt = path.join(root, "CLAUDE.md");
  fs.writeFileSync(prompt, "# 规则\n");
  return { root, bank, storyDir, candidate, hostClaude, hostOmp: path.join(root, "host-omp"), prompt, state: path.join(root, "state"), tmp: path.join(root, "tmp") };
}

function fakeJudge(root: string, verdict: string): string {
  const f = path.join(root, "judge.mjs");
  fs.writeFileSync(f, `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log('判决：${verdict}\\n证据：事件 2\\n说明：假评委。')});`);
  return f;
}

describe("majority", () => {
  test("多数说了算；平局或空为 indeterminate", () => {
    expect(majority(["pass", "pass", "fail"])).toBe("pass");
    expect(majority(["fail", "indeterminate", "fail"])).toBe("fail");
    expect(majority(["pass", "fail", "indeterminate"])).toBe("indeterminate");
    expect(majority(["pass"])).toBe("pass");
    expect(majority([])).toBe("indeterminate");
  });
});

describe("renderScoreTable", () => {
  test("行是题，列是 CLI，表头带两个 SHA", () => {
    const t = renderScoreTable([
      { story: "10-a", client: "claude", verdict: "pass" },
      { story: "10-a", client: "omp", verdict: "fail" },
      { story: "20-b", client: "claude", verdict: "indeterminate" },
    ], "abc1234", "def5678");
    expect(t).toContain("规程 SHA：abc1234");
    expect(t).toContain("题库 SHA：def5678");
    expect(t).toContain("| 10-a | pass | fail |");
    expect(t).toContain("| 20-b | indeterminate | — |");
  });
});

test("defaultModel", () => {
  expect(defaultModel("claude")).toBe("claude-sonnet-5");
  expect(defaultModel("omp")).toBe("luna");
});

describe("scoreAll（假脚本）", () => {
  // 三次 replayOne 顺序跑，单个进程默认 5s 超时不够，放宽到 20s（同类跑法见 run.test.ts 单次调用耗时）。
  test("一道题、一个 CLI、跑三次：多数表决、两个 SHA、落两份汇总文件", async () => {
    const w = world();
    const turns = path.join(w.root, "turns.json");
    fs.writeFileSync(turns, JSON.stringify([{ text: "范围？", rows: [] }, { text: "好", rows: [] }]));
    process.env.SJ_AGENT_CMD = `node ${path.join(FAKE, "fake-claude.mjs")}`;
    process.env.FAKE_TURNS = turns;
    process.env.SJ_QA_CMD = `node ${path.join(FAKE, "fake-qa.mjs")}`;
    process.env.FAKE_QA_MAX = "2";
    process.env.SJ_JUDGE_CMD = `node ${fakeJudge(w.root, "pass")}`;
    try {
      const story = parseStory(fs.readFileSync(path.join(w.storyDir, "story.md"), "utf8"), w.storyDir);
      story.meta.commit = gitHead(path.join(w.root, "fixture-repo"));
      const r = await scoreAll({
        stories: [story], clients: ["claude"], runs: 3,
        candidate: w.candidate, promptFile: w.prompt, promptFileFor: () => w.prompt,
        qaModel: "q", judgeKind: "claude", keep: false,
        bankDir: w.bank, workspaceRoot: w.root, stateRoot: w.state, tmpRoot: w.tmp,
        hostClaudeDir: w.hostClaude, hostOmpDir: w.hostOmp, log: () => {},
      });
      expect(r.verdicts.length).toBe(3);
      expect(r.cells).toEqual([{ story: "10-fixture", client: "claude", verdict: "pass" }]);
      const candidateSha = gitHead(w.candidate);
      const bankSha = gitHead(path.join(w.root, "agent-config"));
      expect(r.table).toContain(`规程 SHA：${candidateSha}`);
      expect(r.table).toContain(`题库 SHA：${bankSha}`);
      const summaryMd = path.join(w.state, "replay", "summary.md");
      const summaryJson = path.join(w.state, "replay", "summary.json");
      expect(fs.existsSync(summaryMd)).toBe(true);
      expect(fs.existsSync(summaryJson)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(summaryJson, "utf8"));
      expect(parsed.runs).toBe(3);
      expect(parsed.verdicts.length).toBe(3);
    } finally {
      for (const k of ["SJ_AGENT_CMD", "FAKE_TURNS", "SJ_QA_CMD", "FAKE_QA_MAX", "SJ_JUDGE_CMD"]) delete process.env[k];
    }
  }, 20_000);
});
