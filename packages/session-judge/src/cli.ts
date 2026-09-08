#!/usr/bin/env bun
// sj — 会话评分命令入口。核心逻辑在各模块，这里只做参数分发。
// 设计：docs/superpowers/specs/2026-09-08-session-judge-design.md

import { readFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTimeline, renderTimeline } from "./timeline.ts";
import { judgeTimeline, renderReport, runnerFor } from "./judge.ts";
import { writeState } from "./state.ts";
import { ANCHOR_CELLS, agreement, assertAnchorsReady, loadAnchors, saveAnchor } from "./anchors.ts";
import { listSessions } from "./sessions.ts";
import { VERDICTS, type Verdict } from "./types.ts";

export function sentinelFiles(): string[] {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sentinels");
  return readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().map((f) => path.join(dir, f));
}

export interface CliIo {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

const USAGE = `用法：
  sj extract <会话文件>            出时间线
  sj judge <会话文件> [--judge claude|omp]   机械检查 + 评委，落状态文件
  sj anchor <会话文件> [--from <json>]       主人判标准答案
  sj agreement                      评委与标准答案的一致率（不足 10 道拒绝）
  sj sentinel [--judge claude|omp]           跑哨兵题，评委全给满分即报警
  sj list [--latest N]              列最近会话
`;

export async function runCli(args: string[], io: CliIo): Promise<number> {
  const [cmd] = args;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    io.stdout(USAGE);
    return 0;
  }
  if (cmd === "extract") {
    const file = args[1];
    if (!file) { io.stderr("用法：sj extract <会话文件>\n"); return 2; }
    try {
      io.stdout(renderTimeline(loadTimeline(file)));
      return 0;
    } catch (err) {
      io.stderr(`${(err as Error).message}\n`);
      return 1;
    }
  }
  if (cmd === "judge") {
    const file = args[1];
    if (!file) { io.stderr("用法：sj judge <会话文件> [--judge claude|omp]\n"); return 2; }
    const judgeIdx = args.indexOf("--judge");
    const judgeArg = judgeIdx >= 0 ? args[judgeIdx + 1] : undefined;
    if (judgeArg !== undefined && judgeArg !== "claude" && judgeArg !== "omp") {
      io.stderr("--judge 只支持 claude 或 omp\n");
      return 2;
    }
    const kind = judgeArg === "omp" ? "omp" : "claude";
    try {
      const t = loadTimeline(file);
      const outcome = await judgeTimeline(t, runnerFor(kind));
      const report = renderReport(t, outcome, kind);
      const written = writeState(t, report);
      io.stdout(report.split("## 时间线")[0] ?? report);
      io.stdout(`状态文件：${written}\n`);
      return outcome.judged ? 0 : 1;
    } catch (err) {
      io.stderr(`${(err as Error).message}\n`);
      return 1;
    }
  }

