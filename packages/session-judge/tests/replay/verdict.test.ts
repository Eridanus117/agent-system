import { describe, expect, test } from "bun:test";
import path from "node:path";
import { loadTimeline } from "../../src/timeline.ts";
import { buildReplayPrompt, combine, judgeReplay, loadReplayRubric, parseReplayVerdict } from "../../src/replay/verdict.ts";

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "claude.jsonl");

describe("buildReplayPrompt", () => {
  test("判据注入、时间线在后", () => {
    const p = buildReplayPrompt(loadReplayRubric(), "它问的那句是不是在澄清范围", "# 时间线\n1. x");
    expect(p).toContain("它问的那句是不是在澄清范围");
    expect(p).not.toContain("{{判据}}");
    expect(p.indexOf("## 时间线")).toBeGreaterThan(p.indexOf("## 判据"));
  });
});

describe("parseReplayVerdict", () => {
  test("三行齐全", () => {
    expect(parseReplayVerdict("判决：pass\n证据：事件 3、5\n说明：问的是范围。")).toEqual({ verdict: "pass", evidence: [3, 5], note: "问的是范围。" });
    expect(parseReplayVerdict("  判决: indeterminate\n证据: 事件 2\n说明: 看不出。")).toEqual({ verdict: "indeterminate", evidence: [2], note: "看不出。" });
  });
  test("判决越界、缺证据行返回 null", () => {
    expect(parseReplayVerdict("判决：maybe\n证据：事件 1\n说明：x")).toBeNull();
    expect(parseReplayVerdict("判决：pass\n说明：x")).toBeNull();
  });
});

describe("judgeReplay 与 combine", () => {
  test("假评委给 pass；两次坏输出 → indeterminate 附原文", async () => {
    const t = loadTimeline(FIX);
    const good = async () => "判决：pass\n证据：事件 4\n说明：行。";
    expect((await judgeReplay(t, "判据", good)).verdict).toBe("pass");
    const bad = async () => "???";
    const r = await judgeReplay(t, "判据", bad);
    expect(r.verdict).toBe("indeterminate");
    expect(r.note).toContain("???");
  });
  test("combine：机械有不过 → fail；评委缺 → indeterminate；否则评委说了算", () => {
    const ok = { id: "a", pass: true, evidence: [] };
    const no = { id: "b", pass: false, evidence: [1], note: "x" };
    expect(combine([ok, no], { verdict: "pass", evidence: [], note: "" })).toBe("fail");
    expect(combine([ok], null)).toBe("indeterminate");
    expect(combine([ok], { verdict: "pass", evidence: [], note: "" })).toBe("pass");
    expect(combine([ok], { verdict: "fail", evidence: [], note: "" })).toBe("fail");
    expect(combine([], { verdict: "pass", evidence: [], note: "" })).toBe("pass");
  });
});
