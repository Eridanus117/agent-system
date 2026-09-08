// 时间线的数据形状。所有解析器都产出 RawEvent，timeline.ts 负责编号与渲染。
import { WRITE_REDIRECT } from "./shell-classify.ts";

export type EventKind =
  | "owner"       // 主人发言
  | "agent-text"  // agent 发言（前 80 字）
  | "skill"       // 调用 skill
  | "write"       // 写文件
  | "edit"        // 改文件
  | "shell"       // 跑命令
  | "subagent"    // 派子代理
  | "ask"         // 向主人提问
  | "tool";       // 其它工具

export type EventTag = "push" | "test" | "write";

export interface RawEvent {
  at: string;          // ISO 时间
  kind: EventKind;
  text: string;        // 发言正文、命令、工具名等，已截断（渲染用）
  path?: string;       // write / edit 的目标
  skill?: string;      // skill 名
  command?: string;    // shell 事件的完整命令，不截断（机械检查用；渲染仍用 text）
  tags: EventTag[];
}

export interface Event extends RawEvent {
  n: number;           // 时间线内编号，从 1 起
}

export type Client = "claude" | "omp";

export interface Timeline {
  id: string;
  client: Client;
  events: Event[];
}

export type Verdict = "符合" | "不符合" | "不适用" | "判不了" | "需主人看";
export const VERDICTS: Verdict[] = ["符合", "不符合", "不适用", "判不了", "需主人看"];

export interface CheckResult {
  id: string;          // M1..M5 或 J1..J4
  verdict: Verdict;
  evidence: number[];  // 事件编号
  note?: string;       // 一句说明
}

// 重定向识别正则 WRITE_REDIRECT 挪去了 shell-classify.ts，此处只 import 复用——
// 与 shellWriteTarget 共用同一份，避免命令里多个 `>` 时两处认出不同目标（见该文件顶部说明）。
const WRITE_CALL = /\bsed\s+-i\b|\btee\s+|writeFileSync\(/;

/** 命令标记：push/merge、测试运行、写文件（重定向 / sed -i / tee / writeFileSync）。 */
export function tagCommand(command: string): EventTag[] {
  const tags: EventTag[] = [];
  if (/\bgit push\b|\bgh pr merge\b/.test(command)) tags.push("push");
  if (/\.test\.|\bnode --test\b|\bbun test\b|\bnpm test\b|\bpytest\b|\bvitest\b/.test(command)) tags.push("test");
  if (WRITE_REDIRECT.test(command) || WRITE_CALL.test(command)) tags.push("write");
  return tags;
}

/** 截断并压平空白。 */
export function short(s: unknown, max: number): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
