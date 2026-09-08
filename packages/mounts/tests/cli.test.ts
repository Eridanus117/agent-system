// mounts CLI 的端到端行为：在临时目录里建真实 git 仓与合成 root，验证生命周期命令的退出码、
// 副作用边界（不覆盖、不部分写入、失败不阻断 checkout）与公共面评估入口。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");
let sandbox = "";
let repo = "";
let root = "";

function run(args: string[], cwd = repo): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function git(args: string[], cwd = repo): string {
  const result = spawnSync("git", ["-c", "user.name=synthetic", "-c", "user.email=synthetic@example.invalid", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 失败：${result.stderr}`);
  return (result.stdout ?? "").trim();
}

function json(args: string[]): { status: number | null; body: any } {
  const result = run([...args, "--json"]);
  return { status: result.status, body: JSON.parse(result.stdout) };
}

function writeManifest(mounts: unknown[]): void {
  fs.writeFileSync(path.join(repo, ".git", "mounts", "manifest.json"), JSON.stringify({ version: 1, profile: "private-local", mounts }));
}

function writeRoots(rootPath: string): void {
  fs.writeFileSync(path.join(repo, ".git", "mounts", "roots.json"), JSON.stringify({ version: 1, roots: { private: { path: rootPath, trust: "private-local" } } }));
}

const NAV = { id: "nav", root: "private", source: "nav", target: ".omp/local/nav", type: "dir", required: true, readonly: true };
const NOTES = { id: "notes", root: "private", source: "notes.md", target: ".omp/local/notes.md", type: "file", required: true, readonly: true };
const targetPath = (): string => path.join(repo, ".omp", "local", "nav");

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mounts-cli-"));
  repo = path.join(sandbox, "repo");
  root = path.join(sandbox, "private-root");
  fs.mkdirSync(path.join(root, "nav"), { recursive: true });
  fs.writeFileSync(path.join(root, "nav", "index.md"), "synthetic nav\n");
  fs.writeFileSync(path.join(root, "notes.md"), "synthetic notes\n");
  fs.mkdirSync(repo);
  git(["init", "-q"]);
  fs.writeFileSync(path.join(repo, "README.md"), "synthetic readme\n");
  git(["add", "README.md"]);
  git(["commit", "-q", "-m", "init"]);
  expect(run(["init"]).status).toBe(0);
  writeManifest([NAV]);
  writeRoots(root);
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("init", () => {
  test("建骨架并把 overlay 入口写进 info/exclude；重复执行无变化", () => {
    expect(fs.existsSync(path.join(repo, ".git", "mounts", "roots.json"))).toBe(true);
    expect(fs.readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8")).toContain("/.omp/local/\n");
    const again = run(["init"]);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain("already initialized");
    expect(fs.readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8").split("/.omp/local/").length).toBe(2);
  });

  test("不是 git checkout 时退出 1", () => {
    const result = run(["init"], sandbox);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("不是 git checkout");
  });
});

describe("plan 与 sync", () => {
  test("plan 无副作用且可被脚本消费", () => {
    const { status, body } = json(["plan"]);
    expect(status).toBe(0);
    expect(body.status).toBe("ready");
    expect(body.writes.map((w: { target: string }) => w.target)).toEqual([".omp/local/nav"]);
    expect(fs.existsSync(path.join(repo, ".omp"))).toBe(false);
  });

  test("sync 创建链接，git 看不到它，再次 sync 只保留不重写", () => {
    const first = json(["sync"]);
    expect(first.status).toBe(0);
    expect(first.body.synced).toBe(1);
    expect(fs.lstatSync(targetPath()).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(targetPath(), "index.md"), "utf8")).toBe("synthetic nav\n");
    expect(git(["status", "--porcelain"])).toBe("");
    const second = json(["sync"]);
    expect(second.status).toBe(0);
    expect(second.body.writes).toEqual([]);
    expect(second.body.keeps.map((k: { mount: string }) => k.mount)).toEqual(["nav"]);
  });

  test("文件类型的 source 也能挂", () => {
    writeManifest([NAV, NOTES]);
    expect(json(["sync"]).status).toBe(0);
    expect(fs.readFileSync(path.join(repo, ".omp", "local", "notes.md"), "utf8")).toBe("synthetic notes\n");
  });

  test("root 缺失：sync 阻断、不写任何东西、--hook 仍退出 0", () => {
    writeRoots(path.join(sandbox, "gone"));
    const result = run(["sync"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("private overlay unavailable");
    expect(result.stdout).toContain("root-missing");
    expect(fs.existsSync(path.join(repo, ".omp"))).toBe(false);
    const hook = run(["sync", "--hook"]);
    expect(hook.status).toBe(0);
    expect(hook.stderr).toContain("private overlay unavailable");
    expect(fs.existsSync(path.join(repo, ".omp"))).toBe(false);
  });

  test("一条阻断时另一条可写的也不写（无部分挂载）", () => {
    writeManifest([NAV, { ...NOTES, source: "absent.md" }]);
    const result = json(["sync"]);
    expect(result.status).toBe(2);
    expect(result.body.errors.map((e: { code: string }) => e.code)).toContain("source-missing");
    expect(fs.existsSync(path.join(repo, ".omp"))).toBe(false);
  });

  test("target 被普通文件占用：阻断且文件原样保留", () => {
    fs.mkdirSync(path.dirname(targetPath()), { recursive: true });
    fs.writeFileSync(targetPath(), "user file\n");
    const result = json(["sync"]);
    expect(result.status).toBe(2);
    expect(result.body.errors[0].code).toBe("target-occupied");
    expect(fs.readFileSync(targetPath(), "utf8")).toBe("user file\n");
  });

  test("target 未被 git 排除：阻断且不创建链接", () => {
    fs.writeFileSync(path.join(repo, ".git", "info", "exclude"), "");
    const result = json(["sync"]);
    expect(result.status).toBe(2);
    expect(result.body.errors[0].code).toBe("target-not-excluded");
    expect(fs.existsSync(path.join(repo, ".omp"))).toBe(false);
  });

  test("manifest 缺失是用法错误，退出 1", () => {
    fs.rmSync(path.join(repo, ".git", "mounts", "manifest.json"));
    expect(run(["plan"]).status).toBe(1);
  });
});

describe("doctor 与 repair", () => {
  test("doctor 报告状态与只读条目", () => {
    const { status, body } = json(["doctor"]);
    expect(status).toBe(0);
    expect(body.status).toBe("ready");
    expect(body.readonly).toEqual(["nav"]);
    fs.writeFileSync(path.join(repo, ".git", "info", "exclude"), "");
    const broken = json(["doctor"]);
    expect(broken.status).toBe(2);
    expect(broken.body.errors[0].code).toBe("target-not-excluded");
  });

  test("错误软链：sync 不替换，repair 才替换", () => {
    fs.mkdirSync(path.dirname(targetPath()), { recursive: true });
    fs.symlinkSync(path.join(root, "notes.md"), targetPath(), "file");
    const blocked = json(["sync"]);
    expect(blocked.status).toBe(2);
    expect(blocked.body.errors[0].code).toBe("target-wrong-symlink");
    expect(fs.readlinkSync(targetPath())).toContain("notes.md");
    const repaired = run(["repair"]);
    expect(repaired.status).toBe(0);
    expect(repaired.stdout).toContain("repaired: 1");
    expect(fs.readFileSync(path.join(targetPath(), "index.md"), "utf8")).toBe("synthetic nav\n");
  });

  test("repair 不碰普通文件", () => {
    fs.mkdirSync(path.dirname(targetPath()), { recursive: true });
    fs.writeFileSync(targetPath(), "user file\n");
    const result = run(["repair"]);
    expect(result.status).toBe(2);
    expect(fs.readFileSync(targetPath(), "utf8")).toBe("user file\n");
  });
});

describe("assess-public-tree", () => {
  const policyFile = (): string => {
    const file = path.join(sandbox, "policy.json");
    fs.writeFileSync(
      file,
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
    return file;
  };

  test("合规 tree 通过；未跟踪的敏感文件不影响结果", () => {
    fs.writeFileSync(path.join(repo, "untracked.txt"), `ghp_${"z".repeat(36)}\n`);
    const result = run(["assess-public-tree", "--policy", policyFile()]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("status: allowed (scanned 1)");
  });

  test("违规 tree 阻断并列出可定位的 violation", () => {
    fs.mkdirSync(path.join(repo, "docs"));
    fs.writeFileSync(path.join(repo, "docs", "leak.md"), `token ghp_${"z".repeat(36)}\n`);
    fs.writeFileSync(path.join(repo, "docs", "run.log"), "x\n");
    git(["add", "."]);
    git(["commit", "-q", "-m", "leak"]);
    const result = json(["assess-public-tree", "--policy", policyFile()]);
    expect(result.status).toBe(2);
    expect(result.body.violations).toEqual(
      expect.arrayContaining([
        { path: "docs/leak.md", code: "credential", detail: "github-token" },
        { path: "docs/run.log", code: "path-denied", detail: "*.log" },
      ]),
    );
  });

  test("缺少策略或策略文件不存在都退出 1", () => {
    expect(run(["assess-public-tree"]).status).toBe(1);
    expect(run(["assess-public-tree", "--policy", path.join(sandbox, "nope.json")]).status).toBe(1);
  });

  test("未知命令退出 1 并打印用法", () => {
    const result = run(["bogus"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("用法");
  });
});

describe("post-checkout hook 与 worktree", () => {
  // hook 脚本是测试在临时仓里生成的，不是仓内资产；它只调用 CLI 的 --hook 模式。
  const installHook = (): string => {
    const log = path.join(sandbox, "hook.log");
    const hook = path.join(repo, ".git", "hooks", "post-checkout");
    const bun = process.execPath.replaceAll("\\", "/");
    const cli = CLI.replaceAll("\\", "/");
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.writeFileSync(hook, `#!/bin/sh\n"${bun}" "${cli}" sync --hook --checkout "$PWD" >> "${log.replaceAll("\\", "/")}" 2>&1\n`, { mode: 0o755 });
    return log;
  };

  test("root 缺失时 checkout 照常完成，hook 只报告 unavailable 且不写任何东西", () => {
    const log = installHook();
    writeRoots(path.join(sandbox, "gone"));
    git(["checkout", "-q", "-b", "feature"]);
    expect(git(["branch", "--show-current"])).toBe("feature");
    expect(fs.readFileSync(log, "utf8")).toContain("private overlay unavailable");
    expect(fs.existsSync(path.join(repo, ".omp"))).toBe(false);
  });

  test("root 就绪后 checkout 触发的 hook 创建链接；新 worktree 共享同一份 manifest", () => {
    const log = installHook();
    git(["checkout", "-q", "-b", "feature"]);
    expect(fs.readFileSync(log, "utf8")).not.toContain("unavailable");
    expect(fs.lstatSync(targetPath()).isSymbolicLink()).toBe(true);
    // git worktree add 也会触发 post-checkout，所以新 worktree 一建好 hook 就已经同步过了。
    const worktree = path.join(sandbox, "wt");
    git(["worktree", "add", "-q", worktree, "-b", "wt-branch"]);
    expect(fs.lstatSync(path.join(worktree, ".omp", "local", "nav")).isSymbolicLink()).toBe(true);
    const inWorktree = json(["plan", "--checkout", worktree]);
    expect(inWorktree.status).toBe(0);
    expect(inWorktree.body.writes).toEqual([]);
    expect(inWorktree.body.keeps.map((k: { target: string }) => k.target)).toEqual([".omp/local/nav"]);
    expect(run(["sync", "--checkout", worktree]).status).toBe(0);
    expect(git(["status", "--porcelain"], worktree)).toBe("");
  });
});
