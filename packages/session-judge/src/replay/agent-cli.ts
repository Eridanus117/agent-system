// 起被测 CLI 一轮：子进程（带超时）、两种输出解析、统一的 TurnResult。
// 探针（2026-09-09）证实的形状见计划 Global Constraints。
import { spawn, spawnSync } from "node:child_process";

export interface Usage { inputTokens: number; outputTokens: number; costUsd: number }
export interface TurnResult { text: string; sessionId: string; usage: Usage; raw: string }

export interface AgentCli {
  start(prompt: string): Promise<TurnResult>;
  resume(sessionId: string, prompt: string): Promise<TurnResult>;
  sessionFile(sessionId: string): string | null;
}

export interface RunResult { code: number | null; stdout: string; stderr: string; timedOut: boolean }

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUsd: a.costUsd + b.costUsd };
}

/** SJ_AGENT_CMD 整体替换可执行名（可含空格分隔的前置参数，如 `node fake.mjs`）；参数照传。 */
export function agentExecutable(defaultName: "claude" | "omp"): string {
  return process.env.SJ_AGENT_CMD ?? defaultName;
}

function killTree(pid: number): void {
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
  else try { process.kill(pid, "SIGKILL"); } catch { /* 已退出 */ }
}

export function runCommand(cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdin?: string; timeoutMs: number }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // cmd 可能是 "node fake.mjs" 这种带前置参数的形式：拆开首词当可执行名。
    const [exe, ...pre] = cmd.split(/\s+/);
    // 不走 shell：claude 与 omp 在 Windows 上都是 .exe（2026-09-09 `where` 查实），参数原样传，不用担心引号。
    const child = spawn(exe!, [...pre, ...args], { cwd: opts.cwd, env: opts.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; if (child.pid) killTree(child.pid); }, opts.timeoutMs);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
    child.stdin.on("error", () => {});
    if (opts.stdin !== undefined) child.stdin.end(opts.stdin); else child.stdin.end();
  });
}

export function parseClaudeResult(json: string): TurnResult {
  let j: Record<string, unknown>;
  try { j = JSON.parse(json.trim()); } catch { throw new Error(`被测 CLI 输出不是 JSON：${json.slice(0, 200)}`); }
  if (j.is_error) throw new Error(`被测 CLI 报错：${String(j.result ?? "").slice(0, 300)}`);
  const sessionId = String(j.session_id ?? "");
  if (!sessionId) throw new Error("被测 CLI 输出缺 session_id");
  const u = (j.usage ?? {}) as Record<string, number>;
  const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return { text: String(j.result ?? ""), sessionId, usage: { inputTokens, outputTokens: u.output_tokens ?? 0, costUsd: Number(j.total_cost_usd ?? 0) }, raw: json };
}

export function parseOmpEvents(jsonl: string): TurnResult {
  let sessionId = "";
  let text = "";
  let usage: Usage = ZERO_USAGE;
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type === "session") sessionId = String(row.id ?? "");
    if (row.type !== "turn_end") continue;
    const msg = (row.message ?? {}) as { content?: Array<{ type: string; text?: string }>; usage?: { input?: number; output?: number; cost?: { total?: number } } };
    const texts = (msg.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "");
    if (texts.length) text = texts.join("\n");
    usage = addUsage(usage, { inputTokens: msg.usage?.input ?? 0, outputTokens: msg.usage?.output ?? 0, costUsd: msg.usage?.cost?.total ?? 0 });
  }
  if (!sessionId) throw new Error("被测 CLI 输出里没有 session 行");
  return { text, sessionId, usage, raw: jsonl };
}
