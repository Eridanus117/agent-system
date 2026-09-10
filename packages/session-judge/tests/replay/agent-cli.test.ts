// tests/replay/agent-cli.test.ts
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addUsage, agentExecutable, parseClaudeResult, parseOmpEvents, runCommand } from "../../src/replay/agent-cli.ts";

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "replay");

describe("parseClaudeResult", () => {
  test("取 result / session_id / usage / cost", () => {
    const r = parseClaudeResult(fs.readFileSync(path.join(FIX, "claude-result.json"), "utf8"));
    expect(r.text).toBe("ok");
    expect(r.sessionId).toBe("c31b8725-5090-4b82-86cd-89dc41cc7fb5");
    expect(r.usage).toEqual({ inputTokens: 9 + 7189 + 17391, outputTokens: 44, costUsd: 0.0163461 });
  });
  test("is_error 为真或缺 session_id 抛错", () => {
    expect(() => parseClaudeResult(JSON.stringify({ type: "result", is_error: true, result: "boom" }))).toThrow("被测 CLI 报错");
    expect(() => parseClaudeResult("not json")).toThrow("不是 JSON");
  });
});

describe("parseOmpEvents", () => {
  test("session 行给 id，turn_end 给正文与用量", () => {
    const r = parseOmpEvents(fs.readFileSync(path.join(FIX, "omp-events.jsonl"), "utf8"));
    expect(r.sessionId).toBe("01a087f0-f33c-70f7-9308-88a747c110e0");
    expect(r.text).toBe("ok");
    expect(r.usage).toEqual({ inputTokens: 2688, outputTokens: 5, costUsd: 0.0005436 });
  });
  test("多轮 turn_end 累加用量、正文取最后一轮", () => {
    const one = fs.readFileSync(path.join(FIX, "omp-events.jsonl"), "utf8");
    const two = one + one.split("\n").find((l) => l.includes('"turn_end"'))!.replace('"text":"ok"', '"text":"再来"') + "\n";
    const r = parseOmpEvents(two);
    expect(r.text).toBe("再来");
    expect(r.usage.inputTokens).toBe(2688 * 2);
  });
  test("没有 session 行抛错", () => {
    expect(() => parseOmpEvents('{"type":"agent_start"}\n')).toThrow("session");
  });
});

describe("runCommand", () => {
  test("stdin 传入、stdout 收回", async () => {
    const r = await runCommand("node", ["-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write('got:'+s))"], { cwd: os.tmpdir(), env: process.env, stdin: "hi", timeoutMs: 20000 });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("got:hi");
    expect(r.timedOut).toBe(false);
  });
  test("超时杀进程，timedOut 为真", async () => {
    const r = await runCommand("node", ["-e", "setTimeout(()=>{}, 60000)"], { cwd: os.tmpdir(), env: process.env, timeoutMs: 500 });
    expect(r.timedOut).toBe(true);
  });
});

test("addUsage 与 agentExecutable", () => {
  expect(addUsage({ inputTokens: 1, outputTokens: 2, costUsd: 0.5 }, { inputTokens: 3, outputTokens: 4, costUsd: 0.25 })).toEqual({ inputTokens: 4, outputTokens: 6, costUsd: 0.75 });
  expect(agentExecutable("claude")).toBe("claude");
  process.env.SJ_AGENT_CMD = "node fake.mjs";
  try { expect(agentExecutable("omp")).toBe("node fake.mjs"); } finally { delete process.env.SJ_AGENT_CMD; }
});
