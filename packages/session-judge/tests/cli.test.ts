// sj 命令入口的测试：直接调用 runCli，不起子进程。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

describe("sj extract", () => {
  test("sj extract 打印时间线", async () => {
    const out: string[] = [];
    const fixture = path.join(import.meta.dir, "..", "fixtures", "claude.jsonl");
    const code = await runCli(["extract", fixture], { stdout: (s) => out.push(s), stderr: () => {} });
    expect(code).toBe(0);
    expect(out.join("")).toContain("调用 skill: brainstorming");
  });
  test("sj extract 无参数返回 2", async () => {
    const err: string[] = [];
    const code = await runCli(["extract"], { stdout: () => {}, stderr: (s) => err.push(s) });
    expect(code).toBe(2);
    expect(err.join("")).toContain("用法");
  });
  test("sj extract 不认识的格式返回 1", async () => {
    const err: string[] = [];
    const fixture = path.join(import.meta.dir, "..", "package.json");
    const code = await runCli(["extract", fixture], { stdout: () => {}, stderr: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join("")).toContain("不认识的会话格式");
  });

  test("sj judge 用假评委落状态文件", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-"));
    const fake = path.join(tmp, "fake-judge.mjs");
    fs.writeFileSync(fake, [
      "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{",
      "console.log('| 判据 | 判决 | 证据 |');console.log('|---|---|---|');",
      "for (const j of ['J1','J2','J3','J4']) console.log(`| ${j} | 不适用 | 事件 1 |`);",
      "console.log('');console.log('总评：假评委。');});",
    ].join("\n"));
    process.env.SJ_STATE_DIR = path.join(tmp, "state");
    process.env.SJ_JUDGE_CMD = `node ${fake}`;
    try {
      const out: string[] = [];
      const fixture = path.join(import.meta.dir, "..", "fixtures", "claude.jsonl");
      const code = await runCli(["judge", fixture], { stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
      expect(code).toBe(0);
      const text = out.join("");
      expect(text).toContain("| M1 | 符合 |");
      expect(text).toContain("| J1 | 不适用 |");
      const written = fs.readdirSync(path.join(tmp, "state"), { recursive: true }).map(String);
      expect(written.some((f) => f.endsWith("claude.md"))).toBe(true);
    } finally {
      delete process.env.SJ_STATE_DIR;
      delete process.env.SJ_JUDGE_CMD;
    }
  });

  test("sj judge 评委进程非零退出返回 1", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-"));
    const fake = path.join(tmp, "fake-judge-fail.mjs");
    fs.writeFileSync(fake, "process.exit(1);\n");
    process.env.SJ_STATE_DIR = path.join(tmp, "state");
    process.env.SJ_JUDGE_CMD = `node ${fake}`;
    try {
      const err: string[] = [];
      const fixture = path.join(import.meta.dir, "..", "fixtures", "claude.jsonl");
      const code = await runCli(["judge", fixture], { stdout: () => {}, stderr: (s) => err.push(s) });
      expect(code).toBe(1);
      expect(err.join("")).toContain("评委进程退出");
    } finally {
      delete process.env.SJ_STATE_DIR;
      delete process.env.SJ_JUDGE_CMD;
    }
  });

  test("sj judge --judge 传非法值返回 2", async () => {
    const fixture = path.join(import.meta.dir, "..", "fixtures", "claude.jsonl");
    const err: string[] = [];
    const code = await runCli(["judge", fixture, "--judge", "xyz"], { stdout: () => {}, stderr: (s) => err.push(s) });
    expect(code).toBe(2);
    expect(err.join("")).toContain("--judge 只支持 claude 或 omp");
  });
});
