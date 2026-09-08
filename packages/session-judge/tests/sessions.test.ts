// listSessions：扫两个客户端目录，坏条目（悬空符号链接、readdir/stat 之间消失的文件）不能拖垮整次扫描。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSessions } from "../src/sessions.ts";

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-sessions-")); });
afterEach(() => {
  delete process.env.SJ_CLAUDE_DIR; delete process.env.SJ_OMP_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("listSessions 跳过坏条目", () => {
  test("悬空符号链接（dangling junction）不让扫描抛错，好会话仍返回", () => {
    const claude = path.join(tmp, "claude");
    const good = path.join(claude, "proj");
    fs.mkdirSync(good, { recursive: true });
    fs.writeFileSync(path.join(good, "s1.jsonl"), "{}\n");
    // 悬空目录联接（junction 不要求管理员权限，指向不存在的目标即为「悬空」）：
    // readdirSync(root) 能看到这个条目，但 statSync 会因目标不存在而抛 ENOENT。
    fs.symlinkSync(path.join(claude, "does-not-exist"), path.join(claude, "dangling"), "junction");
    process.env.SJ_CLAUDE_DIR = claude;
    process.env.SJ_OMP_DIR = path.join(tmp, "omp-empty");
    const result = listSessions(10);
    expect(result).toHaveLength(1);
    expect(result[0]?.file.endsWith("s1.jsonl")).toBe(true);
  });

  test("root 下直接是文件而非目录：跳过，不抛错", () => {
    const claude = path.join(tmp, "claude2");
    fs.mkdirSync(claude, { recursive: true });
    const good = path.join(claude, "proj");
    fs.mkdirSync(good, { recursive: true });
    fs.writeFileSync(path.join(good, "s1.jsonl"), "{}\n");
    // 直接在 root 下放一个文件（不是目录）：旧代码本来就不会因此抛错，这里确认新代码同样不抛错。
    fs.writeFileSync(path.join(claude, "not-a-dir.txt"), "x");
    process.env.SJ_CLAUDE_DIR = claude;
    process.env.SJ_OMP_DIR = path.join(tmp, "omp-empty2");
    const result = listSessions(10);
    expect(result).toHaveLength(1);
    expect(result[0]?.file.endsWith("s1.jsonl")).toBe(true);
  });

  test("目录不存在的一侧返回空数组，不影响另一侧", () => {
    const claude = path.join(tmp, "claude3");
    const good = path.join(claude, "proj");
    fs.mkdirSync(good, { recursive: true });
    fs.writeFileSync(path.join(good, "s1.jsonl"), "{}\n");
    process.env.SJ_CLAUDE_DIR = claude;
    process.env.SJ_OMP_DIR = path.join(tmp, "definitely-missing");
    const result = listSessions(10);
    expect(result).toHaveLength(1);
  });
});
