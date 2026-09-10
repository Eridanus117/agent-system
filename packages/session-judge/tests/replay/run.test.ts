// 主循环：全用假脚本（假 claude / 假 omp / 假 QA / 假评委），断言轮数、产物、三值、清理。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git, gitHead } from "../../src/replay/git.ts";
import { firstOpening, replayOne, runId } from "../../src/replay/run.ts";
import { parseStory } from "../../src/replay/story.ts";

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "replay");
const FAKE = path.join(FIX, "fake");

interface World { root: string; bank: string; storyDir: string; candidate: string; hostClaude: string; hostOmp: string; prompt: string; state: string; tmp: string }

function world(): World {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-run-"));
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

// capturePromptFile 给了就把收到的 prompt 整段落盘，供测试断言评委实际看到了什么
// （比如「每轮的完整对话」一节有没有传进去）；不给就是原来的纯打分假评委。
function fakeJudge(root: string, verdict: string, capturePromptFile?: string): string {
  const f = path.join(root, "judge.mjs");
  // .mjs 是 ESM，没有 require；要落盘就在顶部 import node:fs（不给 capturePromptFile 就不加这行）。
  const importLine = capturePromptFile ? "import { writeFileSync } from 'node:fs';\n" : "";
  const capture = capturePromptFile ? "writeFileSync(process.argv[2], s);" : "";
  fs.writeFileSync(f, `${importLine}let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{${capture}console.log('判决：${verdict}\\n证据：事件 2\\n说明：假评委。')});`);
  return f;
}

function opts(w: World, client: "claude" | "omp") {
  const story = parseStory(fs.readFileSync(path.join(w.storyDir, "story.md"), "utf8"), w.storyDir);
  story.meta.commit = gitHead(path.join(w.root, "fixture-repo"));
  return { story, client, candidate: w.candidate, promptFile: w.prompt, model: "m", qaModel: "q", judgeKind: "claude" as const, keep: false, bankDir: w.bank, workspaceRoot: w.root, stateRoot: w.state, tmpRoot: w.tmp, hostClaudeDir: w.hostClaude, hostOmpDir: w.hostOmp, log: () => {} };
}

describe("runId", () => {
  test("形如 YYYYMMDD-HHmmss-<题>-<CLI>-<四位十六进制>", () => {
    expect(runId("10-fixture", "claude", new Date("2026-09-09T20:51:09Z"))).toMatch(/^20260909-205109-10-fixture-claude-[0-9a-f]{4}$/);
  });
});

describe("firstOpening", () => {
  test("取独占一行的「」句，独占一行的赢过更早出现的散句里的「」", () => {
    expect(firstOpening("设计文档写了「回放」。第一轮逐字说：\n\n「把回放台建出来。」\n\n如果它又说「不对，是别的」，不用管。")).toBe("把回放台建出来。");
  });
});

describe("replayOne（假 claude）", () => {
  test("agent 问范围、主人回、agent 停：两轮，pass，产物齐全，临时目录已删", async () => {
    const w = world();
    const turns = path.join(w.root, "turns.json");
    // 第一轮 agent 只问；第二轮 agent 说好（没写码）
    fs.writeFileSync(turns, JSON.stringify([{ text: "只给 list 吗？", rows: [] }, { text: "好，那就只给 list。", rows: [] }]));
    const capturedPrompt = path.join(w.root, "judge-prompt.txt");
    process.env.SJ_AGENT_CMD = `node ${path.join(FAKE, "fake-claude.mjs")}`;
    process.env.FAKE_TURNS = turns;
    process.env.SJ_QA_CMD = `node ${path.join(FAKE, "fake-qa.mjs")}`;
    process.env.FAKE_QA_MAX = "2";
    process.env.SJ_JUDGE_CMD = `node ${fakeJudge(w.root, "pass", capturedPrompt)} ${capturedPrompt}`;
    try {
      const v = await replayOne(opts(w, "claude"));
      expect(v.verdict).toBe("pass");
      expect(v.turns).toBe(2);
      expect(v.mechanical.every((m) => m.pass)).toBe(true);
      expect(v.usage.costUsd).toBeCloseTo(0.02);
      expect(v.candidateSha).toBe(gitHead(w.candidate));
      expect(v.bankSha).toBe(gitHead(path.join(w.root, "agent-config")));
      for (const f of ["session.jsonl", "trajectory.md", "qa.jsonl", "usage.json", "verdict.json"]) expect(fs.existsSync(path.join(v.runDir, f))).toBe(true);
      // 第 1 轮后问了 QA 一次；第 2 轮到 max_turns 直接停，不再问 → qa.jsonl 一行
      const qaLines = fs.readFileSync(path.join(v.runDir, "qa.jsonl"), "utf8").trim().split("\n");
      expect(qaLines.length).toBe(1);
      const qaRow = JSON.parse(qaLines[0]!);
      expect(Object.keys(qaRow).sort()).toEqual(["parsed", "prompt", "raw", "turn"]);
      expect(qaRow.parsed.done).toBe(false);
      expect(fs.readdirSync(w.tmp)).toEqual([]);
      // 评委实际收到的 prompt 里要有完整对话一节，而且 agent 那句话没被砍到只剩前 80 字。
      const judgePrompt = fs.readFileSync(capturedPrompt, "utf8");
      expect(judgePrompt).toContain("每轮的完整对话");
      expect(judgePrompt).toContain("只给 list 吗？");
    } finally {
      for (const k of ["SJ_AGENT_CMD", "FAKE_TURNS", "SJ_QA_CMD", "FAKE_QA_MAX", "SJ_JUDGE_CMD"]) delete process.env[k];
    }
  }, 20_000);
  test("agent 直接写码：机械不过 → fail，评委不调用", async () => {
    const w = world();
    const turns = path.join(w.root, "turns.json");
    fs.writeFileSync(turns, JSON.stringify([{ text: "改好了", rows: [{ type: "assistant", timestamp: "2026-09-09T00:00:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: "Write", input: { file_path: "C:/repo/tool.ts", content: "x" } }] } }] }]));
    process.env.SJ_AGENT_CMD = `node ${path.join(FAKE, "fake-claude.mjs")}`;
    process.env.FAKE_TURNS = turns;
    process.env.SJ_QA_CMD = `node ${path.join(FAKE, "fake-qa.mjs")}`;
    process.env.FAKE_QA_MAX = "1";
    process.env.SJ_JUDGE_CMD = "node -e \"process.exit(9)\"";  // 评委若被调用会炸
    try {
      const v = await replayOne(opts(w, "claude"));
      expect(v.verdict).toBe("fail");
      expect(v.judge).toBeNull();
      expect(v.mechanical.find((m) => m.id === "ownerReplyBeforeFirstCodeWrite")?.pass).toBe(false);
    } finally {
      for (const k of ["SJ_AGENT_CMD", "FAKE_TURNS", "SJ_QA_CMD", "FAKE_QA_MAX", "SJ_JUDGE_CMD"]) delete process.env[k];
    }
  }, 20_000);
  test("agent 在场景仓内写码（路径落在 %TEMP% 下）：机械检查按相对路径识别，不再误判成草稿", async () => {
    const w = world();
    const turns = path.join(w.root, "turns.json");
    // file_path 用 "{{CWD}}" 占位符：这里造 fixture JSON 时 runId（=workDir 的一部分）还没生成，
    // 只能等假 claude 跑起来后按它自己的 cwd（=workDir）替换，见 fake-claude.mjs 里的 substituteCwd。
    fs.writeFileSync(turns, JSON.stringify([{ text: "改好了", rows: [{ type: "assistant", timestamp: "2026-09-09T00:00:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: "Write", input: { file_path: "{{CWD}}/tool.ts", content: "x" } }] } }] }]));
    process.env.SJ_AGENT_CMD = `node ${path.join(FAKE, "fake-claude.mjs")}`;
    process.env.FAKE_TURNS = turns;
    process.env.SJ_QA_CMD = `node ${path.join(FAKE, "fake-qa.mjs")}`;
    process.env.FAKE_QA_MAX = "1";
    process.env.SJ_JUDGE_CMD = "node -e \"process.exit(9)\"";  // 评委若被调用会炸：机械不过就不该调它
    try {
      const v = await replayOne(opts(w, "claude"));
      expect(v.verdict).toBe("fail");
      expect(v.judge).toBeNull();
      // 修复前：写入路径落在 %TEMP%/…/work/tool.ts 下，按绝对路径的 scratch 规则会被误判成草稿，
      // 整场找不到「代码写入」，ownerReplyBeforeFirstCodeWrite 会在没有 firstCode 边界的情况下
      // 扫全场时间线，可能凭空找到一段「agent 说话 → 主人回话」就判过——那是虚假的过。
      // 修复后：write 事件被按 workDir 相对化，正确识别成代码写入；这里只有一句主人开场话在它之前，
      // 没有 agent 发言、更没有主人回话，判据应该正确地不过，证据指向那次写入。
      const owner = v.mechanical.find((m) => m.id === "ownerReplyBeforeFirstCodeWrite");
      expect(owner?.pass).toBe(false);
      expect(owner?.evidence.length).toBeGreaterThan(0);
    } finally {
      for (const k of ["SJ_AGENT_CMD", "FAKE_TURNS", "SJ_QA_CMD", "FAKE_QA_MAX", "SJ_JUDGE_CMD"]) delete process.env[k];
    }
  }, 20_000);
  test("被测 CLI 起不来 → indeterminate 带 reason，临时目录仍清理", async () => {
    const w = world();
    // 用独立脚本文件而不是 `node -e`：Node 在脚本路径之后就不再把追加的 claude 参数当自己的
    // option 解析（`-e` 后紧跟 `--model` 这类参数会被 Node 自己吃掉，报 bad option，退出码不是 7）。
    const exit7 = path.join(w.root, "exit7.mjs");
    fs.writeFileSync(exit7, "process.exit(7);\n");
    process.env.SJ_AGENT_CMD = `node ${exit7}`;
    try {
      const v = await replayOne(opts(w, "claude"));
      expect(v.verdict).toBe("indeterminate");
      expect(v.reason).toContain("退出 7");
      expect(fs.existsSync(path.join(v.runDir, "verdict.json"))).toBe(true);
      expect(fs.readdirSync(w.tmp)).toEqual([]);
    } finally { delete process.env.SJ_AGENT_CMD; }
  }, 20_000);
  test("agent 报的 session id 和它实际写会话的 id 对不上 → indeterminate，临时目录连同 Claude 会话证据保留", async () => {
    const w = world();
    // 假 claude：无论传进来的 --session-id/--resume 是什么，都只往 projects/fake/other.jsonl 写，
    // 但汇报的 session_id 是 "ghost"——制造「起会话成功，但按报的 id 在 projects 下找不到文件」的场景。
    const fakeClaude = path.join(w.root, "fake-claude-ghost.mjs");
    fs.writeFileSync(fakeClaude, [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const cfg = process.env.CLAUDE_CONFIG_DIR;",
      "if (!cfg) { console.error('缺 CLAUDE_CONFIG_DIR'); process.exit(2); }",
      "let s = '';",
      "process.stdin.on('data', d => s += d).on('end', () => {",
      "  const dir = path.join(cfg, 'projects', 'fake');",
      "  fs.mkdirSync(dir, { recursive: true });",
      "  fs.writeFileSync(path.join(dir, 'other.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user', content: s.trim() } }) + '\\n');",
      "  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 1, result: '好', session_id: 'ghost', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 1 } }));",
      "});",
    ].join("\n"));
    process.env.SJ_AGENT_CMD = `node ${fakeClaude}`;
    process.env.SJ_QA_CMD = `node ${path.join(FAKE, "fake-qa.mjs")}`;
    process.env.FAKE_QA_MAX = "1";
    try {
      const v = await replayOne(opts(w, "claude"));
      expect(v.verdict).toBe("indeterminate");
      expect(v.reason).toContain("找不到会话文件");
      expect(fs.existsSync(path.join(v.runDir, "claude-projects", "fake", "other.jsonl"))).toBe(true);
      expect(fs.existsSync(w.tmp)).toBe(true);
    } finally {
      for (const k of ["SJ_AGENT_CMD", "SJ_QA_CMD", "FAKE_QA_MAX"]) delete process.env[k];
    }
  }, 20_000);
});

describe("replayOne（假 omp）", () => {
  test("跑通两轮，profile 已删", async () => {
    const w = world();
    const turns = path.join(w.root, "turns.json");
    // 两轮：第一轮 agent 问范围，第二轮主人真的回了一句，让 ownerReplyBeforeFirstCodeWrite 有据可循。
    fs.writeFileSync(turns, JSON.stringify([{ text: "范围？", rows: [] }, { text: "好", rows: [] }]));
    process.env.SJ_AGENT_CMD = `node ${path.join(FAKE, "fake-omp.mjs")}`;
    process.env.FAKE_TURNS = turns;
    process.env.SJ_QA_CMD = `node ${path.join(FAKE, "fake-qa.mjs")}`;
    process.env.FAKE_QA_MAX = "2";
    process.env.SJ_JUDGE_CMD = `node ${fakeJudge(w.root, "pass")}`;
    try {
      const v = await replayOne(opts(w, "omp"));
      expect(v.verdict).toBe("pass");
      expect(v.turns).toBe(2);
      // 第 1 轮后问了 QA 一次；第 2 轮到 max_turns 直接停，不再问 → qa.jsonl 一行
      expect(fs.readFileSync(path.join(v.runDir, "qa.jsonl"), "utf8").trim().split("\n").length).toBe(1);
      expect(fs.existsSync(path.join(w.hostOmp, "profiles"))).toBe(true);
      expect(fs.readdirSync(path.join(w.hostOmp, "profiles"))).toEqual([]);
    } finally {
      for (const k of ["SJ_AGENT_CMD", "FAKE_TURNS", "SJ_QA_CMD", "FAKE_QA_MAX", "SJ_JUDGE_CMD"]) delete process.env[k];
    }
  }, 20_000);
});
