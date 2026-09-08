// 评委层：只测提示词拼装、输出解析与重试；评委本身用假函数。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPrompt, judgeTimeline, loadRubric, parseSummary, parseVerdicts, renderMechanical, renderReport, runnerFor } from "../src/judge.ts";
import { loadTimeline, renderTimeline } from "../src/timeline.ts";
import { runChecks } from "../src/checks.ts";
import type { Event, Timeline } from "../src/types.ts";

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
  test("表格行前有缩进（前导空白）也能解析", () => {
    const indented = GOOD.split("\n").map((line) => (line.startsWith("| J") ? `  ${line}` : line)).join("\n");
    const r = parseVerdicts(indented)!;
    expect(r).not.toBeNull();
    expect(r.map((x) => x.id)).toEqual(["J1", "J2", "J3", "J4"]);
  });
});

describe("parseSummary", () => {
  test("取到「总评：」那一句", () => {
    expect(parseSummary(GOOD)).toBe("走了规矩。");
  });
  test("没有总评行时返回 null", () => {
    expect(parseSummary(GOOD.replace("总评：走了规矩。", ""))).toBeNull();
  });
});

describe("renderMechanical", () => {
  test("证据/说明里的竖线转成全角，不破坏表格", () => {
    const table = renderMechanical([
      { id: "M5", verdict: "需主人看", evidence: [1], note: "主人说「a|b」" },
    ]);
    const row = table.split("\n").find((l) => l.startsWith("| M5"))!;
    expect(row.split("|").length).toBe(5); // 首尾空 + 三列，竖线没有多切出列
    expect(row).toContain("a｜b");
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
    expect(r.summary).toBeNull();
  });
  test("合格时 outcome 带上总评", async () => {
    const r = await judgeTimeline(loadTimeline(FIX), async () => GOOD);
    expect(r.summary).toBe("走了规矩。");
  });
});

describe("runnerFor：评委进程不读 stdin 就提前退出（EPIPE）", () => {
  test("prompt 超过 100KB、假评委直接 exit(3) 不读 stdin：judgeTimeline 拒绝并带退出码，不把测试进程带崩", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-judge-epipe-"));
    const fake = path.join(tmp, "fake-judge-noread.mjs");
    // 故意不挂 stdin 监听、立刻退出：小 prompt 靠系统管道缓冲区往往还是能写进去，
    // 只有 prompt 大到超过缓冲区（这里造 100KB+ 的时间线）才能稳定复现 EPIPE。
    fs.writeFileSync(fake, "process.exit(3);\n");
    process.env.SJ_JUDGE_CMD = `node ${fake}`;
    try {
      const bigText = "x".repeat(200);
      const events: Event[] = Array.from({ length: 700 }, (_, i) => ({
        n: i + 1, at: "2026-09-08T10:00:00.000Z", kind: "agent-text" as const, text: bigText, tags: [],
      }));
      const t: Timeline = { id: "big", client: "claude", events };
      expect(renderTimeline(t).length).toBeGreaterThan(100_000);
      await expect(judgeTimeline(t, runnerFor("claude"))).rejects.toThrow(/评委进程退出 3/);
    } finally {
      delete process.env.SJ_JUDGE_CMD;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("renderReport", () => {
  test("评委判决表后面带总评一行", async () => {
    const t = loadTimeline(FIX);
    const outcome = await judgeTimeline(t, async () => GOOD);
    const report = renderReport(t, outcome, "claude");
    expect(report).toContain("总评：走了规矩。");
    // 总评要出现在「## 时间线」之前，这样 cli.ts 按该标记切片时也能看到
    expect(report.indexOf("总评：走了规矩。")).toBeLessThan(report.indexOf("## 时间线"));
  });
});