  if (cmd === "anchor") {
    const file = args[1];
    if (!file) { io.stderr("用法：sj anchor <会话文件> [--from <json>]\n"); return 2; }
    try {
      const t = loadTimeline(file);
      const outcome = await judgeTimeline(t, runnerFor("claude"));
      if (!outcome.judged) {
        // 评委两次都没解析出合格判决，标准答案没有评委那一半可比，不落盘。
        io.stderr("评委失败，无法判标准答案\n");
        return 1;
      }
      const judge: Record<string, Verdict> = {};
      for (const r of [...outcome.mechanical, ...outcome.judged]) judge[r.id] = r.verdict;
      const owner: Record<string, Verdict> = { ...judge };
      const fromIdx = args.indexOf("--from");
      if (fromIdx >= 0) {
        const given = JSON.parse(readFileSync(String(args[fromIdx + 1]), "utf8")) as Record<string, Verdict>;
        const allowed: Verdict[] = VERDICTS.filter((v) => v !== "需主人看");
        for (const [k, v] of Object.entries(given)) {
          if (!allowed.includes(v)) {
            io.stderr(`--from 里的判决只能是 符合／不符合／不适用／判不了：${k}=${v}\n`);
            return 2;
          }
        }
        Object.assign(owner, given);
      } else {
        io.stdout(renderTimeline(t));
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        for (const c of ANCHOR_CELLS) {
          const ans = (await rl.question(`${c}：评委判「${judge[c] ?? "无"}」。回车接受，或输 1 符合 / 2 不符合 / 3 不适用 / 4 判不了：`)).trim();
          const map: Record<string, Verdict> = { "1": "符合", "2": "不符合", "3": "不适用", "4": "判不了" };
          if (map[ans]) owner[c] = map[ans]!;
        }
        rl.close();
      }
      const saved = saveAnchor({ id: t.id, client: t.client, file, judgedAt: new Date().toISOString(), owner, judge });
      io.stdout(`已保存标准答案：${saved}\n`);
      return 0;
    } catch (err) {
      io.stderr(`${(err as Error).message}\n`);
      return 1;
    }
  }
  if (cmd === "agreement") {
    try {
      const anchors = loadAnchors();
      assertAnchorsReady(anchors);
      const r = agreement(anchors);
      io.stdout(`标准答案 ${anchors.length} 道，${r.cells} 格，评委一致 ${r.matched} 格，一致率 ${(r.rate * 100).toFixed(0)}%${r.rate < 0.8 ? "（低于 80%，评委不算数）" : ""}\n`);
      return r.rate < 0.8 ? 1 : 0;
    } catch (err) {
      io.stderr(`${(err as Error).message}\n`);
      return 1;
    }
  }

  if (cmd === "sentinel") {
    const judgeIdx = args.indexOf("--judge");
    const judgeArg = judgeIdx >= 0 ? args[judgeIdx + 1] : undefined;
    if (judgeArg !== undefined && judgeArg !== "claude" && judgeArg !== "omp") {
      io.stderr("--judge 只支持 claude 或 omp\n");
      return 2;
    }
    const kind = judgeArg === "omp" ? "omp" : "claude";
    let alarms = 0;
    for (const f of sentinelFiles()) {
      const t = loadTimeline(f);
      const outcome = await judgeTimeline(t, runnerFor(kind));
      writeState(t, renderReport(t, outcome, kind));
      const applicable = (outcome.judged ?? []).filter((r) => r.verdict !== "不适用");
      const fullMarks = applicable.length > 0 && applicable.every((r) => r.verdict === "符合");
      const name = path.basename(f, ".jsonl");
      if (!outcome.judged) { io.stdout(`${name}：评委失败\n`); alarms++; continue; }
      if (outcome.judged && applicable.length === 0) { io.stdout(`报警：评委对哨兵题「${name}」全部判不适用——它回避了问题\n`); alarms++; }
      else if (fullMarks) { io.stdout(`报警：评委给哨兵题「${name}」满分——它是空壳，评委被糊弄了\n`); alarms++; }
      else io.stdout(`${name}：评委识破（${applicable.map((r) => `${r.id} ${r.verdict}`).join("，")}）\n`);
    }
    return alarms ? 1 : 0;
  }

  if (cmd === "list") {
    const idx = args.indexOf("--latest");
    const latest = idx >= 0 ? Number(args[idx + 1]) || 10 : 10;
    for (const s of listSessions(latest)) {
      let id = path.basename(s.file, ".jsonl");
      let first = "";
      try {
        const t = loadTimeline(s.file);
        id = t.id;
        first = t.events.find((e) => e.kind === "owner")?.text ?? "";
      } catch { /* 读不了的会话只列文件名 */ }
      io.stdout(`${s.mtime.toISOString().slice(0, 16).replace("T", " ")}  ${s.client.padEnd(6)}  ${id.slice(0, 12).padEnd(12)}  ${first}\n`);
    }
    return 0;
  }

  io.stderr(`未知命令：${cmd}\n${USAGE}`);
  return 2;
}

if (import.meta.main) {
  const code = await runCli(process.argv.slice(2), {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  });
  process.exit(code);
}
