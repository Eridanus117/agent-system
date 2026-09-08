// MountPlan 纯逻辑评估器：给定 manifest、machine-local roots、checkout 与路径探针，
// 判断整套 private-local 挂载能否整体安全执行。不写文件系统；所有状态通过 PathProbe 读取。
import type {
  MountEntry,
  MountError,
  MountPlan,
  PathProbe,
  PlannedKeep,
  PlannedSkip,
  PlannedWrite,
} from "./contract.ts";
import { parseManifest, parseRoots } from "./manifest.ts";
import { isAbsolutePath, isAncestorOf, isWithin, joinAbsolute, parentOf, samePath, toSlash } from "./paths.ts";

export interface MountPlanInput {
  /** 原始 manifest（通常是 JSON.parse 的结果）；解析失败即 blocked。 */
  manifest: unknown;
  /** 原始 machine-local roots；解析失败即 blocked。 */
  roots: unknown;
  /** 目标 checkout 的绝对路径。 */
  checkout: string;
  probe: PathProbe;
}

interface Resolved {
  entry: MountEntry;
  sourceReal: string;
}

function blocked(errors: MountError[], keeps: PlannedKeep[] = [], skips: PlannedSkip[] = []): MountPlan {
  return { status: "blocked", errors, writes: [], keeps, skips };
}

/** 逐段检查 target 的祖先：已存在的必须是目录且不逃出 checkout，缺失的后面由执行层创建。 */
function checkTargetParents(
  entry: MountEntry,
  checkout: string,
  checkoutReal: string,
  probe: PathProbe,
  errors: MountError[],
): void {
  const segments = entry.target.split("/");
  let current = checkout;
  for (const segment of segments.slice(0, -1)) {
    current = joinAbsolute(current, segment);
    const kind = probe.kind(current);
    if (kind === "missing") return;
    if (kind !== "dir") {
      errors.push({
        code: "target-parent-not-directory",
        message: `target 的祖先 ${segment} 不是普通目录（${kind}）`,
        mount: entry.id,
        path: current,
      });
      return;
    }
    const real = probe.realpath(current);
    if (real === null || !isWithin(checkoutReal, real)) {
      errors.push({ code: "target-escapes-checkout", message: "target 的祖先解析到 checkout 之外", mount: entry.id, path: current });
      return;
    }
  }
}

/** 解析单个条目的 source：root 存在且可信，source 存在、不逃出 root、类型相符。 */
function resolveSource(
  entry: MountEntry,
  roots: Record<string, { path: string; trust: string }>,
  probe: PathProbe,
  errors: MountError[],
  skips: PlannedSkip[],
): Resolved | null {
  const root = roots[entry.root];
  if (root === undefined) {
    errors.push({ code: "unknown-root", message: `root ${entry.root} 未在 machine-local roots 中声明`, mount: entry.id, path: entry.root });
    return null;
  }
  if (root.trust !== "private-local") {
    errors.push({ code: "unauthorized-root", message: `root ${entry.root} 的信任域未被 V1 授权`, mount: entry.id, path: entry.root });
    return null;
  }
  const rootReal = probe.kind(root.path) === "dir" ? probe.realpath(root.path) : null;
  if (rootReal === null) {
    errors.push({ code: "root-missing", message: `root ${entry.root} 的目录不存在`, mount: entry.id, path: root.path });
    return null;
  }
  const sourceAbs = joinAbsolute(root.path, entry.source);
  const sourceReal = probe.realpath(sourceAbs);
  if (sourceReal === null) {
    if (entry.required) {
      errors.push({ code: "source-missing", message: "必需的 source 不存在", mount: entry.id, path: sourceAbs });
    } else {
      skips.push({ mount: entry.id, reason: "optional-source-missing" });
    }
    return null;
  }
  if (!isWithin(rootReal, sourceReal)) {
    errors.push({ code: "source-escapes-root", message: "source 经符号链接解析到 root 之外", mount: entry.id, path: sourceAbs });
    return null;
  }
  const kind = probe.kind(sourceReal);
  if (kind !== entry.type) {
    errors.push({ code: "source-type-mismatch", message: `source 期望 ${entry.type}，实际 ${kind}`, mount: entry.id, path: sourceAbs });
    return null;
  }
  return { entry, sourceReal };
}

