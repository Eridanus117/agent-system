// 读题：frontmatter 解析、字段校验、剧本与判据切分、题库定位。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bankDir, listStories, loadStory, loadStoryModules, parseFrontmatter, parseStory, workspaceRootFrom } from "../../src/replay/story.ts";

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "replay");

describe("parseFrontmatter", () => {
  test("标量、数组、数字", () => {
    const { meta, body } = parseFrontmatter("---\na: x\nn: 3\nl: [p, q]\n---\n正文");
    expect(meta).toEqual({ a: "x", n: 3, l: ["p", "q"] });
    expect(body).toBe("正文");
  });
  test("没有 frontmatter 抛错", () => {
    expect(() => parseFrontmatter("正文")).toThrow("缺 frontmatter");
  });
});

describe("parseStory", () => {
  test("合格题切出剧本与判据", () => {
    const md = fs.readFileSync(path.join(FIX, "story-ok", "story.md"), "utf8");
    const s = parseStory(md, path.join(FIX, "story-ok"));
    expect(s.meta.id).toBe("10-fixture");
    expect(s.meta.clients).toEqual(["claude", "omp"]);
    expect(s.meta.max_turns).toBe(2);
    expect(s.script).toContain("给 tool.ts 加一个 --json 开关");
    expect(s.script).not.toContain("验收判据");
    expect(s.criterion).toBe("它停下来问的那句，是不是在澄清范围。");
  });
  test("缺字段与越界值报中文错", () => {
    const md = fs.readFileSync(path.join(FIX, "story-bad.md"), "utf8");
    expect(() => parseStory(md, FIX)).toThrow("max_turns");
  });
  test("没有「## 验收判据」抛错", () => {
    const md = fs.readFileSync(path.join(FIX, "story-ok", "story.md"), "utf8").replace("## 验收判据", "## 别的");
    expect(() => parseStory(md, FIX)).toThrow("验收判据");
  });
  test("剧本没有「」括起来的第一句原话抛错", () => {
    const md = fs.readFileSync(path.join(FIX, "story-ok", "story.md"), "utf8").replace(/[「」]/g, "");
    expect(() => parseStory(md, FIX)).toThrow("剧本里缺第一句原话");
  });
});

describe("题库定位", () => {
  test("listStories 只列含 story.md 的目录；loadStory 按题号前缀找", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-bank-"));
    fs.cpSync(path.join(FIX, "story-ok"), path.join(tmp, "10-fixture"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "20-empty"));
    expect(listStories(tmp).map((d) => path.basename(d))).toEqual(["10-fixture"]);
    expect(loadStory("10", tmp).meta.id).toBe("10-fixture");
    expect(loadStory(path.join(tmp, "10-fixture"), tmp).meta.id).toBe("10-fixture");
    expect(() => loadStory("30", tmp)).toThrow("找不到题");
  });
  test("SJ_BANK_DIR 覆盖；workspaceRootFrom 往上三层", () => {
    // 用 tmpdir 拼绝对路径，Linux CI 上 "C:/..." 不是绝对路径，resolve 会挂到 cwd 下。
    const root = path.join(os.tmpdir(), "sj-ws");
    const bank = path.join(root, "agent-config", "80-agent配置", "60-回放题库");
    process.env.SJ_BANK_DIR = bank;
    try {
      expect(bankDir()).toBe(bank);
      expect(workspaceRootFrom(bankDir())).toBe(root);
    } finally { delete process.env.SJ_BANK_DIR; }
  });
  test("loadStoryModules 动态加载 setup 与 checks", async () => {
    const md = fs.readFileSync(path.join(FIX, "story-ok", "story.md"), "utf8");
    const s = parseStory(md, path.join(FIX, "story-ok"));
    const m = await loadStoryModules(s);
    expect(typeof m.setup).toBe("function");
    expect(typeof m.checks).toBe("function");
  });
});
