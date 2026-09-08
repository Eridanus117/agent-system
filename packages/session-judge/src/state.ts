// 状态文件：每次评分的产物落本机目录，不入仓（含主人原话）。
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Timeline } from "./types.ts";

export function stateDir(): string {
  return process.env.SJ_STATE_DIR ?? path.join(os.homedir(), ".agent-system-state", "session-judge");
}

export function writeState(t: Timeline, report: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(stateDir(), day);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${t.id}.md`);
  writeFileSync(file, report, "utf8");
  return file;
}
