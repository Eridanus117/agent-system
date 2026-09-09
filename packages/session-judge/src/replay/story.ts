// 读题：一道题 = story.md（frontmatter + 剧本 + 「## 验收判据」）+ setup.ts + checks.ts。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Client } from "../types.ts";

export interface StoryMeta {
  id: string;
  title: string;
  tier: "small" | "medium" | "large" | "negative";
  clients: Client[];
  max_turns: number;
  turn_timeout_min: number;
  repo: string;
  commit: string;
  status: "ready" | "draft";
}

export interface Story {
  dir: string;
  meta: StoryMeta;
  script: string;     // 给 QA agent 的剧本（判据之前的正文）
  criterion: string;  // 主人写的一句判据（只给评委）
}

const TIERS = ["small", "medium", "large", "negative"];
const CLIENTS = ["claude", "omp"];
const STATUSES = ["ready", "draft"];

function scalar(v: string): unknown {
  const s = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s.replace(/^["']|["']$/g, "");
}

/** 只认 YAML 的一个小子集：`key: 标量` 与 `key: [a, b]`。够题头用，不引依赖。 */
export function parseFrontmatter(md: string): { meta: Record<string, unknown>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error("题文件缺 frontmatter（--- 包起来的头）");
  const meta: Record<string, unknown> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (!kv) continue;
    const [, k, raw] = kv;
    const v = (raw ?? "").trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      meta[k!] = v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean).map(scalar);
    } else {
      meta[k!] = scalar(v);
    }
  }
  return { meta, body: (m[2] ?? "").trim() };
}

function need<T>(meta: Record<string, unknown>, key: string, ok: (v: unknown) => v is T): T {
  const v = meta[key];
  if (!ok(v)) throw new Error(`题头字段 ${key} 缺失或不合法：${JSON.stringify(v)}`);
  return v;
}

export function parseStory(md: string, dir: string): Story {
  const { meta, body } = parseFrontmatter(md);
  const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
  const isNum = (v: unknown): v is number => typeof v === "number" && v > 0;
  const m: StoryMeta = {
    id: need(meta, "id", isStr),
    title: need(meta, "title", isStr),
    tier: need(meta, "tier", (v): v is StoryMeta["tier"] => isStr(v) && TIERS.includes(v)),
    clients: need(meta, "clients", (v): v is Client[] => Array.isArray(v) && v.length > 0 && v.every((c) => CLIENTS.includes(String(c)))),
    max_turns: need(meta, "max_turns", isNum),
    turn_timeout_min: need(meta, "turn_timeout_min", isNum),
    repo: need(meta, "repo", isStr),
    commit: need(meta, "commit", isStr),
    status: need(meta, "status", (v): v is StoryMeta["status"] => isStr(v) && STATUSES.includes(v)),
  };
  const idx = body.search(/^## 验收判据\s*$/m);
  if (idx < 0) throw new Error("题正文缺「## 验收判据」一节");
  const script = body.slice(0, idx).trim();
  const criterion = body.slice(idx).replace(/^## 验收判据\s*$/m, "").trim();
  if (!criterion) throw new Error("「## 验收判据」下面没有内容");
  // 剧本必须用「」标出第一句原话，QA agent 与 run.ts 的 firstOpening 都靠这对括号找开场白；
  // 没有的话之前会静默退化成剧本第一行，读错剧本也不报错，这里当场拦掉。
  if (!/「[\s\S]*?」/.test(script)) throw new Error("剧本里缺第一句原话（用「」括起来）");
  return { dir, meta: m, script, criterion };
}

export function listStories(bank: string): string[] {
  if (!existsSync(bank)) return [];
  return readdirSync(bank)
    .map((n) => path.join(bank, n))
    .filter((p) => statSync(p).isDirectory() && existsSync(path.join(p, "story.md")))
    .sort();
}

export function loadStory(dirOrId: string, bank: string): Story {
  let dir = dirOrId;
  if (!existsSync(path.join(dir, "story.md"))) {
    const hit = listStories(bank).find((d) => path.basename(d).startsWith(dirOrId));
    if (!hit) throw new Error(`找不到题：${dirOrId}（题库 ${bank}）`);
    dir = hit;
  }
  return parseStory(readFileSync(path.join(dir, "story.md"), "utf8"), dir);
}

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

export function bankDir(): string {
  if (process.env.SJ_BANK_DIR) return process.env.SJ_BANK_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const found = walkUpTo(here, path.join("agent-config", "80-agent配置"));
  if (!found) throw new Error("未设置 SJ_BANK_DIR，也找不到 agent-config/80-agent配置");
  return path.join(found, "60-回放题库");
}

/** 题库在 <工作区根>/agent-config/80-agent配置/60-回放题库，往上三层就是工作区根。 */
export function workspaceRootFrom(bank: string): string {
  return process.env.SJ_WORKSPACE_ROOT ?? path.resolve(bank, "..", "..", "..");
}

export async function loadStoryModules(story: Story): Promise<{ setup: unknown; checks: unknown }> {
  const setupMod = await import(pathToFileURL(path.join(story.dir, "setup.ts")).href) as { setup?: unknown };
  const checksMod = await import(pathToFileURL(path.join(story.dir, "checks.ts")).href) as { checks?: unknown };
  if (typeof setupMod.setup !== "function") throw new Error(`${story.dir}/setup.ts 没有导出 setup 函数`);
  if (typeof checksMod.checks !== "function") throw new Error(`${story.dir}/checks.ts 没有导出 checks 函数`);
  return { setup: setupMod.setup, checks: checksMod.checks };
}
