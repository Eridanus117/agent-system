// Claude Code JSONL 解析：只取主人发言、agent 发言、工具调用；工具结果与杂项行忽略。
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseClaude } from "../src/parse-claude.ts";
import { short } from "../src/types.ts";

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
  test("坏行与空行被跳过，只返回有效事件", () => {
    const jsonl = `{"type":"user","timestamp":"2026-09-08T10:00:00.000Z","message":{"role":"user","content":"hello"}}

{not json
`;
    const result = parseClaude(jsonl);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("owner");
    expect(result[0]?.text).toBe("hello");
  });
  test("文本截断与空白压平", () => {
    // 测试 120 字长、含换行和多空格的文本应被截断到 90 字且无换行/双空格
    const longText = "a".repeat(50) + "\n\n  " + "b".repeat(70);
    const row = { type: "user", timestamp: "2026-09-08T10:00:00.000Z", message: { role: "user", content: longText } };
    const jsonl = JSON.stringify(row);
    const result = parseClaude(jsonl);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toHaveLength(90);
    expect(result[0]?.text).not.toMatch(/\n/);
    expect(result[0]?.text).not.toMatch(/  /);

    // 测试 short 函数直接
    expect(short("  a\n\n b  ", 10)).toBe("a b");
  });
});
