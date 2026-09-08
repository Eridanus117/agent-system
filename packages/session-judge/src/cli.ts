#!/usr/bin/env bun
// sj — 会话评分命令入口。核心逻辑在各模块，这里只做参数分发。
// 设计：docs/superpowers/specs/2026-09-08-session-judge-design.md

import { loadTimeline, renderTimeline } from "./timeline.ts";

export interface CliIo {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

const USAGE = `用法：
  sj extract <会话文件>            出时间线
  sj judge <会话文件> [--judge claude|omp]   机械检查 + 评委，落状态文件
  sj anchor <会话文件> [--from <json>]       主人判标准答案
  sj agreement                      评委与标准答案的一致率（不足 10 道拒绝）
  sj sentinel                       跑哨兵题，评委全给满分即报警
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
