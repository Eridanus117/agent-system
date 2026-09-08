// OMP（Oh My Pi）会话 JSONL：type 为 message 的行；role 为 toolResult 的行不进时间线。
import { type RawEvent, short, tagCommand } from "./types.ts";

interface Block {
  type: string;
  text?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

interface Row {
  type?: string;
  id?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

function rows(jsonl: string): Row[] {
  const out: Row[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 坏行跳过 */ }
  }
  return out;
}

export function ompSessionId(jsonl: string): string | null {
  const row = rows(jsonl).find((r) => r.type === "session");
  return row?.id ?? null;
}

export function parseOmp(jsonl: string): RawEvent[] {
  const events: RawEvent[] = [];
  for (const row of rows(jsonl)) {
    if (row.type !== "message") continue;
    const at = row.timestamp ?? "";
    const role = row.message?.role;
    const content = row.message?.content;
    if (!Array.isArray(content)) continue;
    const blocks = content as Block[];
    if (role === "user") {
      const texts = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "");
      if (texts.length) events.push({ at, kind: "owner", text: short(texts.join(" "), 90), tags: [] });
      continue;
    }
    if (role !== "assistant") continue;
    for (const b of blocks) {
      if (b.type === "text" && b.text?.trim()) events.push({ at, kind: "agent-text", text: short(b.text, 80), tags: [] });
      if (b.type !== "toolCall") continue;
      const args = b.arguments ?? {};
      const name = String(b.name ?? "?").toLowerCase();
      const p = String(args.path ?? "");
      if (name === "read" && p.startsWith("skill://")) {
        const skill = p.slice("skill://".length);
        events.push({ at, kind: "skill", text: short(skill, 80), skill, tags: [] });
      } else if (name === "write") {
        events.push({ at, kind: "write", text: p, path: p, tags: [] });
      } else if (name === "edit") {
        events.push({ at, kind: "edit", text: p, path: p, tags: [] });
      } else if (name === "bash" || name === "shell" || name === "powershell") {
        const command = String(args.command ?? "");
        events.push({ at, kind: "shell", text: short(command, 110), command, tags: tagCommand(command) });
      } else if (name === "subagent" || name === "agent") {
        events.push({ at, kind: "subagent", text: short(args.description ?? args.task, 80), tags: [] });
      } else if (name === "ask" || name === "ask_user") {
        events.push({ at, kind: "ask", text: "向主人提问", tags: [] });
      } else {
        events.push({ at, kind: "tool", text: name, tags: [] });
      }
    }
  }
  return events;
}
