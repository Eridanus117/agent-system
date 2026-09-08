// 机械检查：只看顺序与有无，用手工拼的时间线覆盖每条的三种结论。
import { describe, expect, test } from "bun:test";
import { isCodeWrite, isPlanPath, isRecordPath, runChecks } from "../src/checks.ts";
import type { Event, Timeline } from "../src/types.ts";

let n = 0;
const ev = (kind: Event["kind"], extra: Partial<Event> = {}): Event => ({
  n: ++n, at: `2026-09-08T10:00:${String(n).padStart(2, "0")}.000Z`, kind, text: extra.text ?? "", tags: extra.tags ?? [], ...extra,
});
const tl = (events: Event[]): Timeline => ({ id: "t", client: "claude", events });
const byId = (t: Timeline) => Object.fromEntries(runChecks(t).map((r) => [r.id, r]));

describe("路径分类", () => {
  test("记录类与计划路径", () => {
    expect(isRecordPath("C:/Workspace/desk/30-提案/x.md")).toBe(true);
    expect(isRecordPath("C:/repo/docs/superpowers/specs/a.md")).toBe(true);
    expect(isRecordPath("C:/repo/src/a.ts")).toBe(false);
    expect(isPlanPath("C:/repo/docs/superpowers/plans/a.md")).toBe(true);
    expect(isPlanPath("C:/repo/src/plan.ts")).toBe(false);
  });
});

describe("runChecks", () => {
  test("纯咨询会话：M1–M4 不适用，M5 不适用", () => {
    n = 0;
    const r = byId(tl([ev("owner", { text: "看看" }), ev("shell", { text: "cat a" })]));
    expect(r.M1?.verdict).toBe("不适用");
    expect(r.M4?.verdict).toBe("不适用");
    expect(r.M5?.verdict).toBe("不适用");
  });
  test("规矩全走：M1–M4 符合", () => {
    n = 0;
    const t = tl([
      ev("owner", { text: "建" }), ev("skill", { skill: "brainstorming" }), ev("agent-text", { text: "方案" }),
      ev("owner", { text: "行" }), ev("write", { path: "C:/r/docs/superpowers/plans/p.md" }),
      ev("write", { path: "C:/r/src/a.ts" }), ev("shell", { text: "bun test", tags: ["test"] }),
    ]);
    const r = byId(t);
    expect(r.M1?.verdict).toBe("符合");
    expect(r.M1?.evidence).toEqual([2, 6]);
    expect(r.M2?.verdict).toBe("符合");
    expect(r.M3?.verdict).toBe("符合");
    expect(r.M3?.evidence).toEqual([3, 4, 6]);
    expect(r.M4?.verdict).toBe("符合");
  });
  test("直接开写：M1–M3 不符合，M4 不符合", () => {
    n = 0;
    const r = byId(tl([ev("owner", { text: "建" }), ev("write", { path: "C:/r/src/a.ts" })]));
    expect(r.M1?.verdict).toBe("不符合");
    expect(r.M2?.verdict).toBe("不符合");
    expect(r.M3?.verdict).toBe("不符合");
    expect(r.M4?.verdict).toBe("不符合");
  });
  test("只写记录类文件不算建东西", () => {
    n = 0;
    const r = byId(tl([ev("owner", { text: "记一下" }), ev("write", { path: "C:/Workspace/desk/40-收件箱/a.md" })]));
    expect(r.M1?.verdict).toBe("不适用");
    expect(isCodeWrite(ev("write", { path: "C:/Workspace/desk/40-收件箱/a.md" }))).toBe(false);
  });
  test("M5 列出每次 push 与之前主人最近一句", () => {
    n = 0;
    const r = byId(tl([
      ev("owner", { text: "推吧" }), ev("shell", { text: "git push", tags: ["push"] }),
      ev("shell", { text: "git push", tags: ["push"] }),
    ]));
    expect(r.M5?.verdict).toBe("需主人看");
    expect(r.M5?.evidence).toEqual([2, 1, 3, 1]);
    expect(r.M5?.note).toContain("事件 2 push，之前主人最近一句是事件 1『推吧』");
  });
});
