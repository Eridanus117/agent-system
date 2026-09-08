// 时间线：自动识别客户端、编号、渲染成一行一事件的 markdown。
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detectClient, loadTimeline, renderTimeline } from "../src/timeline.ts";

const FIX = (name: string) => path.join(import.meta.dir, "..", "fixtures", name);

describe("timeline", () => {
  test("识别客户端", () => {
    expect(detectClient(readFileSync(FIX("claude.jsonl"), "utf8"))).toBe("claude");
    expect(detectClient(readFileSync(FIX("omp.jsonl"), "utf8"))).toBe("omp");
    expect(detectClient("{\"type\":\"nothing\"}\n")).toBeNull();
  });
  test("识别客户端扫全文件", () => {
    // 构造 60 行数据：前 55 行是 attachment（Claude Code 常见开头），第 56 行是 user 行
    const lines = Array(55).fill("{\"type\":\"attachment\",\"path\":\"test.txt\"}\n");
    lines.push("{\"type\":\"user\",\"message\":{\"content\":\"hello\"}}\n");
    const jsonl = lines.join("");
    expect(detectClient(jsonl)).toBe("claude");
  });
  test("加载并编号", () => {
    const t = loadTimeline(FIX("claude.jsonl"));
    expect(t.client).toBe("claude");
    expect(t.id).toBe("claude");
    expect(t.events.map((e) => e.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const o = loadTimeline(FIX("omp.jsonl"));
    expect(o.id).toBe("01a0fixture");
  });
  test("渲染格式", () => {
    const text = renderTimeline(loadTimeline(FIX("claude.jsonl")));
    const lines = text.split("\n");
    expect(lines[0]).toBe("# 会话 claude（claude，10 个事件，10:00:00–10:04:10）");
    expect(lines).toContain("1. [10:00:00] 主人：「帮我建一个小工具」");
    expect(lines).toContain("3. [10:00:05] agent：调用 skill: brainstorming");
    expect(lines).toContain("8. [10:02:30] agent：shell: bun test ✅test-run");
    expect(lines).toContain("10. [10:04:10] agent：shell: git push origin main ⚠push/merge");
  });
  test("空时间线", () => {
    const text = renderTimeline({ id: "x", client: "claude", events: [] });
    expect(text.split("\n")[0]).toBe("# 会话 x（claude，0 个事件）");
  });
  test("不认识的格式报错", () => {
    expect(() => loadTimeline(FIX("../package.json"))).toThrow("不认识的会话格式");
  });
});
