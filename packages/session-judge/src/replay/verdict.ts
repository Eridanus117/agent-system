// 回放评委：拿题的判据看时间线，出三值；机械检查是硬底，评委不能翻。
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JudgeRunner } from "../judge.ts";
import { renderTimeline } from "../timeline.ts";
import type { Client, Timeline } from "../types.ts";
import type { Usage } from "./agent-cli.ts";
import type { CheckOutcome } from "./check-verbs.ts";
import type { TranscriptLine } from "./qa.ts";

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

// 时间线里每句 agent 发言只截前 80 字（见 timeline.ts），像「题 40 停下那句是不是在问关键未知」
// 这类判「说了什么」的判据，光看时间线会把结尾的完整问句砍掉、误判成「只是总结」。
// 这里把完整对话（未截断）作为附加材料接在时间线后面，供评委核对具体文字；证据仍引用时间线的事件编号。
const TRANSCRIPT_TRUNCATE_LEN = 2000;

function truncateTranscriptText(s: string): string {
  return s.length > TRANSCRIPT_TRUNCATE_LEN ? s.slice(0, TRANSCRIPT_TRUNCATE_LEN) + "…（截断）" : s;
}

// transcript 按 run.ts 的写法总是「主人、agent、主人、agent……」成对出现；按对分轮编号。
function buildTranscriptSection(transcript: TranscriptLine[]): string {
  const lines: string[] = ["## 每轮的完整对话（主人的话与 agent 那一轮最后一段完整回复）", ""];
  let round = 0;
  for (let i = 0; i < transcript.length; i += 2) {
    const owner = transcript[i];
    const agent = transcript[i + 1];
    round++;
    lines.push(`### 第 ${round} 轮`);
    lines.push(`主人：${owner?.text ?? ""}`);
    if (agent) lines.push(`agent：${truncateTranscriptText(agent.text)}`);
  }
  return lines.join("\n").trim();
}

export function buildReplayPrompt(rubric: string, criterion: string, timelineText: string, transcript?: TranscriptLine[]): string {
  let out = rubric.replace("{{判据}}", criterion.trim()).trim() + "\n\n## 时间线\n\n" + timelineText.trim() + "\n";
  if (transcript && transcript.length > 0) out += "\n" + buildTranscriptSection(transcript) + "\n";
  return out;
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

export async function judgeReplay(t: Timeline, criterion: string, runner: JudgeRunner, transcript?: TranscriptLine[]): Promise<JudgeVerdict> {
  const prompt = buildReplayPrompt(loadReplayRubric(), criterion, renderTimeline(t), transcript);
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
