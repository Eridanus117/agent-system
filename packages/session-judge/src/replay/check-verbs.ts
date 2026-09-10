// 机械检查动词：只看时间线事件的有无与先后，不做语义判断。题的 checks.ts 拿这些动词组合。
// 复用第一片的 isCodeWrite（已处理 shell 重定向、记录类路径、临时目录、变量目标）。
import { isCodeWrite, isPlanPath, isRecordPath, isScratchPath, shellWriteTarget } from "../checks.ts";
import type { Event, Timeline } from "../types.ts";

/**
 * 把一个路径相对化到场景仓根 workDir：正反斜杠、Windows 盘符大小写都不敏感；
 * 落在 workDir 之外返回 null。shell 写入目标若是相对路径（没有盘符、没有开头斜杠、
 * 也不是 $/% 变量引用），视为落在 workDir 内——这类目标本来就是相对被测 CLI 的 cwd（=workDir）写的。
 */
export function relativeToWork(p: string, workDir: string): string | null {
  const norm = (s: string) => s.replaceAll("\\", "/");
  const target = norm(p);
  const base = norm(workDir).replace(/\/+$/, "");
  const targetLower = target.toLowerCase();
  const baseLower = base.toLowerCase();
  if (targetLower === baseLower) return "/";
  if (targetLower.startsWith(`${baseLower}/`)) return "/" + target.slice(base.length + 1);
  if (!/^[A-Za-z]:/.test(target) && !target.startsWith("/") && !target.startsWith("$") && !target.startsWith("%")) {
    return "/" + target;
  }
  return null;
}

/**
 * workDir 版的 isCodeWrite：写/改事件按相对场景仓根的路径判定 record/scratch 规则，
 * 而不是按绝对路径——回放场景仓建在 %TEMP% 下（`%TEMP%/sj-replay/<runId>/work/`），
 * 第一片给「临时目录」定的 scratch 规则（isScratchPath）按绝对路径扫会把场景仓自己的写入
 * 误判成草稿；相对化之后 docs/plans/desk 这些记录类规则仍然生效，只是不再被 %TEMP% 段误伤。
 * 路径本来就不在 workDir 下（相对化失败）时退回第一片原有的 isCodeWrite。
 */
export function isCodeWriteIn(e: Event, workDir: string): boolean {
  if ((e.kind === "write" || e.kind === "edit") && !!e.path) {
    const rel = relativeToWork(e.path, workDir);
    if (rel !== null) return !isRecordPath(rel) && !isScratchPath(rel);
    return isCodeWrite(e);
  }
  if (e.kind === "shell" && e.tags.includes("write")) {
    const command = e.command ?? e.text;
    const target = shellWriteTarget(command);
    if (target !== null) {
      const stripped = target.replace(/^['"]|['"]$/g, "");
      if (!stripped.startsWith("$") && !stripped.startsWith("%")) {
        const rel = relativeToWork(stripped, workDir);
        if (rel !== null) return !(isRecordPath(rel) || isScratchPath(rel));
      }
    }
    return isCodeWrite(e);
  }
  return false;
}

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

export function verbsFor(t: Timeline, remoteMoved: boolean, workDir?: string): CheckVerbs {
  const ev = t.events;
  // 给了 workDir 就按相对场景仓根的路径分类（见 isCodeWriteIn 顶部说明），否则退回第一片原有的绝对路径判定。
  const codeWriteOf = workDir ? (e: Event) => isCodeWriteIn(e, workDir) : isCodeWrite;
  const firstCode = ev.find(codeWriteOf);
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
      // 计划路径判定也按相对场景仓根的路径来——workDir 下 docs/superpowers/plans/ 这种嵌套目录才对得上。
      const plan = before.find((e) => e.kind === "write" && !!e.path && isPlanPath(workDir ? relativeToWork(e.path, workDir) ?? e.path : e.path));
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
