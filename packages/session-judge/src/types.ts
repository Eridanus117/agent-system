// 时间线的数据形状。所有解析器都产出 RawEvent，timeline.ts 负责编号与渲染。

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

export type EventTag = "push" | "test";

export interface RawEvent {
  at: string;          // ISO 时间
  kind: EventKind;
  text: string;        // 发言正文、命令、工具名等，已截断
  path?: string;       // write / edit 的目标
  skill?: string;      // skill 名
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

/** 命令标记：push/merge 与测试运行。 */
export function tagCommand(command: string): EventTag[] {
  const tags: EventTag[] = [];
  if (/\bgit push\b|\bgh pr merge\b/.test(command)) tags.push("push");
  if (/\.test\.|\bnode --test\b|\bbun test\b|\bnpm test\b|\bpytest\b|\bvitest\b/.test(command)) tags.push("test");
  return tags;
}

/** 截断并压平空白。 */
export function short(s: unknown, max: number): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
