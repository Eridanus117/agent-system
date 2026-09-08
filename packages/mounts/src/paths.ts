// 路径安全规则：相对路径的白名单式校验，以及跨平台的绝对路径比较。
// 所有路径在本包内部统一用正斜杠表示；Windows 的盘符路径写成 `C:/...`。

const BACKSLASH = "\\";

/** 把反斜杠统一成正斜杠；不做其它归一化。 */
export function toSlash(p: string): string {
  return p.replaceAll(BACKSLASH, "/");
}

/** POSIX 绝对路径或带盘符的 Windows 绝对路径。UNC 路径不接受。 */
export function isAbsolutePath(p: string): boolean {
  return /^(?:[A-Za-z]:)?\/(?!\/)/.test(p);
}

/**
 * 安全相对路径：非空、不以 / 或盘符开头、不含反斜杠、没有空段、没有 `.` 与 `..`、没有控制字符。
 * 通过则返回原样（已经是规范形），否则返回 null。
 */
export function safeRelativePath(p: unknown): string | null {
  if (typeof p !== "string" || p.length === 0) return null;
  if (p.includes(BACKSLASH)) return null;
  if (/^[A-Za-z]:/.test(p) || p.startsWith("/")) return null;
  for (const ch of p) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return null;
  }
  for (const segment of p.split("/")) {
    if (segment === "" || segment === "." || segment === "..") return null;
  }
  return p;
}

/** 拼接绝对根与安全相对路径；调用方保证两者都已校验。 */
export function joinAbsolute(root: string, relative: string): string {
  const base = toSlash(root).replace(/\/+$/, "");
  return relative === "" ? base : `${base}/${relative}`;
}

function comparable(p: string): string {
  const s = toSlash(p).replace(/\/+$/, "");
  return process.platform === "win32" ? s.toLowerCase() : s;
}

/** 两个绝对路径是否指同一位置；Windows 上不区分大小写。 */
export function samePath(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

/** candidate 是否等于 base 或位于 base 之下（按路径段比较，不是字符串前缀）。 */
export function isWithin(base: string, candidate: string): boolean {
  const b = comparable(base);
  const c = comparable(candidate);
  return c === b || c.startsWith(`${b}/`);
}

/** 相对路径 a 是否是 b 的祖先（严格，不含相等）。 */
export function isAncestorOf(a: string, b: string): boolean {
  return b.startsWith(`${a}/`);
}

/** 绝对路径的父目录；根目录的父目录是它自己。 */
export function parentOf(absolutePath: string): string {
  const s = toSlash(absolutePath).replace(/\/+$/, "");
  const index = s.lastIndexOf("/");
  if (index < 0) return s;
  if (index === 0) return "/";
  const parent = s.slice(0, index);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}
