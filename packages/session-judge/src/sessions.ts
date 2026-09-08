// 列最近会话：扫两个客户端的会话目录，按修改时间倒序。
import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "./types.ts";

export interface SessionFile { file: string; client: Client; mtime: Date }

function scan(root: string, client: Client): SessionFile[] {
  if (!existsSync(root)) return [];
  const out: SessionFile[] = [];
  for (const d of readdirSync(root)) {
    const dir = path.join(root, d);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const file = path.join(dir, f);
      out.push({ file, client, mtime: statSync(file).mtime });
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
