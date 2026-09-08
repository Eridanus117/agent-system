// Claude Code JSONL 解析：只取主人发言、agent 发言、工具调用；工具结果与杂项行忽略。
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseClaude } from "../src/parse-claude.ts";

const FIXTURE = readFileSync(path.join(import.meta.dir, "..", "fixtures", "claude.jsonl"), "utf8");

describe("parseClaude", () => {
  const events = parseClaude(FIXTURE);
  test("事件种类与顺序", () => {
    expect(events.map((e) => e.kind)).toEqual([
      "owner", "agent-text", "skill", "agent-text", "owner", "write", "write", "shell", "owner", "shell",
    ]);
  });
  test("skill 名、路径、命令标记", () => {
    expect(events[2]?.skill).toBe("brainstorming");
    expect(events[5]?.path).toBe("C:/repo/docs/superpowers/plans/2026-09-08-tool.md");
    expect(events[7]?.tags).toEqual(["test"]);
    expect(events[9]?.tags).toEqual(["push"]);
  });
  test("主人发言取字符串或 text 块，tool_result 不算发言", () => {
    expect(events[0]?.text).toBe("帮我建一个小工具");
    expect(events[4]?.text).toBe("行");
    expect(events.filter((e) => e.kind === "owner")).toHaveLength(3);
  });
  test("时间戳取行级 timestamp", () => {
    expect(events[0]?.at).toBe("2026-09-08T10:00:00.000Z");
  });
});
