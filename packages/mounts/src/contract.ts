// mounts 包的公共合同：manifest、machine-local roots、挂载计划与公共面评估的类型。
// 本文件只有类型与常量，不访问文件系统；评估器、CLI 与 CI 门禁都只依赖这里的形状。

/** manifest 的 schema 版本；V1 只认这一个值。 */
export const MANIFEST_VERSION = 1 as const;
/** machine-local roots 文件的 schema 版本。 */
export const ROOTS_VERSION = 1 as const;
/** V1 唯一授权的 profile，也是唯一授权的信任域。 */
export const PRIVATE_LOCAL_PROFILE = "private-local" as const;
/** V1 唯一的私有投影入口：每个 target 都必须是它本身或位于它之下。 */
export const OVERLAY_ENTRY = ".omp/local" as const;

export type Profile = typeof PRIVATE_LOCAL_PROFILE;
/** 已知的信任域；V1 只授权 private-local，其余两个只是「认识但不授权」，用来区分未知与未授权。 */
export const TRUST_DOMAINS = ["private-local", "shared-runtime", "public"] as const;
export type TrustDomain = (typeof TRUST_DOMAINS)[number];
export type MountType = "dir" | "file";

/** manifest 里的一条挂载声明。source 相对 root，target 相对 checkout。 */
export interface MountEntry {
  id: string;
  root: string;
  source: string;
  target: string;
  type: MountType;
  required: boolean;
  /** V1 记录并透传到计划结果，符号链接本身不强制只读。 */
  readonly: boolean;
}

/** 目标仓侧的挂载清单；只引用 root 别名与相对路径，不含本机绝对路径。 */
export interface Manifest {
  version: typeof MANIFEST_VERSION;
  profile: Profile;
  mounts: MountEntry[];
}

/** machine-local 层的一条 root 声明；绝对路径只存在于这里。 */
export interface RootDeclaration {
  path: string;
  trust: TrustDomain;
}

export interface MachineRoots {
  version: typeof ROOTS_VERSION;
  roots: Record<string, RootDeclaration>;
}

/** 评估器可能给出的全部拒绝原因；每个值都对应至少一条消费者可观察的测试。 */
export type MountErrorCode =
  | "manifest-invalid"
  | "manifest-unknown-field"
  | "manifest-unsupported-version"
  | "unauthorized-profile"
  | "mount-invalid"
  | "mount-unknown-field"
  | "duplicate-id"
  | "unsafe-source-path"
  | "unsafe-target-path"
  | "target-outside-overlay"
  | "roots-invalid"
  | "roots-unknown-field"
  | "roots-unsupported-version"
  | "root-path-not-absolute"
  | "unknown-trust-domain"
  | "unknown-root"
  | "unauthorized-root"
  | "root-missing"
  | "checkout-missing"
  | "source-missing"
  | "source-escapes-root"
  | "source-type-mismatch"
  | "target-parent-not-directory"
  | "target-escapes-checkout"
  | "target-occupied"
  | "target-wrong-symlink"
  | "target-unknown-object"
  | "duplicate-target"
  | "target-overlap"
  // 以下由执行层（CLI）在纯逻辑计划之外追加：target 没被 git 排除就会污染业务分支；写入失败已回滚。
  | "target-not-excluded"
  | "write-failed";

export interface MountError {
  code: MountErrorCode;
  message: string;
  /** 关联的 mount id；manifest 级错误没有。 */
  mount?: string;
  /** 关联路径，原样给出（相对或绝对都可能）。 */
  path?: string;
}

/** 一个待创建的符号链接：target 相对 checkout，source 是跟随符号链接后的绝对真实路径。 */
export interface PlannedWrite {
  mount: string;
  target: string;
  source: string;
  type: MountType;
  readonly: boolean;
}

/** 一个已存在且指向正确的符号链接，执行层原样保留。 */
export interface PlannedKeep {
  mount: string;
  target: string;
  source: string;
  type: MountType;
}

/** 非必需且 source 缺失的条目：不是错误，但也不会写。 */
export interface PlannedSkip {
  mount: string;
  reason: "optional-source-missing";
}

/**
 * MountPlan 的整体结果只有两种：
 * ready 时 errors 为空，只返回安全的缺失入口与正确保留入口；
 * blocked 时 errors 非空且 writes 必须为空，任何单条阻断都让整个计划 blocked。
 */
export type MountPlan =
  | { status: "ready"; errors: []; writes: PlannedWrite[]; keeps: PlannedKeep[]; skips: PlannedSkip[] }
  | { status: "blocked"; errors: MountError[]; writes: []; keeps: PlannedKeep[]; skips: PlannedSkip[] };

/** 评估器读取路径状态的最小接口；测试用合成实现，CLI 用文件系统实现。 */
export interface PathProbe {
  /** lstat 语义：不跟随最后一段符号链接。 */
  kind(absolutePath: string): "missing" | "file" | "dir" | "symlink" | "other";
  /** 跟随全部符号链接后的真实绝对路径；不存在或链断了返回 null。 */
  realpath(absolutePath: string): string | null;
}

// ---- 公共面评估（PublicTreeAssessment） ----

/** git tree 里一个条目的种类；symlink 与 gitlink 都不允许进入公共仓。 */
export type TreeEntryKind = "blob" | "executable" | "symlink" | "gitlink";

/** 最终 staged/index tree 的一个条目；内容按需读取，评估器不接触工作目录。 */
export interface TreeEntry {
  path: string;
  kind: TreeEntryKind;
  size: number;
  read(): Uint8Array;
}

export interface PublicTreePolicy {
  version: 1;
  /** allowlist 优先：路径必须落在其中一项之下（以 / 结尾是目录前缀，否则是精确文件）。 */
  allowedPaths: string[];
  // denylist 补充：命中即拒绝。写法同 allowedPaths，另支持两种：`*.ext` 按文件名后缀匹配；
  // 两个星号、斜杠、目录名、斜杠（例如 `**` + `/node_modules/`）匹配任意层级的该目录。
  deniedPaths: string[];
  /** 内容规则豁免（例如负面测试夹具）；路径规则、大小与归档规则仍然生效。 */
  contentExemptPaths: string[];
  /** 业务标识等不能明文写进公共仓的词：存 sha256(小写词) 的十六进制。 */
  deniedTokenHashes: string[];
  /** 超过此字节数的文件必须在 largeFileAllowlist 里，否则拒绝；内容仍会完整扫描。 */
  maxFileBytes: number;
  largeFileAllowlist: string[];
  /** 归档嵌套层数上限；超过即拒绝，不跳过。 */
  archiveMaxDepth: number;
}

export type ViolationCode =
  | "policy-invalid"
  | "path-outside-repo"
  | "path-not-allowlisted"
  | "path-denied"
  | "symlink"
  | "gitlink"
  | "large-file"
  | "content-unreadable"
  | "credential"
  | "local-path"
  | "internal-address"
  | "denied-token"
  | "archive-unreadable"
  | "archive-too-deep";

export interface Violation {
  path: string;
  code: ViolationCode;
  /** 稳定的补充说明：规则名或归档内路径，不回显敏感内容本身。 */
  detail?: string;
}

/** 任一 violation 都让整个 tree blocked；scanned 是评估过的条目数，供审阅核对覆盖面。 */
export type PublicTreeAssessment =
  | { status: "allowed"; violations: []; scanned: number }
  | { status: "blocked"; violations: Violation[]; scanned: number };
