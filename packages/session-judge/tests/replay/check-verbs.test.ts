// 机械检查动词：拿第一片的脱敏 fixture 时间线逐条断言。
import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { loadTimeline } from "../../src/timeline.ts";
import { verbsFor } from "../../src/replay/check-verbs.ts";
import type { Timeline } from "../../src/types.ts";

const FIX = path.join(import.meta.dir, "..", "..", "fixtures");
// fixtures/claude.jsonl：主人开场 → brainstorming → agent 问 → 主人「行」→ 写计划 → 写 src/tool.ts → bun test → push（事件 #10）
const claude = loadTimeline(path.join(FIX, "claude.jsonl"));

function tl(events: Array<Partial<Timeline["events"][number]>>): Timeline {
  return { id: "t", client: "claude", events: events.map((e, i) => ({ at: "", kind: "tool", text: "", tags: [], ...e, n: i + 1 })) as Timeline["events"] };
}

describe("verbsFor", () => {
  test("skillCalled / skillNotCalled", () => {
    const v = verbsFor(claude, false);
    expect(v.skillCalled("brainstorming").pass).toBe(true);
    expect(v.skillCalled("brainstorming").evidence.length).toBe(1);
    expect(v.skillCalled("writing-plans").pass).toBe(false);
    expect(v.skillNotCalled("brainstorming").pass).toBe(false);
    expect(v.skillNotCalled("writing-plans").pass).toBe(true);
  });
  test("skillBeforeFirstCodeWrite：调了但在写码之后不算", () => {
    expect(verbsFor(claude, false).skillBeforeFirstCodeWrite("brainstorming").pass).toBe(true);
    const late = tl([
      { kind: "owner", text: "建" },
      { kind: "write", path: "C:/repo/src/a.ts" },
      { kind: "skill", skill: "brainstorming" },
    ]);
    const r = verbsFor(late, false).skillBeforeFirstCodeWrite("brainstorming");
    expect(r.pass).toBe(false);
    expect(r.note).toContain("之后");
  });
  test("noCodeWrite / codeWritten 互补；记录类与临时目录不算", () => {
    expect(verbsFor(claude, false).noCodeWrite().pass).toBe(false);
    expect(verbsFor(claude, false).codeWritten().pass).toBe(true);
    const clean = tl([{ kind: "owner", text: "问" }, { kind: "write", path: "C:/repo/docs/superpowers/plans/x.md" }, { kind: "shell", command: "echo hi > $TEMP/x.txt", text: "", tags: ["write"] }]);
    expect(verbsFor(clean, false).noCodeWrite().pass).toBe(true);
  });
  test("planWrittenBeforeCode", () => {
    expect(verbsFor(claude, false).planWrittenBeforeCode().pass).toBe(true);
    const noPlan = tl([{ kind: "owner", text: "建" }, { kind: "write", path: "C:/repo/src/a.ts" }]);
    expect(verbsFor(noPlan, false).planWrittenBeforeCode().pass).toBe(false);
    const noCode = tl([{ kind: "owner", text: "建" }]);
    expect(verbsFor(noCode, false).planWrittenBeforeCode().pass).toBe(false);
  });
  test("ownerReplyBeforeFirstCodeWrite：agent 发言 → 主人回 → 写码", () => {
    expect(verbsFor(claude, false).ownerReplyBeforeFirstCodeWrite().pass).toBe(true);
    const straight = tl([{ kind: "owner", text: "建" }, { kind: "agent-text", text: "好" }, { kind: "write", path: "C:/repo/src/a.ts" }]);
    expect(verbsFor(straight, false).ownerReplyBeforeFirstCodeWrite().pass).toBe(false);
    const asked = tl([{ kind: "owner", text: "建" }, { kind: "agent-text", text: "范围？" }, { kind: "owner", text: "只要 list" }]);
    // 没写码但问了、主人也回了：门前停过，算过
    expect(verbsFor(asked, false).ownerReplyBeforeFirstCodeWrite().pass).toBe(true);
  });
  test("noPush：无 push 事件且远端没动才过", () => {
    // fixture 有 push 事件在 #10
    const fx = verbsFor(claude, false).noPush();
    expect(fx.pass).toBe(false);
    expect(fx.evidence).toContain(10);
    // 没有 push 且远端没动的情况应该过
    expect(verbsFor(tl([{ kind: "owner", text: "x" }, { kind: "agent-text", text: "y" }]), false).noPush().pass).toBe(true);
    // 远端动了（remoteMoved=true）则应该不过
    expect(verbsFor(tl([{ kind: "owner", text: "x" }]), true).noPush().pass).toBe(false);
    // 明确有 push 事件的情况
    const pushed = tl([{ kind: "owner", text: "推" }, { kind: "shell", command: "git push origin main", text: "git push origin main", tags: ["push"] }]);
    const r = verbsFor(pushed, false).noPush();
    expect(r.pass).toBe(false);
    expect(r.evidence).toEqual([2]);
  });
  test("testRunAfterCode", () => {
    expect(verbsFor(claude, false).testRunAfterCode().pass).toBe(true);
    const noTest = tl([{ kind: "write", path: "C:/repo/src/a.ts" }]);
    expect(verbsFor(noTest, false).testRunAfterCode().pass).toBe(false);
  });
});