/** 评估 target 当前状态：缺失可写、正确软链保留、其余一律阻断。 */
function evaluateTarget(
  resolved: Resolved,
  checkout: string,
  probe: PathProbe,
  errors: MountError[],
  writes: PlannedWrite[],
  keeps: PlannedKeep[],
): void {
  const { entry, sourceReal } = resolved;
  const targetAbs = joinAbsolute(checkout, entry.target);
  const kind = probe.kind(targetAbs);
  switch (kind) {
    case "missing":
      writes.push({ mount: entry.id, target: entry.target, source: sourceReal, type: entry.type, readonly: entry.readonly });
      return;
    case "symlink": {
      const real = probe.realpath(targetAbs);
      if (real !== null && samePath(real, sourceReal)) {
        keeps.push({ mount: entry.id, target: entry.target, source: sourceReal, type: entry.type });
      } else {
        errors.push({ code: "target-wrong-symlink", message: "target 已是符号链接但指向别处或已断", mount: entry.id, path: targetAbs });
      }
      return;
    }
    case "file":
    case "dir":
      errors.push({ code: "target-occupied", message: `target 已被普通 ${kind} 占用，不会覆盖`, mount: entry.id, path: targetAbs });
      return;
    default:
      errors.push({ code: "target-unknown-object", message: "target 是未知类型的对象", mount: entry.id, path: targetAbs });
  }
}

/** 同一 manifest 内 target 不得重复，也不得互为祖先。 */
function checkTargetConflicts(mounts: MountEntry[], errors: MountError[]): void {
  for (let i = 0; i < mounts.length; i += 1) {
    const a = mounts[i]!;
    for (let j = i + 1; j < mounts.length; j += 1) {
      const b = mounts[j]!;
      if (a.target === b.target) {
        errors.push({ code: "duplicate-target", message: `target 重复：${a.id} 与 ${b.id}`, mount: b.id, path: b.target });
      } else if (isAncestorOf(a.target, b.target) || isAncestorOf(b.target, a.target)) {
        errors.push({ code: "target-overlap", message: `target 互为祖先：${a.id} 与 ${b.id}`, mount: b.id, path: b.target });
      }
    }
  }
}

/**
 * 评估挂载计划。任何一条阻断都让整体 blocked 且 writes 为空；
 * ready 时只返回缺失且可安全创建的入口、已正确存在的入口，以及非必需缺失的跳过项。
 */
export function evaluateMountPlan(input: MountPlanInput): MountPlan {
  const manifest = parseManifest(input.manifest);
  const roots = parseRoots(input.roots);
  const errors: MountError[] = [];
  if (!manifest.ok) errors.push(...manifest.errors);
  if (!roots.ok) errors.push(...roots.errors);
  if (!manifest.ok || !roots.ok) return blocked(errors);

  const checkout = toSlash(input.checkout);
  const probe = input.probe;
  const checkoutReal = isAbsolutePath(checkout) && probe.kind(checkout) === "dir" ? probe.realpath(checkout) : null;
  if (checkoutReal === null) {
    return blocked([{ code: "checkout-missing", message: "checkout 不是已存在的目录", path: input.checkout }]);
  }

  checkTargetConflicts(manifest.value.mounts, errors);

  const writes: PlannedWrite[] = [];
  const keeps: PlannedKeep[] = [];
  const skips: PlannedSkip[] = [];
  for (const entry of manifest.value.mounts) {
    const resolved = resolveSource(entry, roots.value.roots, probe, errors, skips);
    checkTargetParents(entry, checkout, checkoutReal, probe, errors);
    if (resolved === null) continue;
    evaluateTarget(resolved, checkout, probe, errors, writes, keeps);
  }

  if (errors.length > 0) return blocked(errors, keeps, skips);
  return { status: "ready", errors: [], writes, keeps, skips };
}

/** 供 parentOf 的消费者（执行层）复用，避免各处重复实现父目录推导。 */
export { parentOf };
