// 把一个会话文件变成编号时间线；渲染成给评委看的 markdown。
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseClaude } from "./parse-claude.ts";
import { ompSessionId, parseOmp } from "./parse-omp.ts";
import type { Client, Event, Timeline } from "./types.ts";

export function detectClient(jsonl: string): Client | null {
  // 扫全文件查 OMP 标记，OMP 优先（session 行只会出现在 OMP）
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let row: { type?: string };
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type === "session") return "omp";
  }
  // 再扫全文件查 Claude 标记
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let row: { type?: string };
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type === "user" || row.type === "assistant") return "claude";
  }
  return null;
}

export function loadTimeline(filePath: string): Timeline {
  const jsonl = readFileSync(filePath, "utf8");
  const client = detectClient(jsonl);
  if (!client) throw new Error(`不认识的会话格式：${filePath}`);
  const raw = client === "claude" ? parseClaude(jsonl) : parseOmp(jsonl);
  const base = path.basename(filePath).replace(/\.jsonl$/, "");
  const id = client === "omp" ? (ompSessionId(jsonl) ?? base) : base;
  const events: Event[] = raw.map((e, i) => ({ ...e, n: i + 1 }));
  return { id, client, events };
}

function clock(iso: string): string {
  return iso.length >= 19 ? iso.slice(11, 19) : iso;
}

export function formatEvent(e: Event): string {
  const head = `${e.n}. [${clock(e.at)}]`;
  const tag = e.tags.map((t) => (t === "push" ? " ⚠push/merge" : " ✅test-run")).join("");
  switch (e.kind) {
    case "owner": return `${head} 主人：「${e.text}」`;
    case "agent-text": return `${head} agent：「${e.text}」`;
    case "skill": return `${head} agent：调用 skill: ${e.skill}`;
    case "write": return `${head} agent：写文件: ${e.path}`;
    case "edit": return `${head} agent：改文件: ${e.path}`;
    case "shell": return `${head} agent：shell: ${e.text}${tag}`;
    case "subagent": return `${head} agent：派子代理: ${e.text}`;
    case "ask": return `${head} agent：向主人提问`;
    default: return `${head} agent：工具 ${e.text}`;
  }
}

export function renderTimeline(t: Timeline): string {
  const first = t.events[0]?.at ?? "";
  const last = t.events[t.events.length - 1]?.at ?? "";
  const span = t.events.length ? `，${clock(first)}–${clock(last)}` : "";
  const header = `# 会话 ${t.id}（${t.client}，${t.events.length} 个事件${span}）`;
  return [header, "", ...t.events.map(formatEvent)].join("\n") + "\n";
}
