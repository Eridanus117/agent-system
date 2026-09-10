// git 子进程薄封装：同步、失败抛错带 stderr。运行器只用它做 clone / checkout / 裸仓 / HEAD / show-ref。
import { spawnSync } from "node:child_process";

export function git(args: string[], cwd: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} 失败（${cwd}）：${(r.stderr || "").trim().slice(0, 300)}`);
  return r.stdout;
}

export function gitHead(dir: string): string {
  return git(["rev-parse", "HEAD"], dir).trim();
}

/** 裸仓的全部引用；空仓 show-ref 退出 1，按 "" 处理。 */
export function showRef(gitDir: string): string {
  const r = spawnSync("git", ["--git-dir", gitDir, "show-ref"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}
