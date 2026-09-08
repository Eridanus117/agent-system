// sj 命令入口的测试：直接调用 runCli，不起子进程。
import { describe, expect, test } from "bun:test";
import { runCli } from "../src/cli.ts";

describe("sj --help", () => {
  test("打印用法并退出 0", async () => {
    const out: string[] = [];
    const code = await runCli(["--help"], { stdout: (s) => out.push(s), stderr: () => {} });
    expect(code).toBe(0);
    expect(out.join("")).toContain("sj extract");
  });
  test("未知命令退出 2", async () => {
    const err: string[] = [];
    const code = await runCli(["nope"], { stdout: () => {}, stderr: (s) => err.push(s) });
    expect(code).toBe(2);
    expect(err.join("")).toContain("未知命令");
  });
});
