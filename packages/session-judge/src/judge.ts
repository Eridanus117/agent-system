// 评委层：拼提示词、起外部评委、解析输出。评委只是顾问，机械检查不由它改。
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { runChecks } from "./checks.ts";
import { renderTimeline } from "./timeline.ts";
import { type CheckResult, type Timeline, type Verdict, VERDICTS } from "./types.ts";

const JUDGE_IDS = ["J1", "J2", "J3", "J4"] as const;

export function loadRubric(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "rubric", "default.md"), "utf8");
}

/** 渲染检查/判据表；heading 控制首列表头文字（机械检查用「检查」，评委判决用「判据」）。 */
export function renderMechanical(results: CheckResult[], heading = "检查"): string {
  const esc = (s: string) => s.replaceAll("|", "｜"); // 证据/说明里的竖线会破坏表格，换成全角
  const rows = results.map((r) => `| ${r.id} | ${r.verdict} | ${esc(r.evidence.length ? "事件 " + r.evidence.join("、") : "—")}${r.note ? "；" + esc(r.note) : ""} |`);
  return [`| ${heading} | 判决 | 证据 |`, "|---|---|---|", ...rows].join("\n");
}

export function buildPrompt(rubric: string, timelineText: string, mechanical: CheckResult[]): string {
  return [rubric.trim(), "", "## 机械检查结果（程序给出，不要改判）", "", renderMechanical(mechanical), "", "## 时间线", "", timelineText.trim()].join("\n") + "\n";
}

/** 解析评委表：四行齐、判决在四值内、证据非空才算合格。 */
export function parseVerdicts(text: string): CheckResult[] | null {
  const out: CheckResult[] = [];
  for (const id of JUDGE_IDS) {
    const m = text.match(new RegExp(`^\\s*\\|\\s*${id}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|`, "m"));
    if (!m) return null;
    const verdict = m[1] as Verdict;
    if (!VERDICTS.includes(verdict) || verdict === "需主人看") return null;
    const cell = m[2] ?? "";
    const evidence = [...cell.matchAll(/\d+/g)].map((x) => Number(x[0]));
    if (!cell.trim()) return null;
    const note = cell.replace(/^事件[\d、,，\s]+/, "").replace(/^[，,；;\s]+/, "").trim();
    out.push({ id, verdict, evidence, ...(note ? { note } : {}) });
  }
  return out;
}

export type JudgeRunner = (prompt: string) => Promise<string>;

/** 起外部评委进程，prompt 走 stdin。SJ_JUDGE_CMD 可整体覆盖（测试用）。 */
export function runnerFor(kind: "claude" | "omp"): JudgeRunner {
  const override = process.env.SJ_JUDGE_CMD;
  const cmd = override
    ? override
    : kind === "omp"
      ? "omp -p --no-skills"
      : "claude -p --model claude-haiku-4-5-20251001";
  return (prompt) => new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`评委进程退出 ${code}：${err.slice(0, 300)}`))));
    child.stdin.end(prompt);
  });
}

export interface JudgeOutcome {
  mechanical: CheckResult[];
  judged: CheckResult[] | null;
  raw: string;
  attempts: number;
}

export async function judgeTimeline(t: Timeline, runner: JudgeRunner): Promise<JudgeOutcome> {
  const mechanical = runChecks(t);
  const prompt = buildPrompt(loadRubric(), renderTimeline(t), mechanical);
  let raw = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    raw = await runner(prompt);
    const judged = parseVerdicts(raw);
    if (judged) return { mechanical, judged, raw, attempts: attempt };
  }
  return { mechanical, judged: null, raw, attempts: 2 };
}

export function renderReport(t: Timeline, o: JudgeOutcome, judgeName: string): string {
  const judgedTable = o.judged
    ? renderMechanical(o.judged, "判据")
    : `评委失败（重试 ${o.attempts} 次，输出不合格式）。原文：\n\n${o.raw.trim()}`;
  return [
    `# 评分：会话 ${t.id}（${t.client}）`, "",
    `评委：${judgeName}；时间：${new Date().toISOString()}`, "",
    "## 机械检查", "", renderMechanical(o.mechanical), "",
    "## 评委判决", "", judgedTable, "",
    "## 时间线", "", renderTimeline(t).trim(), "",
  ].join("\n");
}
