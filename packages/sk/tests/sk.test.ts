// sk CLI 的端到端测试：在临时技能库根上跑真实进程，覆盖 PR #11 的全部 review finding。
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");
let root = "";

function sk(...args: string[]): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, SK_ROOT: root },
  });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function addSkill(group: string, name: string): void {
  const dir = path.join(root, "plugins", group, "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\ndescription: 测试技能 ${name}\n---\n# ${name}\n`);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sk-test-"));
  addSkill("g1", "alpha");
  addSkill("g1", "beta");
  addSkill("g2", "gamma");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("库存与版本", () => {
  test("list 列出全部技能", () => {
    const r = sk("list");
    expect(r.status).toBe(0);
    expect(r.out).toContain("alpha");
    expect(r.out).toContain("共 3 个技能");
  });

  test("version 输出版本串", () => {
    const r = sk("version");
    expect(r.status).toBe(0);
    expect(r.out.trim()).toBe("dev");
  });
});

describe("profile 增删（含 @组名 契约）", () => {
  test("add 支持 glob 与 @组名", () => {
    expect(sk("new", "p1").status).toBe(0);
    const r = sk("add", "p1", "alpha", "@g2");
    expect(r.status).toBe(0);
    expect(r.out).toContain("新增 2");
  });

  test("rm 支持 @组名（曾是静默 no-op）", () => {
    const r = sk("rm", "p1", "@g2");
    expect(r.status).toBe(0);
    expect(r.out).toContain("移除 1");
  });

  test("rm 无匹配时报错而非静默成功", () => {
    const r = sk("rm", "p1", "nonexistent-zzz");
    expect(r.status).toBe(1);
    expect(r.out).toContain("未匹配");
  });
});

describe("manifest 防清空与 restore", () => {
  test("链接全缺时 sync 拒绝覆盖非空 manifest", () => {
    expect(sk("new", "p2").status).toBe(0);
    expect(sk("add", "p2", "alpha").status).toBe(0);
    fs.rmSync(path.join(root, "profiles", "p2", "skills"), { recursive: true, force: true });
    const r = sk("sync", "p2");
    expect(r.status).toBe(1);
    expect(r.out).toContain("拒绝");
  });

  test("restore 按 manifest 重建", () => {
    const r = sk("restore", "p2");
    expect(r.status).toBe(0);
    expect(r.out).toContain("共 1 个技能");
    expect(sk("sync", "p2").status).toBe(0);
  });
});

describe("失效链接与路径安全", () => {
  test("同名失效链接不再挡住重新 add", () => {
    expect(sk("new", "p3").status).toBe(0);
    const deadTarget = path.join(root, "dead-target");
    fs.mkdirSync(deadTarget, { recursive: true });
    fs.mkdirSync(path.join(root, "profiles", "p3", "skills"), { recursive: true });
    fs.symlinkSync(deadTarget, path.join(root, "profiles", "p3", "skills", "alpha"), "junction");
    const r = sk("add", "p3", "alpha");
    expect(r.status).toBe(0);
    expect(r.out).toContain("新增 1");
  });

  test("profile 名不能穿越出 profiles/", () => {
    for (const bad of ["../evil", "..\\evil", "a/b"]) {
      const r = sk("new", bad);
      expect(r.status).toBe(1);
      expect(r.out).toContain("非法 profile 名");
    }
  });
});