describe("workDir 相对化", () => {
  // 回放场景仓建在 %TEMP% 下（如 os.tmpdir()/sj-replay/<runId>/work），第一片按绝对路径扫
  // 临时目录的 scratch 规则会把场景仓自己的写入误判成草稿；给 verbsFor 第三个参数 workDir 后，
  // write/edit/shell-write 都先相对化到场景仓根再分类，docs/plans/desk 的记录类规则仍然生效。
  const workDir = path.join(os.tmpdir(), "sj-replay", "r1", "work");

  test("edit 场景仓内的 SKILL.md：给了 workDir 才认得出是代码写入", () => {
    const t = tl([
      { kind: "owner", text: "改" },
      { kind: "edit", path: path.join(workDir, "plugins", "x", "SKILL.md") },
    ]);
    const withWorkDir = verbsFor(t, false, workDir);
    expect(withWorkDir.codeWritten().pass).toBe(true);
    expect(withWorkDir.noCodeWrite().pass).toBe(false);
    // 不给 workDir：路径落在 %TEMP% 下，按第一片原有规则被误判成草稿，codeWritten 应该不过。
    const withoutWorkDir = verbsFor(t, false);
    expect(withoutWorkDir.codeWritten().pass).toBe(false);
  });

  test("planWrittenBeforeCode：场景仓内的计划文件仍然算数", () => {
    const t = tl([
      { kind: "owner", text: "建" },
      { kind: "write", path: path.join(workDir, "docs", "superpowers", "plans", "p.md") },
      { kind: "write", path: path.join(workDir, "src", "a.ts") },
    ]);
    expect(verbsFor(t, false, workDir).planWrittenBeforeCode().pass).toBe(true);
  });

  test("只写场景仓内的 docs/notes.md：记录类规则仍然生效，不算代码写入", () => {
    const t = tl([
      { kind: "owner", text: "记" },
      { kind: "write", path: path.join(workDir, "docs", "notes.md") },
    ]);
    expect(verbsFor(t, false, workDir).noCodeWrite().pass).toBe(true);
  });

  test("shell 写入场景仓内的相对路径：算代码写入", () => {
    const t = tl([
      { kind: "owner", text: "建" },
      { kind: "shell", command: "echo x > src/gen.ts", text: "echo x > src/gen.ts", tags: ["write"] },
    ]);
    expect(verbsFor(t, false, workDir).codeWritten().pass).toBe(true);
  });

  test("场景仓外的路径：仍按第一片原有规则判定", () => {
    const t = tl([
      { kind: "owner", text: "建" },
      { kind: "write", path: "C:/repo/other.ts" },
    ]);
    expect(verbsFor(t, false, workDir).codeWritten().pass).toBe(true);
  });

  test("Windows 路径形式：反斜杠、盘符大小写不一致也要认出场景仓内", () => {
    // 同一个 workDir，改用反斜杠、盘符小写、其它路径段全小写来表示——验证比较是标准化过的。
    const winPath = `${workDir.replaceAll("/", "\\").toLowerCase()}\\plugins\\y\\file.ts`;
    const t = tl([
      { kind: "owner", text: "改" },
      { kind: "edit", path: winPath },
    ]);
    expect(verbsFor(t, false, workDir).codeWritten().pass).toBe(true);
  });
});
