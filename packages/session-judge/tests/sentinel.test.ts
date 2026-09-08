// 哨兵题：机械检查必须给「符合」（这正是它们的伪装），sj sentinel 用假评委验证报警逻辑。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runChecks } from "../src/checks.ts";
import { loadTimeline } from "../src/timeline.ts";
import { runCli, sentinelFiles } from "../src/cli.ts";

describe("哨兵题", () => {
  test("两道题机械检查 M1–M4 全「符合」", () => {
    for (const f of sentinelFiles()) {
      const r = runChecks(loadTimeline(f));
      expect(r.slice(0, 4).map((x) => x.verdict)).toEqual(["符合", "符合", "符合", "符合"]);
    }
  });
  test("假评委全给「符合」→ 报警退出 1；给出「不符合」→ 退出 0", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-sent-"));
    process.env.SJ_STATE_DIR = path.join(tmp, "state");
    const make = (verdict: string) => {
      const f = path.join(tmp, `judge-${verdict}.mjs`);
      fs.writeFileSync(f, [
        "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{",
        "console.log('| 判据 | 判决 | 证据 |');console.log('|---|---|---|');",
        `for (const j of ['J1','J2','J3','J4']) console.log(\`| \${j} | ${verdict} | 事件 2 |\`);`,
        "console.log('');console.log('总评：x');});",
      ].join("\n"));
      return f;
    };
    process.env.SJ_JUDGE_CMD = `node ${make("符合")}`;
    const out: string[] = [];
    expect(await runCli(["sentinel"], { stdout: (s) => out.push(s), stderr: (s) => out.push(s) })).toBe(1);
    expect(out.join("")).toContain("报警");
    process.env.SJ_JUDGE_CMD = `node ${make("不符合")}`;
    expect(await runCli(["sentinel"], { stdout: () => {}, stderr: () => {} })).toBe(0);
    delete process.env.SJ_JUDGE_CMD; delete process.env.SJ_STATE_DIR;
  });
});
