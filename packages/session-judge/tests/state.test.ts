// 状态文件：id 可能来自外部数据（OMP session id、文件名），落盘前要清成合法文件名。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeState } from "../src/state.ts";
import type { Timeline } from "../src/types.ts";

let tmp = "";
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-state-")); process.env.SJ_STATE_DIR = tmp; });
afterEach(() => { delete process.env.SJ_STATE_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

describe("writeState：id 里的文件名不安全字符要被替换", () => {
  test("id 含 / 与 : 时落盘文件名替换成 _，不逃出 day 目录", () => {
    const t: Timeline = { id: "proj/2026:09:08", client: "claude", events: [] };
    const file = writeState(t, "报告正文");
    // 文件名里不再出现原始的 / 或 :（day 目录本身的路径分隔符不算）。
    expect(path.basename(file)).not.toContain("/");
    expect(path.basename(file)).not.toContain(":");
    expect(path.basename(file)).toBe("proj_2026_09_08.md");
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("报告正文");
  });
});
