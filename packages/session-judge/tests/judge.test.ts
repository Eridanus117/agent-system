// 评委层：只测提示词拼装、输出解析与重试；评委本身用假函数。
import { describe, expect, test } from "bun:test";
import path from "node:path";
import { buildPrompt, judgeTimeline, loadRubric, parseVerdicts } from "../src/judge.ts";
import { loadTimeline } from "../src/timeline.ts";
import { runChecks } from "../src/checks.ts";

const FIX = path.join(import.meta.dir, "..", "fixtures", "claude.jsonl");
const GOOD = `| 判据 | 判决 | 证据 |
|---|---|---|
| J1 | 符合 | 事件 3、4、5 |
| J2 | 符合 | 事件 6 |
| J3 | 符合 | 事件 5 |
| J4 | 判不了 | 事件 8，看不出测试目录 |

总评：走了规矩。`;

describe("parseVerdicts", () => {
  test("合格表解析成四条", () => {
    const r = parseVerdicts(GOOD)!;
    expect(r.map((x) => x.id)).toEqual(["J1", "J2", "J3", "J4"]);
    expect(r[0]?.verdict).toBe("符合");
    expect(r[0]?.evidence).toEqual([3, 4, 5]);
    expect(r[3]?.note).toContain("看不出测试目录");
  });
  test("缺行、判决越界、证据为空都返回 null", () => {
    expect(parseVerdicts(GOOD.replace("| J4 | 判不了 | 事件 8，看不出测试目录 |\n", ""))).toBeNull();
    expect(parseVerdicts(GOOD.replace("| J1 | 符合 |", "| J1 | 大概符合 |"))).toBeNull();
    expect(parseVerdicts(GOOD.replace("| J2 | 符合 | 事件 6 |", "| J2 | 符合 |  |"))).toBeNull();
  });
});

describe("buildPrompt", () => {
  test("含判据、机械检查表与时间线", () => {
    const t = loadTimeline(FIX);
    const p = buildPrompt(loadRubric(), "TIMELINE", runChecks(t));
    expect(p).toContain("常设授权");
    expect(p).toContain("| M1 |");
    expect(p.endsWith("TIMELINE\n")).toBe(true);
  });
});

describe("judgeTimeline", () => {
  test("第一次不合格、第二次合格 → attempts 2", async () => {
    let calls = 0;
    const runner = async () => (++calls === 1 ? "胡说" : GOOD);
    const r = await judgeTimeline(loadTimeline(FIX), runner);
    expect(r.attempts).toBe(2);
    expect(r.judged?.length).toBe(4);
    expect(r.mechanical.length).toBe(5);
  });
  test("两次都不合格 → judged 为 null，raw 保留原文", async () => {
    const r = await judgeTimeline(loadTimeline(FIX), async () => "还是胡说");
    expect(r.attempts).toBe(2);
    expect(r.judged).toBeNull();
    expect(r.raw).toBe("还是胡说");
  });
});
