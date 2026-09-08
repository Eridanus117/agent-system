// 状态文件：每次评分的产物落本机目录，不入仓（含主人原话）。
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Timeline } from "./types.ts";

export function stateDir(): string {
  return process.env.SJ_STATE_DIR ?? path.join(os.homedir(), ".agent-system-state", "session-judge");
}

/** 会话 id 有时来自外部数据（OMP 的 session id、文件名），可能带 `/`、`:` 这类文件名不安全字符；
 * 落盘前替换成 `_`，避免它被当成路径分隔符逃出 day 目录，或在 Windows 上是非法文件名字符。 */
function safeFileStem(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function writeState(t: Timeline, report: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(stateDir(), day);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${safeFileStem(t.id)}.md`);
  writeFileSync(file, report, "utf8");
  return file;
}
