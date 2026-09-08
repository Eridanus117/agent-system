// PublicTreeAssessment 纯逻辑评估器：对最终 staged/index tree 做默认拒绝的公共发布检查。
// allowlist 优先、denylist 补充；symlink、gitlink、仓外路径、凭据、本机路径、内网地址、
// 业务标识与运行态数据一律拒绝；大文件与归档不能靠「跳过扫描」绕过。
import { createHash } from "node:crypto";
import { ArchiveError, detectArchive, readArchive } from "./archive.ts";
import type { PublicTreeAssessment, PublicTreePolicy, TreeEntry, Violation } from "./contract.ts";
import { safeRelativePath } from "./paths.ts";

const POLICY_FIELDS = new Set([
  "version",
  "allowedPaths",
  "deniedPaths",
  "contentExemptPaths",
  "deniedTokenHashes",
  "maxFileBytes",
  "largeFileAllowlist",
  "archiveMaxDepth",
]);

/** 业务标识以 sha256(小写词) 入策略文件，公共仓里不出现明文。 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token.toLowerCase(), "utf8").digest("hex");
}

/** 一条内容规则：稳定的规则名 + 正则；命中只报规则名，不回显内容。 */
interface ContentRule {
  code: "credential" | "local-path" | "internal-address";
  name: string;
  pattern: RegExp;
}

