// manifest 与 machine-local roots 的 fail-closed 解析：未知字段、未知版本、未授权 profile 与信任域都拒绝。
import {
  MANIFEST_VERSION,
  OVERLAY_ENTRY,
  PRIVATE_LOCAL_PROFILE,
  ROOTS_VERSION,
  TRUST_DOMAINS,
  type MachineRoots,
  type Manifest,
  type MountEntry,
  type MountError,
  type RootDeclaration,
  type TrustDomain,
} from "./contract.ts";
import { isAbsolutePath, isWithin, safeRelativePath, toSlash } from "./paths.ts";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: MountError[] };

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ROOT_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const MANIFEST_FIELDS = new Set(["version", "profile", "mounts"]);
const MOUNT_FIELDS = new Set(["id", "root", "source", "target", "type", "required", "readonly"]);
const ROOTS_FIELDS = new Set(["version", "roots"]);
const ROOT_FIELDS = new Set(["path", "trust"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownFields(record: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(record).filter((key) => !allowed.has(key));
}

function parseMount(raw: unknown, index: number, errors: MountError[]): MountEntry | null {
  const label = `mounts[${index}]`;
  if (!isRecord(raw)) {
    errors.push({ code: "mount-invalid", message: `${label} 必须是对象` });
    return null;
  }
  for (const field of unknownFields(raw, MOUNT_FIELDS)) {
    errors.push({ code: "mount-unknown-field", message: `${label} 含未知字段 ${field}`, path: field });
  }
  const id = typeof raw.id === "string" && ID_PATTERN.test(raw.id) ? raw.id : null;
  const mount = id ?? undefined;
  if (id === null) errors.push({ code: "mount-invalid", message: `${label}.id 必须匹配 ${ID_PATTERN}` });
  const root = typeof raw.root === "string" && ROOT_ID_PATTERN.test(raw.root) ? raw.root : null;
  if (root === null) errors.push({ code: "mount-invalid", message: `${label}.root 必须匹配 ${ROOT_ID_PATTERN}`, mount });
  const source = safeRelativePath(raw.source);
  if (source === null) {
    errors.push({ code: "unsafe-source-path", message: `${label}.source 不是安全相对路径`, mount, path: String(raw.source) });
  }
  const target = safeRelativePath(raw.target);
  if (target === null) {
    errors.push({ code: "unsafe-target-path", message: `${label}.target 不是安全相对路径`, mount, path: String(raw.target) });
  } else if (!isWithin(OVERLAY_ENTRY, target)) {
    errors.push({ code: "target-outside-overlay", message: `${label}.target 必须位于 ${OVERLAY_ENTRY} 之下`, mount, path: target });
  }
  const type = raw.type === "dir" || raw.type === "file" ? raw.type : null;
  if (type === null) errors.push({ code: "mount-invalid", message: `${label}.type 必须是 dir 或 file`, mount });
  const required = typeof raw.required === "boolean" ? raw.required : null;
  if (required === null) errors.push({ code: "mount-invalid", message: `${label}.required 必须是布尔值`, mount });
  const readonly = typeof raw.readonly === "boolean" ? raw.readonly : null;
  if (readonly === null) errors.push({ code: "mount-invalid", message: `${label}.readonly 必须是布尔值`, mount });
  if (id === null || root === null || source === null || target === null || type === null || required === null || readonly === null) {
    return null;
  }
  return { id, root, source, target, type, required, readonly };
}

/** 解析 manifest；任何一处不合规都整体失败，并尽量把全部错误一次报出。 */
export function parseManifest(raw: unknown): ParseResult<Manifest> {
  const errors: MountError[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ code: "manifest-invalid", message: "manifest 必须是 JSON 对象" }] };
  }
  for (const field of unknownFields(raw, MANIFEST_FIELDS)) {
    errors.push({ code: "manifest-unknown-field", message: `manifest 含未知字段 ${field}`, path: field });
  }
  if (raw.version !== MANIFEST_VERSION) {
    errors.push({ code: "manifest-unsupported-version", message: `manifest.version 只支持 ${MANIFEST_VERSION}` });
  }
  if (raw.profile !== PRIVATE_LOCAL_PROFILE) {
    errors.push({ code: "unauthorized-profile", message: `V1 只授权 profile ${PRIVATE_LOCAL_PROFILE}` });
  }
  const mounts: MountEntry[] = [];
  if (!Array.isArray(raw.mounts)) {
    errors.push({ code: "manifest-invalid", message: "manifest.mounts 必须是数组" });
  } else {
    const seen = new Set<string>();
    raw.mounts.forEach((item, index) => {
      const mount = parseMount(item, index, errors);
      if (mount === null) return;
      if (seen.has(mount.id)) {
        errors.push({ code: "duplicate-id", message: `mount id 重复：${mount.id}`, mount: mount.id });
        return;
      }
      seen.add(mount.id);
      mounts.push(mount);
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { version: MANIFEST_VERSION, profile: PRIVATE_LOCAL_PROFILE, mounts } };
}

/** 解析 machine-local roots；路径必须是绝对路径，信任域只认 V1 授权的那一个。 */
export function parseRoots(raw: unknown): ParseResult<MachineRoots> {
  const errors: MountError[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ code: "roots-invalid", message: "roots 必须是 JSON 对象" }] };
  }
  for (const field of unknownFields(raw, ROOTS_FIELDS)) {
    errors.push({ code: "roots-unknown-field", message: `roots 含未知字段 ${field}`, path: field });
  }
  if (raw.version !== ROOTS_VERSION) {
    errors.push({ code: "roots-unsupported-version", message: `roots.version 只支持 ${ROOTS_VERSION}` });
  }
  const roots: Record<string, RootDeclaration> = {};
  if (!isRecord(raw.roots)) {
    errors.push({ code: "roots-invalid", message: "roots.roots 必须是对象" });
  } else {
    for (const [name, declaration] of Object.entries(raw.roots)) {
      if (!ROOT_ID_PATTERN.test(name)) {
        errors.push({ code: "roots-invalid", message: `root 名 ${name} 必须匹配 ${ROOT_ID_PATTERN}`, path: name });
        continue;
      }
      if (!isRecord(declaration)) {
        errors.push({ code: "roots-invalid", message: `root ${name} 必须是对象`, path: name });
        continue;
      }
      for (const field of unknownFields(declaration, ROOT_FIELDS)) {
        errors.push({ code: "roots-unknown-field", message: `root ${name} 含未知字段 ${field}`, path: `${name}.${field}` });
      }
      const path = typeof declaration.path === "string" ? toSlash(declaration.path) : "";
      const absolute = isAbsolutePath(path);
      if (!absolute) {
        errors.push({ code: "root-path-not-absolute", message: `root ${name} 的 path 必须是绝对路径`, path: name });
      }
      const trust = (TRUST_DOMAINS as readonly unknown[]).includes(declaration.trust)
        ? (declaration.trust as TrustDomain)
        : null;
      if (trust === null) {
        errors.push({ code: "unknown-trust-domain", message: `root ${name} 的 trust 只认 ${TRUST_DOMAINS.join("/")}`, path: name });
      }
      if (absolute && trust !== null) roots[name] = { path, trust };
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { version: ROOTS_VERSION, roots } };
}
