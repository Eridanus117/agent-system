// sk CLI 的端到端测试：在独立临时技能库上验证声明、投影与写前失败边界。
import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");
const ALPHA = { name: "alpha", target: "plugins/g1/skills/alpha" };
const BETA = { name: "beta", target: "plugins/g1/skills/beta" };
const GAMMA = { name: "gamma", target: "plugins/g2/skills/gamma" };
let sandbox = "";
let root = "";

function sk(...args: string[]): { status: number | null; out: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, SK_ROOT: root };
  // Windows 环境变量不区分大小写；移除继承的 Path，避免 run 意外启动真实客户端。
  for (const key of Object.keys(env)) {
    if (["PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"].includes(key.toUpperCase())) {
      delete env[key];
    }
  }
  const home = path.join(sandbox, "home");
  Object.assign(env, {
    PATH: path.join(sandbox, "empty-path"),
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
  });
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function addSkill(group: string, name: string): void {
  const dir = path.join(root, "plugins", group, "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: 测试技能 ${name}\n---\n# ${name}\n`);
}

function profilePath(...parts: string[]): string {
  return path.join(root, "profiles", "p", ...parts);
}

function createProfile(...patterns: string[]): void {
  expect(sk("new", "p").status).toBe(0);
  if (patterns.length > 0) expect(sk("add", "p", ...patterns).status).toBe(0);
}

function manifestSkills(): { name: string; target: string }[] {
  return JSON.parse(fs.readFileSync(profilePath("manifest.json"), "utf8")).skills
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
}

function reformatManifest() {
  const value = JSON.parse(fs.readFileSync(profilePath("manifest.json"), "utf8"));
  const bytes = Buffer.from(` \r\n${JSON.stringify(value)}\t\r\n`);
  fs.writeFileSync(profilePath("manifest.json"), bytes);
  return bytes;
}

function removeProjection(name: string): void {
  const link = profilePath("skills", name);
  // 只摘 junction/symlink，不递归操作它指向的技能目录。
  try { fs.rmdirSync(link); } catch { fs.unlinkSync(link); }
}

function expectProjection(skill: { name: string; target: string }): void {
  const link = profilePath("skills", skill.name);
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  expect(fs.realpathSync(link)).toBe(fs.realpathSync(path.join(root, skill.target)));
}

function snapshotProfile(): Record<string, { mtime: number; link?: string; contents?: Buffer }> {
  const state: Record<string, { mtime: number; link?: string; contents?: Buffer }> = {};
  function visit(relative: string): void {
    const file = profilePath(relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      state[relative] = { mtime: stat.mtimeMs, link: fs.readlinkSync(file) };
    } else if (stat.isDirectory()) {
      state[relative] = { mtime: stat.mtimeMs };
      for (const child of fs.readdirSync(file).sort()) visit(path.join(relative, child));
    } else {
      state[relative] = { mtime: stat.mtimeMs, contents: fs.readFileSync(file) };
    }
  }
  visit("");
  return state;
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sk-test-"));
  root = path.join(sandbox, "library");
  fs.mkdirSync(path.join(sandbox, "empty-path"));
  fs.mkdirSync(path.join(sandbox, "home"));
  addSkill("g1", "alpha");
  addSkill("g1", "beta");
  addSkill("g2", "gamma");
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("库存", () => {
  test("list 列出全部技能", () => {
    const r = sk("list");
    expect(r.status).toBe(0);
    expect(r.out).toContain("alpha");
    expect(r.out).toContain("beta");
    expect(r.out).toContain("gamma");
  });
});

describe("profile 声明增删（含 glob 与 @组名）", () => {
  test("new 创建空声明与可装配目录", () => {
    createProfile();
    expect(manifestSkills()).toEqual([]);
    expect(fs.readdirSync(profilePath("skills"))).toEqual([]);
  });

  test("add 把 glob 与组匹配结果写入声明并建立真实投影", () => {
    createProfile();
    expect(sk("add", "p", "a*", "@g2").status).toBe(0);
    expect(manifestSkills()).toEqual([ALPHA, GAMMA]);
    expectProjection(ALPHA);
    expectProjection(GAMMA);
  });

  test("rm 按声明移除缺链与失效目标，保留未匹配技能", () => {
    createProfile("alpha", "beta", "gamma");
    removeProjection("alpha");
    fs.rmSync(path.join(root, GAMMA.target), { recursive: true });
    expect(fs.lstatSync(profilePath("skills", "gamma")).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(profilePath("skills", "gamma"))).toBe(false);

    expect(sk("rm", "p", "a*", "@g2").status).toBe(0);
    expect(manifestSkills()).toEqual([BETA]);
    expect(fs.readdirSync(profilePath("skills"))).toEqual(["beta"]);
    expectProjection(BETA);
    expect(fs.existsSync(path.join(root, ALPHA.target, "SKILL.md"))).toBe(true);
  });

  test("rm 无匹配时失败且不改声明或投影", () => {
    createProfile("alpha");
    const before = snapshotProfile();
    const r = sk("rm", "p", "nonexistent-zzz");
    expect(r.status).toBe(1);
    expect(snapshotProfile()).toEqual(before);
  });

  test("add 拒绝同名异源，不部分加入其他匹配项", () => {
    createProfile("alpha");
    addSkill("g2", "alpha");
    const before = snapshotProfile();
    const r = sk("add", "p", "beta", "@g2");
    expect(r.status).toBe(1);
    expect(r.out).toContain("alpha");
    expect(snapshotProfile()).toEqual(before);
    expect(manifestSkills()).toEqual([ALPHA]);
    expectProjection(ALPHA);
  });

  test("add 可声明技能并替换同名的真实断链", () => {
    createProfile();
    const deadTarget = path.join(root, "dead-target");
    fs.mkdirSync(deadTarget);
    fs.symlinkSync(deadTarget, profilePath("skills", "alpha"), "junction");
    fs.rmSync(deadTarget, { recursive: true });
    expect(fs.lstatSync(profilePath("skills", "alpha")).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(profilePath("skills", "alpha"))).toBe(false);

    expect(sk("add", "p", "alpha").status).toBe(0);
    expect(manifestSkills()).toEqual([ALPHA]);
    expectProjection(ALPHA);
  });
});

describe("manifest 是装配的唯一声明", () => {
  test("sync 修复全缺投影，manifest 逐字节不变", () => {
    createProfile("alpha", "@g2");
    const manifest = reformatManifest();
    fs.rmSync(profilePath("skills"), { recursive: true });
    fs.rmSync(profilePath("overlay.yml"));
    fs.rmSync(profilePath(".claude-plugin"), { recursive: true });

    expect(sk("sync", "p").status).toBe(0);
    expect(fs.readFileSync(profilePath("manifest.json"))).toEqual(manifest);
    expect(manifestSkills()).toEqual([ALPHA, GAMMA]);
    expectProjection(ALPHA);
    expectProjection(GAMMA);
  });

  test("sync 修复部分缺失与错链，不按剩余目录缩减声明", () => {
    createProfile("alpha", "beta", "gamma");
    const manifest = reformatManifest();
    removeProjection("beta");
    removeProjection("gamma");
    fs.symlinkSync(path.join(root, ALPHA.target), profilePath("skills", "gamma"), "junction");
    expect(fs.realpathSync(profilePath("skills", "gamma"))).toBe(fs.realpathSync(path.join(root, ALPHA.target)));

    expect(sk("sync", "p").status).toBe(0);
    expect(fs.readFileSync(profilePath("manifest.json"))).toEqual(manifest);
    expect(manifestSkills()).toEqual([ALPHA, BETA, GAMMA]);
    expectProjection(ALPHA);
    expectProjection(BETA);
    expectProjection(GAMMA);
  });

  test("restore 修复缺失与真实断链而不改声明", () => {
    createProfile("alpha", "gamma");
    const manifest = reformatManifest();
    removeProjection("alpha");
    removeProjection("gamma");
    const deadTarget = path.join(root, "dead-target");
    fs.mkdirSync(deadTarget);
    fs.symlinkSync(deadTarget, profilePath("skills", "gamma"), "junction");
    fs.rmSync(deadTarget, { recursive: true });
    expect(fs.lstatSync(profilePath("skills", "gamma")).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(profilePath("skills", "gamma"))).toBe(false);

    expect(sk("restore", "p").status).toBe(0);
    expect(fs.readFileSync(profilePath("manifest.json"))).toEqual(manifest);
    expectProjection(ALPHA);
    expectProjection(GAMMA);
  });

  test("run 在无客户端环境修复部分缺链，不改声明", () => {
    createProfile("alpha", "gamma");
    const manifest = reformatManifest();
    removeProjection("alpha");
    fs.rmSync(profilePath("overlay.yml"));
    fs.rmSync(profilePath(".claude-plugin"), { recursive: true });

    // PATH 是空临时目录；只验证装配结果，不启动真实 OMP。
    const r = sk("run", "p", "omp");
    expect(r.status).toBe(1);
    expect(fs.readFileSync(profilePath("manifest.json"))).toEqual(manifest);
    expectProjection(ALPHA);
    expectProjection(GAMMA);
  });

  test("sync 报告并保留未声明的有效投影和断链，不吸收入声明", () => {
    createProfile("alpha");
    const manifest = reformatManifest();
    fs.symlinkSync(path.join(root, GAMMA.target), profilePath("skills", "gamma"), "junction");
    const deadTarget = path.join(root, "dead-target");
    fs.mkdirSync(deadTarget);
    fs.symlinkSync(deadTarget, profilePath("skills", "orphan"), "junction");
    fs.rmSync(deadTarget, { recursive: true });
    const orphanTarget = fs.readlinkSync(profilePath("skills", "orphan"));

    const r = sk("sync", "p");
    expect(r.status).toBe(0);
    expect(r.out).toContain("gamma");
    expect(r.out).toContain("orphan");
    expect(fs.readFileSync(profilePath("manifest.json"))).toEqual(manifest);
    expect(manifestSkills()).toEqual([ALPHA]);
    expectProjection(ALPHA);
    expectProjection(GAMMA);
    expect(fs.lstatSync(profilePath("skills", "orphan")).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(profilePath("skills", "orphan"))).toBe(orphanTarget);
  });

  test("run 在任何修复或生成前拒绝未声明额外项", () => {
    createProfile("alpha", "beta");
    removeProjection("beta");
    fs.symlinkSync(path.join(root, GAMMA.target), profilePath("skills", "gamma"), "junction");
    const before = snapshotProfile();

    const r = sk("run", "p", "claude");
    expect(r.status).toBe(1);
    expect(r.out).toContain("gamma");
    expect(snapshotProfile()).toEqual(before);
  });
});

describe("show 查看 profile 配置", () => {
  test("show 列出组、技能名与描述", () => {
    createProfile("alpha", "@g2");
    const r = sk("show", "p");
    expect(r.status).toBe(0);
    expect(r.out).toContain("g1");
    expect(r.out).toContain("alpha");
    expect(r.out).toContain("测试技能 alpha");
    expect(r.out).toContain("gamma");
  });

  test("show 对不存在的 profile 报错", () => {
    const r = sk("show", "no-such-profile");
    expect(r.status).toBe(1);
    expect(r.out).toContain("no-such-profile");
    expect(fs.existsSync(path.join(root, "profiles"))).toBe(false);
  });

  test("show 仍展示缺链声明，show 与 profiles 不改声明或投影", () => {
    createProfile("alpha", "beta", "gamma");
    removeProjection("beta");
    removeProjection("gamma");
    fs.symlinkSync(path.join(root, GAMMA.target), profilePath("skills", "extra"), "junction");
    const before = snapshotProfile();

    const shown = sk("show", "p");
    expect(shown.status).toBe(0);
    expect(shown.out).toContain("alpha");
    expect(shown.out).toContain("beta");
    expect(shown.out).toContain("gamma");
    expect(shown.out).toContain("extra");
    expect(snapshotProfile()).toEqual(before);

    const profiles = sk("profiles");
    expect(profiles.status).toBe(0);
    expect(snapshotProfile()).toEqual(before);
  });

  test("全缺投影时 show 仍展示声明，不重建目录", () => {
    createProfile("beta");
    fs.rmSync(profilePath("skills"), { recursive: true });
    const before = snapshotProfile();

    const r = sk("show", "p");
    expect(r.status).toBe(0);
    expect(r.out).toContain("beta");
    expect(fs.existsSync(profilePath("skills"))).toBe(false);
    expect(snapshotProfile()).toEqual(before);
  });
});

describe("声明与目标在任何写入前完整校验", () => {
  test("sync 拒绝 skills 非数组的坏声明，不覆盖已有配置", () => {
    createProfile("alpha");
    fs.writeFileSync(profilePath("manifest.json"), JSON.stringify({ skills: ALPHA }));
    const before = snapshotProfile();

    const r = sk("sync", "p");
    expect(r.status).toBe(1);
    expect(r.out).toContain("manifest");
    expect(snapshotProfile()).toEqual(before);
  });

  test("sync 拒绝把健康技能声明为别名，不提前修复或改写 profile", () => {
    createProfile("alpha", "beta");
    removeProjection("alpha");
    fs.writeFileSync(profilePath("manifest.json"), JSON.stringify({
      skills: [ALPHA, BETA, { name: "alias", target: BETA.target }],
    }));
    const before = snapshotProfile();

    const r = sk("sync", "p");
    expect(r.status).toBe(1);
    expect(r.out).toContain("alias");
    expect(r.out).toContain("beta");
    expect(snapshotProfile()).toEqual(before);
    expectProjection(BETA);
    expect(fs.existsSync(profilePath("skills", "alias"))).toBe(false);
  });

  test("restore 拒绝重复声明，不先修复前面的有效技能", () => {
    createProfile("alpha", "beta");
    removeProjection("alpha");
    fs.writeFileSync(profilePath("manifest.json"), JSON.stringify({ skills: [ALPHA, BETA, ALPHA] }));
    const before = snapshotProfile();

    const r = sk("restore", "p");
    expect(r.status).toBe(1);
    expect(r.out).toContain("alpha");
    expect(snapshotProfile()).toEqual(before);
  });

  test("run 拒绝逃逸投影目录的声明名，不写 profile 外文件", () => {
    createProfile("alpha");
    fs.writeFileSync(profilePath("manifest.json"), JSON.stringify({
      skills: [ALPHA, { name: "../../escaped", target: BETA.target }],
    }));
    const before = snapshotProfile();

    const r = sk("run", "p", "omp");
    expect(r.status).toBe(1);
    expect(snapshotProfile()).toEqual(before);
    expect(fs.existsSync(path.join(root, "profiles", "escaped"))).toBe(false);
  });

  test("restore 拒绝库根外的真实目标，不先创建其他缺失投影", () => {
    createProfile("alpha");
    removeProjection("alpha");
    const outside = path.join(sandbox, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "SKILL.md"), "---\nname: outside\ndescription: 库外技能\n---\n");
    fs.writeFileSync(profilePath("manifest.json"), JSON.stringify({
      skills: [ALPHA, { name: "outside", target: "../outside" }],
    }));
    const before = snapshotProfile();

    const r = sk("restore", "p");
    expect(r.status).toBe(1);
    expect(snapshotProfile()).toEqual(before);
    expect(fs.readFileSync(path.join(outside, "SKILL.md"), "utf8"))
      .toBe("---\nname: outside\ndescription: 库外技能\n---\n");
  });

  test("sync 拒绝失效目标，不先修复另一条有效声明", () => {
    createProfile("alpha", "gamma");
    removeProjection("alpha");
    fs.rmSync(path.join(root, GAMMA.target), { recursive: true });
    const before = snapshotProfile();

    const r = sk("sync", "p");
    expect(r.status).toBe(1);
    expect(r.out).toContain("gamma");
    expect(snapshotProfile()).toEqual(before);
  });

  test("restore 拒绝占用声明名的实体目录，保留内容与所有既有文件", () => {
    createProfile("alpha", "beta", "gamma");
    removeProjection("alpha");
    removeProjection("gamma");
    fs.mkdirSync(profilePath("skills", "gamma"));
    fs.writeFileSync(profilePath("skills", "gamma", "notes.txt"), "必须保留的本地内容\n");
    const before = snapshotProfile();

    const r = sk("restore", "p");
    expect(r.status).toBe(1);
    expect(r.out).toContain("gamma");
    expect(snapshotProfile()).toEqual(before);
    expect(fs.lstatSync(profilePath("skills", "gamma")).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(profilePath("skills", "gamma", "notes.txt"), "utf8"))
      .toBe("必须保留的本地内容\n");
    expectProjection(BETA);
  });

  test("profile 名不能穿越出 profiles/", () => {
    const r = sk("new", "../evil");
    expect(r.status).toBe(1);
    expect(fs.existsSync(path.join(root, "profiles"))).toBe(false);
    expect(fs.existsSync(path.join(root, "evil"))).toBe(false);
  });
});
