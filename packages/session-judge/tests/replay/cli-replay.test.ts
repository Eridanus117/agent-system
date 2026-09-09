// CLI 层只测参数校验与用法；真跑走 run.test.ts 的假脚本路径。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCli } from "../../src/cli.ts";

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "replay");

describe("sj replay / score 参数", () => {
  test("用法里有两个新命令", async () => {
    const out: string[] = [];
    await runCli(["--help"], { stdout: (s) => out.push(s), stderr: () => {} });
    expect(out.join("")).toContain("sj replay");
    expect(out.join("")).toContain("sj score");
  });
  test("replay 缺题号退出 2", async () => {
    const err: string[] = [];
    expect(await runCli(["replay"], { stdout: () => {}, stderr: (s) => err.push(s) })).toBe(2);
    expect(err.join("")).toContain("用法");
  });
  test("--client 越界退出 2", async () => {
    const err: string[] = [];
    expect(await runCli(["replay", "10", "--client", "gemini"], { stdout: () => {}, stderr: (s) => err.push(s) })).toBe(2);
    expect(err.join("")).toContain("--client");
  });
  test("找不到题退出 1", async () => {
    process.env.SJ_BANK_DIR = "C:/repo/nope";
    try {
      const err: string[] = [];
      expect(await runCli(["replay", "10"], { stdout: () => {}, stderr: (s) => err.push(s) })).toBe(1);
      expect(err.join("")).toContain("找不到题");
    } finally { delete process.env.SJ_BANK_DIR; }
  });
  test("score 空题库退出 1", async () => {
    process.env.SJ_BANK_DIR = "C:/repo/nope";
    try {
      const err: string[] = [];
      expect(await runCli(["score"], { stdout: () => {}, stderr: (s) => err.push(s) })).toBe(1);
      expect(err.join("")).toContain("题库里没有题");
    } finally { delete process.env.SJ_BANK_DIR; }
  });
  test("--client 不在题的 clients 里，拒绝并退出 2", async () => {
    const bank = fs.mkdtempSync(path.join(os.tmpdir(), "sj-cli-bank-"));
    const storyDir = path.join(bank, "10-fixture");
    fs.cpSync(path.join(FIX, "story-ok"), storyDir, { recursive: true });
    const storyFile = path.join(storyDir, "story.md");
    const rewritten = fs.readFileSync(storyFile, "utf8").replace(/^clients:.*$/m, "clients: [claude]");
    fs.writeFileSync(storyFile, rewritten);
    process.env.SJ_BANK_DIR = bank;
    try {
      const err: string[] = [];
      expect(await runCli(["replay", "10", "--client", "omp"], { stdout: () => {}, stderr: (s) => err.push(s) })).toBe(2);
      expect(err.join("")).toContain("不跑 omp");
    } finally { delete process.env.SJ_BANK_DIR; }
  });
});
