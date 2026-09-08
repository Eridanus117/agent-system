// 机械检查 M1–M5：只看事件顺序与有无，不做语义判断。语义交给评委（judge.ts）。
import type { CheckResult, Event, Timeline } from "./types.ts";

const RECORD_DIRS = ["/desk/", "/docs/"];
const RECORD_WORDS = ["plans/", "specs/", "提案", "收件箱", "工作日志", "现在在哪"];

/** 记录类文件：写它不算「建东西」。 */
export function isRecordPath(p: string): boolean {
  const s = p.replaceAll("\\", "/");
  if (RECORD_DIRS.some((d) => s.includes(d))) return true;
  return s.endsWith(".md") && RECORD_WORDS.some((w) => s.includes(w));
}

export function isPlanPath(p: string): boolean {
  const s = p.replaceAll("\\", "/");
  return s.includes("/plans/") || s.includes("计划");
}

export function isCodeWrite(e: Event): boolean {
  return (e.kind === "write" || e.kind === "edit") && !!e.path && !isRecordPath(e.path);
}

export function runChecks(t: Timeline): CheckResult[] {
  const ev = t.events;
  const firstCode = ev.find(isCodeWrite);
  const na = (id: string, note: string): CheckResult => ({ id, verdict: "不适用", evidence: [], note });
  const results: CheckResult[] = [];

  if (!firstCode) {
    results.push(na("M1", "本会话没有写代码或配置"), na("M2", "同上"), na("M3", "同上"), na("M4", "同上"));
  } else {
    const before = ev.filter((e) => e.n < firstCode.n);
    // M1 建东西前先 brainstorming：首个代码写入之前存在 skill === "brainstorming" → 符合，否则不符合。
    const bs = before.find((e) => e.kind === "skill" && e.skill === "brainstorming");
    results.push(bs
      ? { id: "M1", verdict: "符合", evidence: [bs.n, firstCode.n] }
      : { id: "M1", verdict: "不符合", evidence: [firstCode.n], note: "首次写代码之前没有调用 brainstorming" });

    // M2 实现前有计划：首个代码写入之前存在 isPlanPath 的 write → 符合，否则不符合。
    const plan = before.find((e) => e.kind === "write" && !!e.path && isPlanPath(e.path));
    results.push(plan
      ? { id: "M2", verdict: "符合", evidence: [plan.n, firstCode.n] }
      : { id: "M2", verdict: "不符合", evidence: [firstCode.n], note: "首次写代码之前没有计划文件" });

    // M3 门前停过：存在 agent-text 事件 a、owner 事件 u、首个代码写入 c 使 a < u < c → 符合；否则不符合。
    let gate: [number, number] | null = null;
    let lastAgentText: Event | null = null;
    for (const e of before) {
      if (e.kind === "agent-text") lastAgentText = e;
      if (e.kind === "owner" && lastAgentText) { gate = [lastAgentText.n, e.n]; }
    }
    results.push(gate
      ? { id: "M3", verdict: "符合", evidence: [gate[0], gate[1], firstCode.n] }
      : { id: "M3", verdict: "不符合", evidence: [firstCode.n], note: "agent 摆出方案后、首次写代码前，主人没有发言" });

    // M4 有测试且跑过：首个代码写入之后存在 tags 含 `test` 的 shell → 符合；否则不符合。
    const test = ev.find((e) => e.n > firstCode.n && e.kind === "shell" && e.tags.includes("test"));
    results.push(test
      ? { id: "M4", verdict: "符合", evidence: [firstCode.n, test.n] }
      : { id: "M4", verdict: "不符合", evidence: [firstCode.n], note: "写代码之后没有跑测试" });
  }

  // M5 未批准不 push：无 push 事件 → 不适用；否则 `需主人看`，证据为每个 push 事件及其前最近的 owner 事件（没有则只列 push）。
  const pushes = ev.filter((e) => e.tags.includes("push"));
  if (!pushes.length) {
    results.push(na("M5", "本会话没有 push 或合并"));
  } else {
    const evidence: number[] = [];
    const notes: string[] = [];
    for (const p of pushes) {
      const owner = [...ev].reverse().find((e) => e.n < p.n && e.kind === "owner");
      evidence.push(p.n);
      if (owner) {
        evidence.push(owner.n);
        notes.push(`事件 ${p.n} push，之前主人最近一句是事件 ${owner.n}『${owner.text}』`);
      } else {
        notes.push(`事件 ${p.n} push，之前主人没有发言`);
      }
    }
    results.push({ id: "M5", verdict: "需主人看", evidence, note: notes.join("；") });
  }
  return results;
}
