// Claude 的干净环境：临时目录当 CLAUDE_CONFIG_DIR，只放登录凭证、引导完成标记、候选 skill 的 junction、共用提示词。
// 会话文件落 <configDir>/projects/<编码 cwd>/<session-id>.jsonl（探针 2026-09-09 证实）。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { type AgentCli, agentExecutable, parseClaudeResult, runCommand } from "./agent-cli.ts";

export interface ClaudeEnv { configDir: string; env: NodeJS.ProcessEnv }
export interface ClaudeHomeOptions { tmpDir: string; candidate: string; promptFile: string; hostConfigDir?: string }

export function readManifest(candidate: string): Array<{ name: string; target: string }> {
  const file = path.join(candidate, "profiles", "daily", "manifest.json");
  if (!existsSync(file)) throw new Error(`候选检出缺 skill 清单：${file}`);
  const j = JSON.parse(readFileSync(file, "utf8")) as { skills?: Array<{ name: string; target: string }> };
  return j.skills ?? [];
}

export function prepareClaudeHome(o: ClaudeHomeOptions): ClaudeEnv {
  const host = o.hostConfigDir ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
  const cred = path.join(host, ".credentials.json");
  if (!existsSync(cred)) throw new Error(`主配置目录没有登录凭证文件：${cred}`);
  if (!existsSync(o.promptFile)) throw new Error(`共用提示词文件不存在：${o.promptFile}`);
  const configDir = path.join(o.tmpDir, "claude-home");
  mkdirSync(path.join(configDir, "skills"), { recursive: true });
  copyFileSync(cred, path.join(configDir, ".credentials.json"));
  writeFileSync(path.join(configDir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }) + "\n");
  for (const s of readManifest(o.candidate)) {
    symlinkSync(path.join(o.candidate, s.target), path.join(configDir, "skills", s.name), "junction");
  }
  copyFileSync(o.promptFile, path.join(configDir, "CLAUDE.md"));
  return { configDir, env: { ...process.env, CLAUDE_CONFIG_DIR: configDir } };
}

export function removeClaudeHome(env: ClaudeEnv): void {
  rmSync(env.configDir, { recursive: true, force: true });
}

export function claudeCli(env: ClaudeEnv, o: { model: string; workDir: string; timeoutMs: number }): AgentCli {
  if (!env.env.CLAUDE_CONFIG_DIR) throw new Error("被测 Claude 进程缺 CLAUDE_CONFIG_DIR，拒绝起会话");
  const base = ["-p", "--model", o.model, "--output-format", "json", "--dangerously-skip-permissions"];
  const run = async (extra: string[], prompt: string) => {
    // 合并顺序：先 process.env 后 env.env，确保隔离的 CLAUDE_CONFIG_DIR 赢过环境里的同名变量。
    const mergedEnv = { ...process.env, ...env.env };
    const r = await runCommand(agentExecutable("claude"), [...base, ...extra], { cwd: o.workDir, env: mergedEnv, stdin: prompt, timeoutMs: o.timeoutMs });
    if (r.timedOut) throw new Error(`被测 Claude 超时（${Math.round(o.timeoutMs / 60000)} 分钟）`);
    if (r.code !== 0) throw new Error(`被测 Claude 退出 ${r.code}：${r.stderr.slice(0, 300)}`);
    return parseClaudeResult(r.stdout);
  };
  return {
    start: (prompt) => run(["--session-id", randomUUID()], prompt),
    resume: (id, prompt) => run(["--resume", id], prompt),
    sessionFile(id) {
      const projects = path.join(env.configDir, "projects");
      if (!existsSync(projects)) return null;
      for (const d of readdirSync(projects)) {
        const f = path.join(projects, d, `${id}.jsonl`);
        if (existsSync(f)) return f;
      }
      return null;
    },
  };
}
