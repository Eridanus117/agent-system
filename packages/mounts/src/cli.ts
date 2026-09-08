#!/usr/bin/env bun
// mounts CLI：目标仓侧的薄执行层。plan 无副作用；sync 只创建计划里已验证且缺失的链接；
// repair 才允许显式替换错误软链；doctor 报告 source / target / exclude / trust 问题；
// assess-public-tree 对 git tree 跑公共面评估。退出码：0 成功，1 用法或环境错误，2 计划或评估被阻断。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { OVERLAY_ENTRY, type MountError, type MountPlan } from "./contract.ts";
import { createLink, fileSystemProbe, removeLink } from "./fs-probe.ts";
import { loadGitTree } from "./git-tree.ts";
import { evaluateMountPlan } from "./mount-plan.ts";
import { joinAbsolute, toSlash } from "./paths.ts";
import { assessPublicTree } from "./public-tree.ts";

const VERSION = "0.1.0";
const UNAVAILABLE = "private overlay unavailable";
const USAGE = `用法：mounts <command> [options]

  init                 在目标仓 git common dir 建 manifest / roots 骨架，并把 ${OVERLAY_ENTRY} 写进 info/exclude
  plan                 评估挂载计划，不写任何东西
  sync [--hook]        只创建计划里已验证且缺失的链接；--hook 模式失败也退出 0，不阻断 checkout
  doctor               报告 source / target / exclude / trust 问题
  repair               只替换指向错误或已断的符号链接；普通文件与目录永远不动
  assess-public-tree   对 git tree 跑公共面评估（--rev、--policy、--repo）
  version

通用选项：--checkout <dir>（默认当前目录）、--manifest <file>、--roots <file>、--json`;

interface Options {
  command: string;
  checkout: string;
  manifest?: string;
  roots?: string;
  json: boolean;
  hook: boolean;
  rev: string;
  policy?: string;
  repo?: string;
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Options {
  const options: Options = { command: argv[0] ?? "", checkout: process.cwd(), json: false, hook: false, rev: "HEAD" };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new UsageError(`${arg} 缺少参数`);
      i += 1;
      return value;
    };
    switch (arg) {
      case "--checkout":
        options.checkout = next();
        break;
      case "--manifest":
        options.manifest = next();
        break;
      case "--roots":
        options.roots = next();
        break;
      case "--json":
        options.json = true;
        break;
      case "--hook":
        options.hook = true;
        break;
      case "--rev":
        options.rev = next();
        break;
      case "--policy":
        options.policy = next();
        break;
      case "--repo":
        options.repo = next();
        break;
      default:
        throw new UsageError(`未知选项 ${arg}`);
    }
  }
  return options;
}

function git(cwd: string, args: string[]): { status: number | null; out: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw new UsageError(`git 无法启动：${result.error.message}`);
  return { status: result.status, out: (result.stdout ?? "").trim() };
}

/** 目标仓的 git common dir（worktree 共享层）；manifest、roots 与 info/exclude 都放这里。 */
function commonDir(checkout: string): string {
  const result = git(checkout, ["rev-parse", "--git-common-dir"]);
  if (result.status !== 0 || result.out === "") throw new UsageError(`${checkout} 不是 git checkout`);
  return toSlash(path.resolve(checkout, result.out));
}

function defaultFiles(options: Options): { manifest: string; roots: string } {
  const base = `${commonDir(options.checkout)}/mounts`;
  return {
    manifest: options.manifest ?? `${base}/manifest.json`,
    roots: options.roots ?? `${base}/roots.json`,
  };
}

function readJson(file: string, label: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new UsageError(`${label} 不存在：${file}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${label} 不是合法 JSON：${(error as Error).message}`);
  }
}

function makePlan(options: Options): MountPlan {
  const files = defaultFiles(options);
  return evaluateMountPlan({
    manifest: readJson(files.manifest, "manifest"),
    roots: readJson(files.roots, "roots"),
    checkout: toSlash(path.resolve(options.checkout)),
    probe: fileSystemProbe(),
  });
}

/** 执行层的额外阻断：写入的 target 必须已被 git 排除，否则符号链接会进业务分支。 */
function excludeErrors(checkout: string, targets: string[]): MountError[] {
  const errors: MountError[] = [];
  for (const target of targets) {
    const result = git(checkout, ["check-ignore", "-q", "--no-index", target]);
    if (result.status !== 0) {
      errors.push({ code: "target-not-excluded", message: `target 未被 git 排除，先跑 mounts init 或手动加进 info/exclude`, path: target });
    }
  }
  return errors;
}

function blockedPlan(plan: MountPlan, extra: MountError[]): MountPlan {
  return { status: "blocked", errors: [...plan.errors, ...extra], writes: [], keeps: plan.keeps, skips: plan.skips };
}

/** 创建计划里的链接；任何一条失败就把本轮已创建的全部撤掉，不留部分挂载。 */
function applyWrites(checkout: string, plan: MountPlan & { status: "ready" }): MountError[] {
  const created: string[] = [];
  for (const write of plan.writes) {
    const target = joinAbsolute(checkout, write.target);
    try {
      createLink(write.source, target, write.type);
      created.push(target);
    } catch (error) {
      for (const done of created.reverse()) {
        try {
          removeLink(done);
        } catch {
          // 回滚失败只能如实报告，不吞。
        }
      }
      return [{ code: "write-failed", message: `创建链接失败并已回滚本轮写入：${(error as Error).message}`, mount: write.mount, path: target }];
    }
  }
  return [];
}

