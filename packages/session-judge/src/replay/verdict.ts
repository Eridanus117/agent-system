// 回放评委：拿题的判据看时间线，出三值；机械检查是硬底，评委不能翻。
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JudgeRunner } from "../judge.ts";
import { renderTimeline } from "../timeline.ts";
import type { Client, Timeline } from "../types.ts";
import type { Usage } from "./agent-cli.ts";
import type { CheckOutcome } from "./check-verbs.ts";

export type Three = "pass" | "fail" | "indeterminate";
const THREE: Three[] = ["pass", "fail", "indeterminate"];

export interface JudgeVerdict { verdict: Three; evidence: number[]; note: string }

export interface Verdict {
  story: string;
  client: Client;
  verdict: Three;
  mechanical: CheckOutcome[];
  judge: JudgeVerdict | null;
  turns: number;
  usage: Usage;
  candidateSha: string;
  bankSha: string;
  runDir: string;
  reason?: string;
}

export function loadReplayRubric(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "..", "rubric", "replay.md"), "utf8");
}

export function buildReplayPrompt(rubric: string, criterion: string, timelineText: string): string {
  return rubric.replace("{{判据}}", criterion.trim()).trim() + "\n\n## 时间线\n\n" + timelineText.trim() + "\n";
}

export function parseReplayVerdict(text: string): JudgeVerdict | null {
  const v = text.match(/^\s*判决[：:]\s*(\w+)/m);
  const e = text.match(/^\s*证据[：:]\s*(.+)$/m);
  const n = text.match(/^\s*说明[：:]\s*(.+)$/m);
  if (!v || !e) return null;
  const verdict = v[1] as Three;
  if (!THREE.includes(verdict)) return null;
  const evidence = [...(e[1] ?? "").matchAll(/\d+/g)].map((x) => Number(x[0]));
  return { verdict, evidence, note: (n?.[1] ?? "").trim() };
}

export async function judgeReplay(t: Timeline, criterion: string, runner: JudgeRunner): Promise<JudgeVerdict> {
  const prompt = buildReplayPrompt(loadReplayRubric(), criterion, renderTimeline(t));
  let raw = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    raw = await runner(prompt);
    const v = parseReplayVerdict(raw);
    if (v) return v;
  }
  return { verdict: "indeterminate", evidence: [], note: `评委两次输出都不合格式：${raw.trim().slice(0, 200)}` };
}

export function combine(mechanical: CheckOutcome[], judge: JudgeVerdict | null): Three {
  if (mechanical.some((m) => !m.pass)) return "fail";
  if (!judge) return "indeterminate";
  return judge.verdict;
}
