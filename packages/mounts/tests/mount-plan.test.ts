// MountPlan seam 的消费者可观察行为：每个阻断条件一条失败测试，外加 ready 路径与整体阻断不变量。
import { describe, expect, test } from "bun:test";
import { evaluateMountPlan, parseManifest, parseRoots, type MountErrorCode, type MountPlan } from "../src/index.ts";
import { syntheticProbe, type SyntheticNode } from "./synthetic-probe.ts";

const CHECKOUT = "/work/repo";
const ROOT = "/roots/private";

function mount(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "nav",
    root: "private",
    source: "nav",
    target: ".omp/local/nav",
    type: "dir",
    required: true,
    readonly: true,
    ...overrides,
  };
}

function manifest(mounts: Record<string, unknown>[] = [mount()], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 1, profile: "private-local", mounts, ...overrides };
}

function roots(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 1, roots: { private: { path: ROOT, trust: "private-local" } }, ...overrides };
}

const BASE_FS: Record<string, SyntheticNode> = {
  "/work": "dir",
  [CHECKOUT]: "dir",
  "/roots": "dir",
  [ROOT]: "dir",
  [`${ROOT}/nav`]: "dir",
  [`${ROOT}/notes.md`]: "file",
};

function plan(input: { manifest?: unknown; roots?: unknown; checkout?: string; fs?: Record<string, SyntheticNode> }): MountPlan {
  return evaluateMountPlan({
    manifest: input.manifest ?? manifest(),
    roots: input.roots ?? roots(),
    checkout: input.checkout ?? CHECKOUT,
    probe: syntheticProbe({ ...BASE_FS, ...(input.fs ?? {}) }),
  });
}

function codes(result: MountPlan): MountErrorCode[] {
  return result.errors.map((error) => error.code);
}

function expectBlocked(result: MountPlan, code: MountErrorCode): void {
  expect(result.status).toBe("blocked");
  expect(codes(result)).toContain(code);
  expect(result.writes).toEqual([]);
}

describe("manifest 解析", () => {
  test("合规 manifest 通过并保留字段", () => {
    const parsed = parseManifest(manifest());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.mounts[0]?.target).toBe(".omp/local/nav");
  });

  test("未知顶层字段被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount()], { extra: 1 }) }), "manifest-unknown-field");
  });

  test("不支持的版本被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount()], { version: 2 }) }), "manifest-unsupported-version");
  });

  test("未授权 profile 被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount()], { profile: "shared-runtime" }) }), "unauthorized-profile");
  });

  test("mount 的未知字段被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount({ mode: "0644" })]) }), "mount-unknown-field");
  });

  test("重复 id 被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount(), mount({ target: ".omp/local/other" })]) }), "duplicate-id");
  });

  test.each([["/abs"], ["../up"], ["a/../b"], ["./a"], ["a//b"], ["a\\b"], ["C:/x"], [""], ["a/"]])(
    "不安全的 source %p 被拒绝",
    (source) => {
      expectBlocked(plan({ manifest: manifest([mount({ source })]) }), "unsafe-source-path");
    },
  );

  test.each([["/abs"], ["../.omp/local/x"], [".omp/local/../x"], [".omp/local/./x"]])("不安全的 target %p 被拒绝", (target) => {
    expectBlocked(plan({ manifest: manifest([mount({ target })]) }), "unsafe-target-path");
  });

  test("target 不在 .omp/local 之下被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount({ target: "docs/nav" })]) }), "target-outside-overlay");
    expectBlocked(plan({ manifest: manifest([mount({ target: ".omp/localx" })]) }), "target-outside-overlay");
  });

  test("target 可以就是 .omp/local 本身", () => {
    expect(plan({ manifest: manifest([mount({ target: ".omp/local" })]) }).status).toBe("ready");
  });

  test("类型与布尔字段缺失被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount({ type: "link" })]) }), "mount-invalid");
    expectBlocked(plan({ manifest: manifest([mount({ required: "yes" })]) }), "mount-invalid");
    expectBlocked(plan({ manifest: manifest([mount({ readonly: undefined })]) }), "mount-invalid");
  });
});

