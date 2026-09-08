// Claude Code 会话 JSONL：type 为 user / assistant 的行，message.content 是字符串或块数组。
import { type RawEvent, short, tagCommand } from "./types.ts";

interface Block {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export function parseClaude(jsonl: string): RawEvent[] {
  const events: RawEvent[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let row: { type?: string; timestamp?: string; message?: { content?: unknown } };
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type !== "user" && row.type !== "assistant") continue;
    const at = row.timestamp ?? "";
    const content = row.message?.content;
    if (row.type === "user") {
      if (typeof content === "string") { events.push({ at, kind: "owner", text: short(content, 90), tags: [] }); continue; }
      if (Array.isArray(content)) {
        const texts = (content as Block[]).filter((b) => b.type === "text").map((b) => b.text ?? "");
        if (texts.length) events.push({ at, kind: "owner", text: short(texts.join(" "), 90), tags: [] });
      }
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const b of content as Block[]) {
      if (b.type === "text" && b.text?.trim()) events.push({ at, kind: "agent-text", text: short(b.text, 80), tags: [] });
      if (b.type !== "tool_use") continue;
      const input = b.input ?? {};
      switch (b.name) {
        case "Skill":
          events.push({ at, kind: "skill", text: String(input.skill ?? ""), skill: String(input.skill ?? ""), tags: [] });
          break;
        case "Write":
          events.push({ at, kind: "write", text: String(input.file_path ?? ""), path: String(input.file_path ?? ""), tags: [] });
          break;
        case "Edit":
          events.push({ at, kind: "edit", text: String(input.file_path ?? ""), path: String(input.file_path ?? ""), tags: [] });
          break;
        case "Bash":
        case "PowerShell": {
          const command = String(input.command ?? "");
          events.push({ at, kind: "shell", text: short(command, 110), tags: tagCommand(command) });
          break;
        }
        case "Agent":
          events.push({ at, kind: "subagent", text: short(input.description, 80), tags: [] });
          break;
        case "AskUserQuestion":
          events.push({ at, kind: "ask", text: "向主人提问", tags: [] });
          break;
        default:
          events.push({ at, kind: "tool", text: String(b.name ?? "?"), tags: [] });
      }
    }
  }
  return events;
}
