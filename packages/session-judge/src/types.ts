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

/** 重定向／原地编辑／写文件调用：真写文件。
 * 排除两类假阳性：(1) `=>`/`->`/`2>`/`2>&1`/`&>`/`1>` 这类不是「重定向到文件」的写法——`>` 前一个字符
 *   是 `=`/`-`/`<`/`2`/`&`/`1` 时不算；(2) `>` 后面（跳过空白）不像路径或引号的写法（比如比较运算符
 *   `x > 5` 里的 `5`）——要求紧跟着的 token 以引号/`/`/`.`/`~`/`$`/盘符（`C:`）开头，或是一个含 `/`／`.`
 *   的普通词（如 `out.txt`），并且不是写 /dev/null。 */
const WRITE_REDIRECT = /(?<![=\-<2&1])>>?(?!\s*\/dev\/null)(?=\s*(?:['"]|[/.~$]|[A-Za-z]:|\w[^\s]*[/.]))/;
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