const CONTENT_RULES: ContentRule[] = [
  { code: "credential", name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { code: "credential", name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { code: "credential", name: "provider-key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { code: "credential", name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: "credential", name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    code: "credential",
    name: "assigned-secret",
    pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{12,}["']/i,
  },
  { code: "local-path", name: "posix-home", pattern: /(?:^|[^A-Za-z0-9_])\/(?:Users|home)\/[A-Za-z0-9_.-]+\// },
  { code: "local-path", name: "windows-home", pattern: /\b[A-Za-z]:[\\/]Users[\\/][A-Za-z0-9_.-]+[\\/]/ },
  {
    code: "internal-address",
    name: "private-ipv4",
    pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/,
  },
  { code: "internal-address", name: "internal-hostname", pattern: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|corp|intranet|lan)\b/i },
];

const TOKEN_PATTERN = /[A-Za-z0-9_-]{3,}/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** 策略文件本身也 fail-closed：缺字段、多字段、类型不对都算 policy-invalid。 */
export function validatePolicy(raw: unknown): { ok: true; policy: PublicTreePolicy } | { ok: false; violations: Violation[] } {
  const violations: Violation[] = [];
  if (!isRecord(raw)) {
    return { ok: false, violations: [{ path: "(policy)", code: "policy-invalid", detail: "not-an-object" }] };
  }
  for (const key of Object.keys(raw)) {
    if (!POLICY_FIELDS.has(key)) violations.push({ path: "(policy)", code: "policy-invalid", detail: `unknown-field:${key}` });
  }
  if (raw.version !== 1) violations.push({ path: "(policy)", code: "policy-invalid", detail: "version" });
  for (const field of ["allowedPaths", "deniedPaths", "contentExemptPaths", "deniedTokenHashes", "largeFileAllowlist"]) {
    if (!isStringArray(raw[field])) violations.push({ path: "(policy)", code: "policy-invalid", detail: field });
  }
  if (isStringArray(raw.allowedPaths) && raw.allowedPaths.length === 0) {
    violations.push({ path: "(policy)", code: "policy-invalid", detail: "allowedPaths-empty" });
  }
  if (typeof raw.maxFileBytes !== "number" || !(raw.maxFileBytes > 0)) {
    violations.push({ path: "(policy)", code: "policy-invalid", detail: "maxFileBytes" });
  }
  if (typeof raw.archiveMaxDepth !== "number" || !Number.isInteger(raw.archiveMaxDepth) || raw.archiveMaxDepth < 0) {
    violations.push({ path: "(policy)", code: "policy-invalid", detail: "archiveMaxDepth" });
  }
  if (violations.length > 0) return { ok: false, violations };
  return { ok: true, policy: raw as unknown as PublicTreePolicy };
}

/** 路径规则匹配：精确文件、目录前缀（以 / 结尾）、`*.ext` 后缀、任意层目录名。 */
export function matchesPathRule(path: string, rule: string): boolean {
  if (rule.startsWith("**/") && rule.endsWith("/")) {
    const name = rule.slice(3, -1);
    return path.split("/").slice(0, -1).includes(name);
  }
  if (rule.startsWith("*.")) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    return base.endsWith(rule.slice(1)) && base !== rule.slice(1);
  }
  if (rule.endsWith("/")) return path.startsWith(rule);
  return path === rule;
}

function firstMatch(path: string, rules: string[]): string | null {
  for (const rule of rules) if (matchesPathRule(path, rule)) return rule;
  return null;
}

interface Scanner {
  policy: PublicTreePolicy;
  tokenHashes: Set<string>;
  violations: Violation[];
}

/** 对一段字节做内容扫描；归档递归展开，文本按规则匹配。 */
function scanBytes(scanner: Scanner, path: string, bytes: Uint8Array, depth: number, exempt: boolean): void {
  const archive = detectArchive(bytes);
  if (archive !== null) {
    if (depth + 1 > scanner.policy.archiveMaxDepth) {
      scanner.violations.push({ path, code: "archive-too-deep", detail: archive });
      return;
    }
    let members;
    try {
      members = readArchive(archive, bytes);
    } catch (error) {
      scanner.violations.push({ path, code: "archive-unreadable", detail: error instanceof ArchiveError ? error.message : archive });
      return;
    }
    for (const member of members) {
      const memberPath = `${path}!${member.path}`;
      if (member.kind === "symlink") {
        scanner.violations.push({ path: memberPath, code: "symlink" });
        continue;
      }
      if (member.kind === "other") {
        scanner.violations.push({ path: memberPath, code: "archive-unreadable", detail: "unsupported-member-type" });
        continue;
      }
      if (safeRelativePath(member.path) === null) {
        scanner.violations.push({ path: memberPath, code: "path-outside-repo" });
        continue;
      }
      const memberDenied = firstMatch(member.path, scanner.policy.deniedPaths);
      if (memberDenied !== null) {
        scanner.violations.push({ path: memberPath, code: "path-denied", detail: memberDenied });
        continue;
      }
      scanBytes(scanner, memberPath, member.bytes, depth + 1, exempt);
    }
    return;
  }
  if (exempt) return;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  for (const rule of CONTENT_RULES) {
    if (rule.pattern.test(text)) scanner.violations.push({ path, code: rule.code, detail: rule.name });
  }
  if (scanner.tokenHashes.size > 0) {
    const seen = new Set<string>();
    for (const match of text.matchAll(TOKEN_PATTERN)) {
      const token = match[0].toLowerCase();
      if (seen.has(token)) continue;
      seen.add(token);
      if (scanner.tokenHashes.has(hashToken(token))) {
        scanner.violations.push({ path, code: "denied-token", detail: hashToken(token).slice(0, 12) });
      }
    }
  }
}

/**
 * 评估公共 tree。输入是 tree 条目的迭代器与策略原文；策略无效时直接 blocked。
 * 每个条目按 路径安全 → 类型 → denylist → allowlist → 大小 → 内容 的顺序检查，全部违规都收集。
 */
export function assessPublicTree(entries: Iterable<TreeEntry>, rawPolicy: unknown): PublicTreeAssessment {
  const validated = validatePolicy(rawPolicy);
  if (!validated.ok) return { status: "blocked", violations: validated.violations, scanned: 0 };
  const scanner: Scanner = {
    policy: validated.policy,
    tokenHashes: new Set(validated.policy.deniedTokenHashes.map((hash) => hash.toLowerCase())),
    violations: [],
  };
  let scanned = 0;
  for (const entry of entries) {
    scanned += 1;
    const path = entry.path;
    if (safeRelativePath(path) === null) {
      scanner.violations.push({ path, code: "path-outside-repo" });
      continue;
    }
    if (entry.kind === "symlink") {
      scanner.violations.push({ path, code: "symlink" });
      continue;
    }
    if (entry.kind === "gitlink") {
      scanner.violations.push({ path, code: "gitlink" });
      continue;
    }
    const denied = firstMatch(path, scanner.policy.deniedPaths);
    if (denied !== null) scanner.violations.push({ path, code: "path-denied", detail: denied });
    if (firstMatch(path, scanner.policy.allowedPaths) === null) scanner.violations.push({ path, code: "path-not-allowlisted" });
    if (entry.size > scanner.policy.maxFileBytes && firstMatch(path, scanner.policy.largeFileAllowlist) === null) {
      scanner.violations.push({ path, code: "large-file", detail: String(entry.size) });
    }
    let bytes: Uint8Array;
    try {
      bytes = entry.read();
    } catch (error) {
      scanner.violations.push({ path, code: "content-unreadable", detail: (error as Error).message });
      continue;
    }
    const exempt = firstMatch(path, scanner.policy.contentExemptPaths) !== null;
    scanBytes(scanner, path, bytes, 0, exempt);
  }
  if (scanner.violations.length > 0) return { status: "blocked", violations: scanner.violations, scanned };
  return { status: "allowed", violations: [], scanned };
}
