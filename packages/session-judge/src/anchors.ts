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
  // 标记目录用已经存在的 agent-config/80-agent配置；60-回放题库/锚样本 是它下面还没建的子目录，
  // loadAnchors 遇到不存在的目录会当成「零标准答案」，不需要它预先存在。
  const found = walkUpTo(here, path.join("agent-config", "80-agent配置"));
  if (!found) throw new Error("未设置 SJ_ANCHORS_DIR，也找不到 agent-config/80-agent配置");
  return path.join(found, "60-回放题库", "锚样本");
}

/** 标准答案是主人亲手判的，覆盖会丢掉之前的判断；默认拒绝覆盖已存在的同 id 文件，
 * 传 force=true（对应 CLI 的 `--force`）才允许覆盖。 */
export function saveAnchor(a: Anchor, force = false): string {
  const dir = anchorsDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${a.id}.json`);
  if (existsSync(file) && !force) {
    throw new Error(`已有标准答案：${file}；要覆盖请加 --force`);
  }
  writeFileSync(file, JSON.stringify(a, null, 2) + "\n", "utf8");
  return file;
}

export function loadAnchors(): Anchor[] {
  const dir = anchorsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    const full = path.join(dir, f);
    try {
      return JSON.parse(readFileSync(full, "utf8")) as Anchor;
    } catch {
      // JSON.parse 失败说明文件损坏（截断写入、手改坏了等）；报出具体文件名，不吞掉、不让整批读取悄悄失败。
      throw new Error(`标准答案文件损坏：${full}`);
    }
  });
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
