// OMP 会话 JSONL 解析：toolCall 块转事件，read skill:// 视为调用 skill，toolResult 忽略。
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ompSessionId, parseOmp } from "../src/parse-omp.ts";

const FIXTURE = readFileSync(path.join(import.meta.dir, "..", "fixtures", "omp.jsonl"), "utf8");

describe("parseOmp", () => {
  const events = parseOmp(FIXTURE);
  test("事件种类与顺序", () => {
    expect(events.map((e) => e.kind)).toEqual(["owner", "skill", "agent-text", "shell", "write", "edit", "tool"]);
  });
  test("read skill:// 转成 skill 事件", () => {
    expect(events[1]?.skill).toBe("brainstorming");
  });
  test("写改路径与命令标记", () => {
    expect(events[4]?.path).toBe("C:/repo/src/a.ts");
    expect(events[5]?.path).toBe("C:/repo/src/b.ts");
    expect(events[3]?.tags).toEqual(["test"]);
    expect(events[6]?.text).toBe("glob");
  });
  test("会话 id 来自 session 行", () => {
    expect(ompSessionId(FIXTURE)).toBe("01a0fixture");
    expect(ompSessionId("{}\n")).toBeNull();
  });
  test("空行与坏行忽略，只有一条有效用户消息", () => {
    const input = "\n{invalid json\n" + '{"type":"message","timestamp":"2026-09-08T11:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"test"}]}}' + "\n";
    const result = parseOmp(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("owner");
  });
});