describe("roots 解析", () => {
  test("未知字段与版本被拒绝", () => {
    expectBlocked(plan({ roots: roots({ hosts: [] }) }), "roots-unknown-field");
    expectBlocked(plan({ roots: roots({ version: 0 }) }), "roots-unsupported-version");
  });

  test("相对路径的 root 被拒绝", () => {
    expectBlocked(plan({ roots: { version: 1, roots: { private: { path: "roots/private", trust: "private-local" } } } }), "root-path-not-absolute");
  });

  test("未知信任域被拒绝", () => {
    expectBlocked(plan({ roots: { version: 1, roots: { private: { path: ROOT, trust: "anything" } } } }), "unknown-trust-domain");
  });

  test("Windows 盘符路径按绝对路径接受", () => {
    const parsed = parseRoots({ version: 1, roots: { private: { path: "C:\\roots\\private", trust: "private-local" } } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.roots.private?.path).toBe("C:/roots/private");
  });
});

describe("计划评估", () => {
  test("缺失 target 进入 writes，source 是真实绝对路径", () => {
    const result = plan({});
    expect(result.status).toBe("ready");
    expect(result.writes).toEqual([{ mount: "nav", target: ".omp/local/nav", source: `${ROOT}/nav`, type: "dir", readonly: true }]);
    expect(result.keeps).toEqual([]);
  });

  test("正确的符号链接进入 keeps，不重复写", () => {
    const result = plan({ fs: { [`${CHECKOUT}/.omp`]: "dir", [`${CHECKOUT}/.omp/local`]: "dir", [`${CHECKOUT}/.omp/local/nav`]: { link: `${ROOT}/nav` } } });
    expect(result.status).toBe("ready");
    expect(result.writes).toEqual([]);
    expect(result.keeps).toEqual([{ mount: "nav", target: ".omp/local/nav", source: `${ROOT}/nav`, type: "dir" }]);
  });

  test("非必需且 source 缺失的条目进入 skips", () => {
    const result = plan({ manifest: manifest([mount({ source: "absent", required: false })]) });
    expect(result.status).toBe("ready");
    expect(result.skips).toEqual([{ mount: "nav", reason: "optional-source-missing" }]);
  });

  test("checkout 不存在整体阻断", () => {
    expectBlocked(plan({ checkout: "/work/nowhere" }), "checkout-missing");
    expectBlocked(plan({ checkout: "relative/path" }), "checkout-missing");
  });

  test("未声明的 root 被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount({ root: "shared" })]) }), "unknown-root");
  });

  test("已知但未授权的信任域被拒绝", () => {
    expectBlocked(plan({ roots: { version: 1, roots: { private: { path: ROOT, trust: "shared-runtime" } } } }), "unauthorized-root");
  });

  test("root 目录缺失整体阻断", () => {
    expectBlocked(plan({ roots: { version: 1, roots: { private: { path: "/roots/gone", trust: "private-local" } } } }), "root-missing");
  });

  test("必需 source 缺失被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount({ source: "absent" })]) }), "source-missing");
  });

  test("source 经符号链接逃出 root 被拒绝", () => {
    expectBlocked(plan({ fs: { "/etc": "dir", [`${ROOT}/nav`]: { link: "/etc" } } }), "source-escapes-root");
  });

  test("source 类型不符被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount({ source: "notes.md" })]) }), "source-type-mismatch");
  });

  test("target 的祖先是普通文件被拒绝", () => {
    expectBlocked(plan({ fs: { [`${CHECKOUT}/.omp`]: "file" } }), "target-parent-not-directory");
  });

  test("target 的祖先是符号链接被拒绝（即使指向 checkout 内）", () => {
    expectBlocked(plan({ fs: { [`${CHECKOUT}/elsewhere`]: "dir", [`${CHECKOUT}/.omp`]: { link: `${CHECKOUT}/elsewhere` } } }), "target-parent-not-directory");
  });

  test("target 被普通文件或目录占用不覆盖", () => {
    expectBlocked(plan({ fs: { [`${CHECKOUT}/.omp`]: "dir", [`${CHECKOUT}/.omp/local`]: "dir", [`${CHECKOUT}/.omp/local/nav`]: "dir" } }), "target-occupied");
    expectBlocked(plan({ fs: { [`${CHECKOUT}/.omp`]: "dir", [`${CHECKOUT}/.omp/local`]: "dir", [`${CHECKOUT}/.omp/local/nav`]: "file" } }), "target-occupied");
  });

  test("指向别处或已断的符号链接不自动替换", () => {
    expectBlocked(plan({ fs: { [`${CHECKOUT}/.omp`]: "dir", [`${CHECKOUT}/.omp/local`]: "dir", [`${CHECKOUT}/.omp/local/nav`]: { link: `${ROOT}/notes.md` } } }), "target-wrong-symlink");
    expectBlocked(plan({ fs: { [`${CHECKOUT}/.omp`]: "dir", [`${CHECKOUT}/.omp/local`]: "dir", [`${CHECKOUT}/.omp/local/nav`]: { link: "/roots/gone" } } }), "target-wrong-symlink");
  });

  test("未知对象占用 target 被拒绝", () => {
    expectBlocked(plan({ fs: { [`${CHECKOUT}/.omp`]: "dir", [`${CHECKOUT}/.omp/local`]: "dir", [`${CHECKOUT}/.omp/local/nav`]: "other" } }), "target-unknown-object");
  });

  test("重复 target 与祖先重叠被拒绝", () => {
    expectBlocked(plan({ manifest: manifest([mount(), mount({ id: "nav2" })]) }), "duplicate-target");
    expectBlocked(plan({ manifest: manifest([mount(), mount({ id: "all", target: ".omp/local" })]) }), "target-overlap");
  });

  test("一个条目阻断时其它可写条目也不出现在 writes 里", () => {
    const result = plan({ manifest: manifest([mount(), mount({ id: "bad", source: "absent", target: ".omp/local/bad" })]) });
    expect(result.status).toBe("blocked");
    expect(result.writes).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("阻断时仍报告已正确存在的入口，便于审计", () => {
    const result = plan({
      manifest: manifest([mount(), mount({ id: "bad", source: "absent", target: ".omp/local/bad" })]),
      fs: { [`${CHECKOUT}/.omp`]: "dir", [`${CHECKOUT}/.omp/local`]: "dir", [`${CHECKOUT}/.omp/local/nav`]: { link: `${ROOT}/nav` } },
    });
    expect(result.status).toBe("blocked");
    expect(result.keeps.map((keep) => keep.mount)).toEqual(["nav"]);
  });
});
