// OMP 会话 JSONL 解析：toolCall 块转事件，read skill:// 视为调用 skill，toolResult 忽略。
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ompSessionId, parseOmp } from "../src/parse-omp.ts";

const FIXTURE = readFileSync(path.join(import.meta.dir, "..", "fixtures", "omp.jsonl"), "utf8");
const EDIT_PATCH_FIXTURE = readFileSync(path.join(import.meta.dir, "..", "fixtures", "omp-edit-patch.jsonl"), "utf8");

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
  test("shell 事件的 command 保留完整命令，text 仍按 110 字截断", () => {
    // 200 字长的命令：text 应截到 110，command 应是完整 200+ 字（机械检查靠它才能看到截断点之后的重定向目标）。
    const command = "echo start && ".repeat(14) + "cat > C:/repo/src/a.ts";
    expect(command.length).toBeGreaterThan(200);
    const row = {
      type: "message",
      timestamp: "2026-09-08T10:00:00.000Z",
      message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command } }] },
    };
    const result = parseOmp(JSON.stringify(row));
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("shell");
    expect(result[0]?.text).toHaveLength(110);
    expect(result[0]?.command).toBe(command);
    expect(result[0]?.command?.length).toBeGreaterThan(110);
  });

  test("OMP 18.x 的 edit 补丁（arguments.input）：按方括号头部拆成多条 edit 事件，外加 task 派子任务", () => {
    const events = parseOmp(EDIT_PATCH_FIXTURE);
    const edits = events.filter((e) => e.kind === "edit");
    expect(edits.map((e) => e.path)).toEqual([
      "plugins/workcoding/skills/workcoding/SKILL.md",
      "plugins/workcoding/skills/other/SKILL.md",
    ]);
    const subagents = events.filter((e) => e.kind === "subagent");
    expect(subagents).toHaveLength(1);
    expect(subagents[0]?.text).toBe("查一下测试");
  });

  test("edit 仍认 arguments.path（未走补丁分支）", () => {
    const row = {
      type: "message",
      timestamp: "2026-09-09T10:00:00.000Z",
      message: { role: "assistant", content: [{ type: "toolCall", name: "edit", arguments: { path: "C:/repo/src/c.ts" } }] },
    };
    const result = parseOmp(JSON.stringify(row));
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("edit");
    expect(result[0]?.path).toBe("C:/repo/src/c.ts");
  });

  test("edit 既无 path 也无可解析的补丁：退回空路径的单条事件", () => {
    const row = {
      type: "message",
      timestamp: "2026-09-09T10:00:01.000Z",
      message: { role: "assistant", content: [{ type: "toolCall", name: "edit", arguments: { input: "随便写点什么" } }] },
    };
    const result = parseOmp(JSON.stringify(row));
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("edit");
    expect(result[0]?.path).toBe("");
  });
});
