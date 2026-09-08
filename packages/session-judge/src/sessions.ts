// 列最近会话：扫两个客户端的会话目录，按修改时间倒序。
import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "./types.ts";

export interface SessionFile { file: string; client: Client; mtime: Date }

/** 目录/文件条目可能在 readdir 之后、stat 之前消失，或本身是悬空符号链接／无权限项——
 * 逐项 try/catch，坏条目直接跳过，不让一个坏条目拖垮整次扫描。 */
function tryStat(p: string) {
  try { return statSync(p); } catch { return null; }
}
function tryReaddir(p: string): string[] {
  try { return readdirSync(p); } catch { return []; }
}

function scan(root: string, client: Client): SessionFile[] {
  if (!existsSync(root)) return [];
  const out: SessionFile[] = [];
  for (const d of tryReaddir(root)) {
    const dir = path.join(root, d);
    const dirStat = tryStat(dir);
    if (!dirStat?.isDirectory()) continue;
    for (const f of tryReaddir(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const file = path.join(dir, f);
      const fileStat = tryStat(file);
      if (!fileStat) continue;
      out.push({ file, client, mtime: fileStat.mtime });
    }
  }
  return out;
}

export function listSessions(latest: number): SessionFile[] {
  const claude = process.env.SJ_CLAUDE_DIR ?? path.join(os.homedir(), ".claude", "projects");
  const omp = process.env.SJ_OMP_DIR ?? path.join(os.homedir(), ".omp", "agent", "sessions");
  return [...scan(claude, "claude"), ...scan(omp, "omp")]
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    .slice(0, latest);
}
