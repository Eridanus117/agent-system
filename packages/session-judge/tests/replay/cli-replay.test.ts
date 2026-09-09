// CLI 层只测参数校验与用法；真跑走 run.test.ts 的假脚本路径。
import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli.ts";

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
});
