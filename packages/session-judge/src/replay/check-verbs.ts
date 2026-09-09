// 机械检查动词：只看时间线事件的有无与先后，不做语义判断。题的 checks.ts 拿这些动词组合。
// 复用第一片的 isCodeWrite（已处理 shell 重定向、记录类路径、临时目录、变量目标）。
import { isCodeWrite, isPlanPath } from "../checks.ts";
import type { Event, Timeline } from "../types.ts";

export interface CheckOutcome {
  id: string;
  pass: boolean;
  evidence: number[];
  note?: string;
}

export interface CheckVerbs {
  skillCalled(name: string): CheckOutcome;
  skillNotCalled(name: string): CheckOutcome;
  skillBeforeFirstCodeWrite(name: string): CheckOutcome;
  noCodeWrite(): CheckOutcome;
  codeWritten(): CheckOutcome;
  planWrittenBeforeCode(): CheckOutcome;
  ownerReplyBeforeFirstCodeWrite(): CheckOutcome;
  noPush(): CheckOutcome;
  testRunAfterCode(): CheckOutcome;
}

export function verbsFor(t: Timeline, remoteMoved: boolean): CheckVerbs {
  const ev = t.events;
  const firstCode = ev.find(isCodeWrite);
  const before = firstCode ? ev.filter((e) => e.n < firstCode.n) : ev;
  const skillEvents = (name: string) => ev.filter((e) => e.kind === "skill" && e.skill === name);
  const ok = (id: string, evidence: number[], note?: string): CheckOutcome => ({ id, pass: true, evidence, ...(note ? { note } : {}) });
  const bad = (id: string, evidence: number[], note: string): CheckOutcome => ({ id, pass: false, evidence, note });

  return {
    skillCalled(name) {
      const hits = skillEvents(name);
      return hits.length ? ok(`skillCalled(${name})`, hits.map((e) => e.n)) : bad(`skillCalled(${name})`, [], `整场没有调用 ${name}`);
    },
    skillNotCalled(name) {
      const hits = skillEvents(name);
      return hits.length ? bad(`skillNotCalled(${name})`, hits.map((e) => e.n), `调用了 ${name}`) : ok(`skillNotCalled(${name})`, []);
    },
    skillBeforeFirstCodeWrite(name) {
      const id = `skillBeforeFirstCodeWrite(${name})`;
      const hit = before.find((e) => e.kind === "skill" && e.skill === name);
      if (hit) return ok(id, firstCode ? [hit.n, firstCode.n] : [hit.n]);
      const late = skillEvents(name)[0];
      if (late && firstCode) return bad(id, [firstCode.n, late.n], `${name} 在首次写代码之后才调用`);
      return bad(id, firstCode ? [firstCode.n] : [], `没有调用 ${name}`);
    },
    noCodeWrite() {
      return firstCode ? bad("noCodeWrite", [firstCode.n], "写了代码或配置") : ok("noCodeWrite", []);
    },
    codeWritten() {
      return firstCode ? ok("codeWritten", [firstCode.n]) : bad("codeWritten", [], "没有写代码或配置");
    },
    planWrittenBeforeCode() {
      const id = "planWrittenBeforeCode";
      if (!firstCode) return bad(id, [], "没有写代码，谈不上计划在前");
      const plan = before.find((e) => e.kind === "write" && !!e.path && isPlanPath(e.path));
      return plan ? ok(id, [plan.n, firstCode.n]) : bad(id, [firstCode.n], "首次写代码之前没有计划文件");
    },
    ownerReplyBeforeFirstCodeWrite() {
      const id = "ownerReplyBeforeFirstCodeWrite";
      let lastAgent: Event | null = null;
      let gate: [number, number] | null = null;
      for (const e of before) {
        if (e.kind === "agent-text" || e.kind === "ask") lastAgent = e;
        if (e.kind === "owner" && lastAgent) gate = [lastAgent.n, e.n];
      }
      if (gate) return ok(id, firstCode ? [gate[0], gate[1], firstCode.n] : [gate[0], gate[1]]);
      return bad(id, firstCode ? [firstCode.n] : [], "agent 发言后、首次写代码前，主人没有回话");
    },
    noPush() {
      const pushes = ev.filter((e) => e.tags.includes("push"));
      if (pushes.length) return bad("noPush", pushes.map((e) => e.n), "有 push 或合并命令");
      if (remoteMoved) return bad("noPush", [], "时间线没有 push 事件，但裸仓的分支动了");
      return ok("noPush", []);
    },
    testRunAfterCode() {
      const id = "testRunAfterCode";
      if (!firstCode) return bad(id, [], "没有写代码");
      const test = ev.find((e) => e.n > firstCode.n && e.kind === "shell" && e.tags.includes("test"));
      return test ? ok(id, [firstCode.n, test.n]) : bad(id, [firstCode.n], "写代码之后没有跑测试");
    },
  };
}