function printPlan(plan: MountPlan, options: Options, extra: Record<string, unknown> = {}): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...plan, ...extra }, null, 2)}\n`);
    return;
  }
  const lines: string[] = [`status: ${plan.status}`];
  for (const keep of plan.keeps) lines.push(`keep   ${keep.target} -> ${keep.source}`);
  for (const write of plan.writes) lines.push(`write  ${write.target} -> ${write.source}`);
  for (const skip of plan.skips) lines.push(`skip   ${skip.mount} (${skip.reason})`);
  for (const error of plan.errors) lines.push(`error  ${error.code}${error.mount ? ` [${error.mount}]` : ""}: ${error.message}${error.path ? ` (${error.path})` : ""}`);
  for (const [key, value] of Object.entries(extra)) lines.push(`${key}: ${JSON.stringify(value)}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function commandInit(options: Options): number {
  const common = commonDir(options.checkout);
  const dir = `${common}/mounts`;
  fs.mkdirSync(dir, { recursive: true });
  const files = defaultFiles(options);
  const created: string[] = [];
  if (!fs.existsSync(files.manifest)) {
    fs.writeFileSync(files.manifest, `${JSON.stringify({ version: 1, profile: "private-local", mounts: [] }, null, 2)}\n`);
    created.push(files.manifest);
  }
  if (!fs.existsSync(files.roots)) {
    fs.writeFileSync(files.roots, `${JSON.stringify({ version: 1, roots: {} }, null, 2)}\n`);
    created.push(files.roots);
  }
  const exclude = `${common}/info/exclude`;
  fs.mkdirSync(`${common}/info`, { recursive: true });
  const line = `/${OVERLAY_ENTRY}/`;
  const existing = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8") : "";
  if (!existing.split(/\r?\n/).includes(line)) {
    fs.writeFileSync(exclude, `${existing}${existing.endsWith("\n") || existing === "" ? "" : "\n"}${line}\n`);
    created.push(exclude);
  }
  const payload = { manifest: files.manifest, roots: files.roots, exclude, created };
  process.stdout.write(options.json ? `${JSON.stringify(payload, null, 2)}\n` : `${created.length === 0 ? "already initialized" : `created: ${created.join(", ")}`}\n`);
  return 0;
}

function commandPlan(options: Options): number {
  const plan = makePlan(options);
  printPlan(plan, options);
  return plan.status === "ready" ? 0 : 2;
}

function commandSync(options: Options): number {
  const checkout = toSlash(path.resolve(options.checkout));
  let plan = makePlan(options);
  if (plan.status === "ready") {
    const missing = excludeErrors(checkout, plan.writes.map((write) => write.target));
    if (missing.length > 0) plan = blockedPlan(plan, missing);
  }
  if (plan.status === "ready") {
    const failures = applyWrites(checkout, plan);
    if (failures.length > 0) plan = blockedPlan(plan, failures);
  }
  if (plan.status === "blocked") {
    process.stderr.write(`${UNAVAILABLE}\n`);
    printPlan(plan, options);
    return options.hook ? 0 : 2;
  }
  printPlan(plan, options, { synced: plan.writes.length });
  return 0;
}

function commandDoctor(options: Options): number {
  const checkout = toSlash(path.resolve(options.checkout));
  const plan = makePlan(options);
  const targets = [...plan.writes.map((w) => w.target), ...plan.keeps.map((k) => k.target)];
  const exclude = excludeErrors(checkout, targets);
  const report = exclude.length > 0 ? blockedPlan(plan, exclude) : plan;
  printPlan(report, options, { readonly: plan.writes.filter((w) => w.readonly).map((w) => w.mount) });
  return report.status === "ready" ? 0 : 2;
}

/** repair 只处理 target-wrong-symlink：移除错误链接后重新评估；其它阻断原样保留。 */
function commandRepair(options: Options): number {
  const first = makePlan(options);
  const wrong = first.errors.filter((error) => error.code === "target-wrong-symlink" && error.path !== undefined);
  const removed: string[] = [];
  for (const error of wrong) {
    removeLink(error.path!);
    removed.push(error.path!);
  }
  const status = commandSync(options);
  process.stdout.write(`repaired: ${removed.length}\n`);
  return status;
}

function commandAssess(options: Options): number {
  const repo = toSlash(path.resolve(options.repo ?? options.checkout));
  if (options.policy === undefined) throw new UsageError("assess-public-tree 需要 --policy <file>");
  const policy = readJson(options.policy, "policy");
  const assessment = assessPublicTree(loadGitTree(repo, options.rev), policy);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
  } else {
    const lines = [`status: ${assessment.status} (scanned ${assessment.scanned})`];
    for (const violation of assessment.violations) {
      lines.push(`${violation.path}: ${violation.code}${violation.detail ? ` (${violation.detail})` : ""}`);
    }
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  return assessment.status === "allowed" ? 0 : 2;
}

function main(argv: string[]): number {
  const options = parseArgs(argv);
  switch (options.command) {
    case "init":
      return commandInit(options);
    case "plan":
      return commandPlan(options);
    case "sync":
      return commandSync(options);
    case "doctor":
      return commandDoctor(options);
    case "repair":
      return commandRepair(options);
    case "assess-public-tree":
      return commandAssess(options);
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return 0;
    default:
      throw new UsageError(USAGE);
  }
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (error) {
  const hook = process.argv.includes("--hook");
  if (error instanceof UsageError) {
    process.stderr.write(`${error.message}\n`);
    if (hook) process.stderr.write(`${UNAVAILABLE}\n`);
    process.exit(hook ? 0 : 1);
  }
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  if (hook) process.stderr.write(`${UNAVAILABLE}\n`);
  process.exit(hook ? 0 : 1);
}
