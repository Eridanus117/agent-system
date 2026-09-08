#!/usr/bin/env bun
// 公共面门禁的 workflow smoke 检查：在临时目录里造两个合成 git 仓，证明 CLI 对违规 tree 退出 2、
// 对合规 tree 退出 0、缺策略退出 1。全部内容合成；任一断言失败即以非零退出，让 CI 在真正扫描前失败。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "public-gate-smoke-"));
const failures: string[] = [];

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=synthetic", "-c", "user.email=synthetic@example.invalid", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 失败：${result.stderr}`);
}

function makeRepo(name: string, files: Record<string, string>): string {
  const dir = path.join(sandbox, name);
  fs.mkdirSync(dir);
  git(dir, "init", "-q");
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "synthetic");
  return dir;
}

function gate(repo: string, policy: string | null): { status: number | null; out: string } {
  const args = [CLI, "assess-public-tree", "--repo", repo, "--rev", "HEAD"];
  if (policy !== null) args.push("--policy", policy);
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function check(label: string, actual: number | null, expected: number, out: string): void {
  if (actual !== expected) failures.push(`${label}: 期望退出 ${expected}，实际 ${actual}\n${out}`);
  else process.stdout.write(`ok  ${label} (exit ${actual})\n`);
}

try {
  const policy = path.join(sandbox, "policy.json");
  fs.writeFileSync(
    policy,
    JSON.stringify({
      version: 1,
      allowedPaths: ["README.md", "docs/"],
      deniedPaths: ["*.log"],
      contentExemptPaths: [],
      deniedTokenHashes: [],
      maxFileBytes: 100000,
      largeFileAllowlist: [],
      archiveMaxDepth: 2,
    }),
  );
  const clean = makeRepo("clean", { "README.md": "synthetic readme\n", "docs/guide.md": "synthetic guide\n" });
  const dirty = makeRepo("dirty", {
    "README.md": "synthetic readme\n",
    "docs/leak.md": `token ghp_${"z".repeat(36)}\n`,
    "docs/run.log": "x\n",
    "secrets/plain.txt": "not allowlisted\n",
  });
  // 工作目录里放一个未跟踪的敏感文件：它不在 tree 里，不得影响结果。
  fs.writeFileSync(path.join(clean, "untracked.txt"), `ghp_${"z".repeat(36)}\n`);

  const allowed = gate(clean, policy);
  check("合规 tree allowed", allowed.status, 0, allowed.out);
  const blocked = gate(dirty, policy);
  check("违规 tree blocked", blocked.status, 2, blocked.out);
  for (const expected of ["docs/leak.md: credential", "docs/run.log: path-denied", "secrets/plain.txt: path-not-allowlisted"]) {
    if (!blocked.out.includes(expected)) failures.push(`违规输出缺少可定位的 violation：${expected}\n${blocked.out}`);
  }
  const missing = gate(clean, path.join(sandbox, "absent.json"));
  check("缺策略失败", missing.status, 1, missing.out);
  const none = gate(clean, null);
  check("无 --policy 失败", none.status, 1, none.out);
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n\n")}\n`);
  process.exit(1);
}
process.stdout.write("public gate smoke passed\n");
