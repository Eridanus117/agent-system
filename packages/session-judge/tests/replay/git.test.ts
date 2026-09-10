import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git, gitHead, showRef } from "../../src/replay/git.ts";

describe("git 助手", () => {
  test("gitHead 与 showRef", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-git-"));
    git(["init", "-q", "-b", "main"], tmp);
    git(["-c", "user.email=t@x", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "初始"], tmp);
    expect(gitHead(tmp)).toMatch(/^[0-9a-f]{40}$/);
    const bare = path.join(tmp, "remote.git");
    git(["init", "-q", "--bare", bare], tmp);
    expect(showRef(bare)).toBe("");
    git(["push", "-q", bare, "main"], tmp);
    expect(showRef(bare)).toContain("refs/heads/main");
  });
  test("失败抛 Error 带 stderr", () => {
    expect(() => git(["rev-parse", "HEAD"], os.tmpdir())).toThrow();
  });
});
