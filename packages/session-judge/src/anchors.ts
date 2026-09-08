// 标准答案：主人亲手判的会话。它是评委的唯一锚，机器造不出来；不足十道时评分不算数。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client, Verdict } from "./types.ts";

export interface Anchor {
  id: string;
  client: Client;
  file: string;
  judgedAt: string;
  owner: Record<string, Verdict>;
  judge: Record<string, Verdict>;
}

export const ANCHOR_CELLS = ["M1", "M2", "M3", "M4", "J1", "J2", "J3", "J4"] as const;

function walkUpTo(start: string, marker: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, marker))) return path.join(dir, marker);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function anchorsDir(): string {
  if (process.env.SJ_ANCHORS_DIR) return process.env.SJ_ANCHORS_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const found = walkUpTo(here, path.join("agent-config", "80-agent配置", "60-回放题库"));
  if (!found) throw new Error("未设置 SJ_ANCHORS_DIR，也找不到 agent-config/80-agent配置/60-回放题库");
  return path.join(found, "锚样本");
}

export function saveAnchor(a: Anchor): string {
  const dir = anchorsDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${a.id}.json`);
  writeFileSync(file, JSON.stringify(a, null, 2) + "\n", "utf8");
  return file;
}

export function loadAnchors(): Anchor[] {
  const dir = anchorsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Anchor);
}

export function agreement(anchors: Anchor[]): { cells: number; matched: number; rate: number } {
  let cells = 0;
  let matched = 0;
  for (const a of anchors) {
    for (const c of ANCHOR_CELLS) {
      cells++;
      // 双方都判过且判决相同才算一致；任一方缺格（含双方都缺）都算不一致，不能让「都没判」冒充「判一样」。
      const o = a.owner[c];
      const j = a.judge[c];
      if (o !== undefined && j !== undefined && o === j) matched++;
    }
  }
  return { cells, matched, rate: cells ? matched / cells : 0 };
}

export function assertAnchorsReady(anchors: Anchor[], min = 10): void {
  if (anchors.length < min) throw new Error(`标准答案不足：现有 ${anchors.length} 道，至少 ${min} 道`);
}
