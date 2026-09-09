// OMP 的干净环境：~/.omp/profiles/<name>/ 隔离设置、会话、缓存；登录态靠拷主 profile 的 agent.db；
// 规则读 profiles/<name>/agent/AGENTS.md；用户级 skill 关掉、项目级 skill 从 work/.agents/skills 读（探针 2026-09-09 证实）。
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { type AgentCli, agentExecutable, parseOmpEvents, runCommand } from "./agent-cli.ts";
import { readManifest } from "./isolate-claude.ts";

export interface OmpEnv { profile: string; profileDir: string; sessionDir: string; env: NodeJS.ProcessEnv }
export interface OmpProfileOptions { name: string; tmpDir: string; candidate: string; promptFile: string; workDir: string; hostOmpDir?: string }

const CONFIG = `# 由 sj replay 生成：只读项目级 skill（候选版本投在 work/.agents/skills），不读用户级；不加载扩展。
skills:
  enabled: true
  enableAgentsUser: false
  enableAgentsProject: true
  enableClaudeUser: false
  enableClaudeProject: false
  enableCodexUser: false
extensions: []
`;

export function prepareOmpProfile(o: OmpProfileOptions): OmpEnv {
  const host = o.hostOmpDir ?? path.join(os.homedir(), ".omp");
  const db = path.join(host, "agent", "agent.db");
  if (!existsSync(db)) throw new Error(`主 profile 没有 agent.db（登录态）：${db}`);
  if (!existsSync(o.promptFile)) throw new Error(`共用提示词文件不存在：${o.promptFile}`);
  const profileDir = path.join(host, "profiles", o.name);
  const agentDir = path.join(profileDir, "agent");
  mkdirSync(agentDir, { recursive: true });
  // agent.db 一旦拷进 profileDir 就是一份凭证副本：后面清单/junction 任何一步炸了，
  // run.ts 那边还没来得及注册 cleanup（prepareOmpProfile 都没返回），只能这里自己兜底删掉，不能让它漏在 host 的 profiles/ 下。
  try {
    copyFileSync(db, path.join(agentDir, "agent.db"));
    writeFileSync(path.join(agentDir, "config.yml"), CONFIG);
    copyFileSync(o.promptFile, path.join(agentDir, "AGENTS.md"));
    const skillsDir = path.join(o.workDir, ".agents", "skills");
    mkdirSync(skillsDir, { recursive: true });
    for (const s of readManifest(o.candidate)) {
      symlinkSync(path.join(o.candidate, s.target), path.join(skillsDir, s.name), "junction");
    }
    const sessionDir = path.join(o.tmpDir, "omp-sessions");
    mkdirSync(sessionDir, { recursive: true });
    return { profile: o.name, profileDir, sessionDir, env: { ...process.env } };
  } catch (err) {
    rmSync(profileDir, { recursive: true, force: true });
    throw err;
  }
}

/** profile 里有 agent.db 凭证副本，无论成败都要删。 */
export function removeOmpProfile(env: OmpEnv): void {
  rmSync(env.profileDir, { recursive: true, force: true });
}

export function ompCli(env: OmpEnv, o: { model: string; workDir: string; timeoutMs: number }): AgentCli {
  if (!env.profile) throw new Error("被测 OMP 缺 --profile，拒绝起会话");
  const base = ["--profile", env.profile, "-p", "--model", o.model, "--mode", "json", "--auto-approve", "--no-extensions", "--session-dir", env.sessionDir];
  const run = async (extra: string[], prompt: string) => {
    // 准备好的环境值覆盖当前环境（后设的 FAKE_TURNS 等需要可见）。
    const mergedEnv = { ...process.env, ...env.env };
    const r = await runCommand(agentExecutable("omp"), [...base, ...extra, prompt], { cwd: o.workDir, env: mergedEnv, timeoutMs: o.timeoutMs });
    if (r.timedOut) throw new Error(`被测 OMP 超时（${Math.round(o.timeoutMs / 60000)} 分钟）`);
    if (r.code !== 0) throw new Error(`被测 OMP 退出 ${r.code}：${r.stderr.slice(0, 300)}`);
    return parseOmpEvents(r.stdout);
  };
  return {
    start: (prompt) => run([], prompt),
    resume: (id, prompt) => run(["--resume", id], prompt),
    sessionFile(id) {
      if (!existsSync(env.sessionDir)) return null;
      const hit = readdirSync(env.sessionDir).find((f) => f.endsWith(`_${id}.jsonl`));
      return hit ? path.join(env.sessionDir, hit) : null;
    },
  };
}
