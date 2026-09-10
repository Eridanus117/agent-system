// 造场景动词：在临时目录里造一个源仓，检出、接裸仓、写文件；origin 校验。
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git, gitHead, showRef } from "../../src/replay/git.ts";
import { assertOriginIsBare, bareDirOf, setupVerbsFor } from "../../src/replay/setup-verbs.ts";

function makeSource(root: string): string {
  const src = path.join(root, "fixture-repo");
  fs.mkdirSync(src);
  git(["init", "-q", "-b", "main"], src);
  fs.writeFileSync(path.join(src, "a.txt"), "1\n");
  fs.mkdirSync(path.join(src, "node_modules", "x"), { recursive: true });
  git(["add", "a.txt"], src);
  git(["-c", "user.email=t@x", "-c", "user.name=t", "commit", "-q", "-m", "初始"], src);
  return src;
}

describe("setupVerbsFor", () => {
  test("checkoutRepo + bareRemote + linkNodeModules + writeFile", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-setup-"));
    const src = makeSource(root);
    const runDir = path.join(root, "run");
    const workDir = path.join(runDir, "work");
    fs.mkdirSync(runDir, { recursive: true });
    const v = setupVerbsFor({ runDir, workDir, workspaceRoot: root, meta: { id: "t", title: "t", tier: "small", clients: ["claude"], max_turns: 1, turn_timeout_min: 1, repo: "fixture-repo", commit: gitHead(src), status: "ready" } });
    v.checkoutRepo();
    expect(fs.existsSync(path.join(workDir, "a.txt"))).toBe(true);
    expect(git(["branch", "--show-current"], workDir).trim()).toBe("main");
    v.bareRemote();
    expect(git(["remote", "get-url", "origin"], workDir).trim().replaceAll("\\", "/")).toBe(bareDirOf(runDir).replaceAll("\\", "/"));
    expect(showRef(bareDirOf(runDir))).toContain("refs/heads/main");
    expect(() => assertOriginIsBare(workDir, bareDirOf(runDir))).not.toThrow();
    v.linkNodeModules();
    expect(fs.existsSync(path.join(workDir, "node_modules", "x"))).toBe(true);
    v.writeFile("NOTE.md", "hi\n");
    expect(fs.readFileSync(path.join(workDir, "NOTE.md"), "utf8")).toBe("hi\n");
  });
  test("origin 指向别处时 assertOriginIsBare 抛错", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-setup-"));
    const src = makeSource(root);
    const runDir = path.join(root, "run");
    const workDir = path.join(runDir, "work");
    fs.mkdirSync(runDir, { recursive: true });
    const v = setupVerbsFor({ runDir, workDir, workspaceRoot: root, meta: { id: "t", title: "t", tier: "small", clients: ["claude"], max_turns: 1, turn_timeout_min: 1, repo: "fixture-repo", commit: "HEAD", status: "ready" } });
    v.checkoutRepo();
    // 没调 bareRemote：origin 还指着源仓
    expect(() => assertOriginIsBare(workDir, bareDirOf(runDir))).toThrow("origin");
  });
  test("源仓不存在报中文错", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sj-setup-"));
    const v = setupVerbsFor({ runDir: root, workDir: path.join(root, "work"), workspaceRoot: root, meta: { id: "t", title: "t", tier: "small", clients: ["claude"], max_turns: 1, turn_timeout_min: 1, repo: "nope", commit: "HEAD", status: "ready" } });
    expect(() => v.checkoutRepo()).toThrow("找不到源仓");
  });
});
