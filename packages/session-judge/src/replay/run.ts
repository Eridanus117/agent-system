// 一题一 CLI 的主循环：造场景 → 隔离环境 → 一轮轮跑（被测 CLI ↔ QA agent）→ 时间线 → 机械动词 → 评委 → 三值 → 落盘 → 清理。
// 任何一步抛错都收成 indeterminate 带 reason；凭证副本无论成败都删。
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { runnerFor } from "../judge.ts";
import { loadTimeline, renderTimeline } from "../timeline.ts";
import type { Client, Timeline } from "../types.ts";
import { type AgentCli, type Usage, ZERO_USAGE, addUsage } from "./agent-cli.ts";
import { type CheckOutcome, verbsFor } from "./check-verbs.ts";
import { gitHead, showRef } from "./git.ts";
import { claudeCli, prepareClaudeHome, removeClaudeHome } from "./isolate-claude.ts";
import { ompCli, prepareOmpProfile, removeOmpProfile } from "./isolate-omp.ts";
import { type TranscriptLine, nextQaTurn, qaRunner } from "./qa.ts";
import { assertOriginIsBare, bareDirOf, setupVerbsFor } from "./setup-verbs.ts";
import { type Story, loadStoryModules } from "./story.ts";
import { type JudgeVerdict, type Verdict, combine, judgeReplay } from "./verdict.ts";

export interface RunOptions {
  story: Story;
  client: Client;
  candidate: string;
  promptFile: string;
  model: string;
  qaModel: string;
  judgeKind: "claude" | "omp";
  keep: boolean;
  bankDir: string;
  workspaceRoot: string;
  stateRoot: string;
  tmpRoot: string;
  hostClaudeDir?: string;
  hostOmpDir?: string;
  /** 整轮跑时按 CLI 换共用提示词（Claude 用 CLAUDE.md，OMP 用 AGENTS.md）；不给就用 promptFile。 */
  promptFileFor?: (client: Client) => string;
  log?: (s: string) => void;
}

export function runId(storyId: string, client: Client, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  // 秒级时间戳撞车（比如 --runs 3 三次连着跑）会覆盖自己的 runDir/tmpDir，加四位随机十六进制后缀避免。
  const suffix = randomBytes(2).toString("hex");
  return `${stamp}-${storyId}-${client}-${suffix}`;
}

function firstLine(s: string): string {
  return s.split("\n")[0]?.trim() ?? "";
}

export async function replayOne(o: RunOptions): Promise<Verdict> {
  const log = o.log ?? (() => {});
  const id = runId(o.story.meta.id, o.client);
  const runDir = path.join(o.stateRoot, "replay", id);
  const tmpDir = path.join(o.tmpRoot, id);
  const workDir = path.join(tmpDir, "work");
  mkdirSync(runDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const base: Verdict = {
    story: o.story.meta.id, client: o.client, verdict: "indeterminate", mechanical: [], judge: null, turns: 0,
    usage: ZERO_USAGE, candidateSha: safeHead(o.candidate), bankSha: safeHead(o.bankDir), runDir,
  };
  const cleanups: Array<() => void> = [];
  let sessionCopied = false;
  let sessionId = "";
  let claudeConfigDir: string | undefined;
  const promptFile = o.promptFileFor?.(o.client) ?? o.promptFile;
  // Ctrl-C／被杀（SIGINT/SIGTERM）不会走 finally：这里单独兜底，跑一遍已注册的清理再退出，
  // 避免半途留下凭证副本（临时 CLAUDE_CONFIG_DIR／OMP profile）。finally 里会移除这两个监听。
  const onSignal = () => {
    for (const c of cleanups) { try { c(); } catch { /* 清理失败不影响退出 */ } }
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    // 1. 造场景
    const { setup, checks } = await loadStoryModules(o.story);
    const verbs = setupVerbsFor({ runDir: tmpDir, workDir, workspaceRoot: o.workspaceRoot, meta: o.story.meta });
    await (setup as (v: typeof verbs) => unknown)(verbs);
    const bare = bareDirOf(tmpDir);
    assertOriginIsBare(workDir, bare);
    const refsBefore = showRef(bare);

    // 2. 隔离环境
    let cli: AgentCli;
    const timeoutMs = o.story.meta.turn_timeout_min * 60_000;
    if (o.client === "claude") {
      const env = prepareClaudeHome({ tmpDir, candidate: o.candidate, promptFile, ...(o.hostClaudeDir ? { hostConfigDir: o.hostClaudeDir } : {}) });
      claudeConfigDir = env.configDir;
      cleanups.push(() => removeClaudeHome(env));
      cli = claudeCli(env, { model: o.model, workDir, timeoutMs });
    } else {
      const env = prepareOmpProfile({ name: `sj-${id}`, tmpDir, candidate: o.candidate, promptFile, workDir, ...(o.hostOmpDir ? { hostOmpDir: o.hostOmpDir } : {}) });
      cleanups.push(() => removeOmpProfile(env));
      cli = ompCli(env, { model: o.model, workDir, timeoutMs });
    }

    // 3–5. 一轮轮跑
    const opening = firstOpening(o.story.script);
    const transcript: TranscriptLine[] = [];
    const qaLog: string[] = [];
    let usage: Usage = ZERO_USAGE;
    let turns = 0;
    let next = opening;
    const qa = qaRunner(o.qaModel);
    while (true) {
      turns++;
      log(`第 ${turns} 轮：主人「${firstLine(next).slice(0, 40)}」`);
      transcript.push({ role: "owner", text: next });
      const r = sessionId ? await cli.resume(sessionId, next) : await cli.start(next);
      sessionId = r.sessionId;
      usage = addUsage(usage, r.usage);
      transcript.push({ role: "agent", text: r.text });
      // 每轮收到结果就立刻记，不等循环跑完：后面某一轮再抛错的话，verdict.json 也能报出已经跑完的轮数与花费。
      base.turns = turns;
      base.usage = usage;
      if (turns >= o.story.meta.max_turns) break;
      const q = await nextQaTurn(qa, o.story.script, transcript);
      qaLog.push(JSON.stringify({ turn: turns, prompt: q.prompt, raw: q.raw, parsed: { done: q.done, reply: q.reply, reason: q.reason, parseFailed: q.parseFailed } }));
      if (q.done || !q.reply) break;
      next = q.reply;
    }
    writeFileSync(path.join(runDir, "qa.jsonl"), qaLog.length ? qaLog.join("\n") + "\n" : "");
    writeFileSync(path.join(runDir, "usage.json"), JSON.stringify(usage, null, 2) + "\n");

    // 6. 收会话、时间线
    const sessionFile = cli.sessionFile(sessionId);
    if (!sessionFile) throw new Error(`找不到会话文件（session ${sessionId}）`);
    copyFileSync(sessionFile, path.join(runDir, "session.jsonl"));
    sessionCopied = true;
    const t: Timeline = loadTimeline(path.join(runDir, "session.jsonl"));
    writeFileSync(path.join(runDir, "trajectory.md"), renderTimeline(t));

    // 判分
    const remoteMoved = showRef(bare) !== refsBefore;
    const mechanical = (checks as (v: ReturnType<typeof verbsFor>) => CheckOutcome[])(verbsFor(t, remoteMoved));
    base.mechanical = mechanical;
    let judge: JudgeVerdict | null = null;
    if (mechanical.every((m) => m.pass)) judge = await judgeReplay(t, o.story.criterion, runnerFor(o.judgeKind));
    base.judge = judge;
    base.verdict = combine(mechanical, judge);
  } catch (err) {
    base.verdict = "indeterminate";
    base.reason = (err as Error).message;
    log(`出错：${base.reason}`);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    // 只有「agent 跑了、却找不到会话文件」这种情况保留临时目录供查（等同 --keep）；起不来、造场景失败都照删。
    const keepForInspection = !sessionCopied && sessionId !== "";
    // Claude 的会话证据落在 configDir/projects 下，不在 tmpDir 里；cleanups 里的 removeClaudeHome
    // 会把整个 configDir（包括 projects）一起删掉。要保留证据就得在清理跑之前，先把 projects 拷到
    // runDir，不能指望「跳过删 tmpDir」能保住它。
    if (keepForInspection && o.client === "claude" && claudeConfigDir) {
      const projectsDir = path.join(claudeConfigDir, "projects");
      try {
        if (existsSync(projectsDir)) cpSync(projectsDir, path.join(runDir, "claude-projects"), { recursive: true });
      } catch { /* 证据保留尽力而为，不能掩盖主错误、不能跳过凭证清理 */ }
    }
    for (const c of cleanups) { try { c(); } catch { /* 清理失败不掩盖主错误 */ } }
    if (!o.keep && !keepForInspection) rmSync(tmpDir, { recursive: true, force: true });
    writeFileSync(path.join(runDir, "verdict.json"), JSON.stringify(base, null, 2) + "\n");
  }
  return base;
}

function safeHead(dir: string): string {
  try { return gitHead(dir); } catch { return "unknown"; }
}

/** 剧本里第一句原话：取第一对「」里的内容；没有就整段剧本的第一行。 */
export function firstOpening(script: string): string {
  const m = script.match(/「([\s\S]*?)」/);
  return (m?.[1] ?? firstLine(script)).trim();
}
