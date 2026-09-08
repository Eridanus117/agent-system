// shell 命令与文件路径的分类辅助函数：从 checks.ts 拆出，供机械检查复用。
// 注意：SHELL_RECORD_MARKERS（扫整条命令文本）与 RECORD_DIRS/RECORD_WORDS（扫单个路径）
// 是两套故意分开维护的词表——前者服务于「抽不出字面路径、退回扫命令文本」这条粗判路径，
// 后者服务于「已经拿到字面路径」这条精确判定路径；两者标记词不完全重合，不要合并成一份。

const RECORD_DIRS = ["/desk/", "/docs/"];
const RECORD_WORDS = ["plans/", "specs/", "提案", "收件箱", "工作日志", "现在在哪"];

/** 记录类文件：写它不算「建东西」。 */
export function isRecordPath(p: string): boolean {
  const s = p.replaceAll("\\", "/");
  if (RECORD_DIRS.some((d) => s.includes(d))) return true;
  return s.endsWith(".md") && RECORD_WORDS.some((w) => s.includes(w));
}

export function isPlanPath(p: string): boolean {
  const s = p.replaceAll("\\", "/");
  return s.includes("/plans/") || s.includes("计划");
}

/** 临时/草稿目录：/tmp/、/Temp/、AppData/Local/Temp 下的写入不算「建东西」（temp 段大小写不敏感）。 */
const SCRATCH_DIRS = /\/tmp\/|\/temp\/|appdata\/local\/temp/i;
export function isScratchPath(p: string): boolean {
  return SCRATCH_DIRS.test(p.replaceAll("\\", "/"));
}

/** 从 shell 命令里抠出写入目标：优先取第一个 `>`/`>>` 之后的路径——
 * 目标带引号时取引号内的完整内容（允许含空格），不带引号时取到空白/`;`/`&&`/`|` 为止；
 * 其次是 `tee`/`sed -i` 的目标参数；都取不到时返回 null（比如 `writeFileSync(...)` 这种代码里的调用）。 */
export function shellWriteTarget(command: string): string | null {
  const quoted = command.match(/(?<![2&])>>?\s*(['"])((?:(?!\1).)+)\1/);
  if (quoted?.[2]) return quoted[2];
  const bare = command.match(/(?<![2&])>>?\s*([^\s;&|'"]+)/);
  if (bare?.[1]) return bare[1];
  for (const seg of command.split(/&&|\|\||[;|]/)) {
    const tee = seg.match(/\btee\s+(?:-a\s+)?(['"]?)([^\s;&|'"]+)\1/);
    if (tee?.[2]) return tee[2];
    if (/\bsed\s+-i\b/.test(seg)) {
      const tokens = seg.trim().split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, ""));
      const last = tokens[tokens.length - 1];
      if (last && last !== "-i") return last;
    }
  }
  return null;
}

/** 记录类标记词：整条命令里出现这些即认为写的是记录类文件（与 RECORD_DIRS/RECORD_WORDS 是分开的词表，见文件顶部说明）。 */
const SHELL_RECORD_MARKERS = ["desk/", "工作日志", "提案", "收件箱", "现在在哪", "docs/", "plans/", "specs/"];
/** 代码类标记词：出现即认为命令里牵涉代码目录。 */
const SHELL_CODE_MARKERS = ["/src/", "/packages/"];

/**
 * 当 `shellWriteTarget` 抽不出字面路径（写入目标是 shell 变量引用，或压根找不到重定向）时，
 * 退回扫描整条命令的记录类/代码类标记词做粗判：命令里出现记录类标记且没有代码类标记 → 记录；
 * 命中临时目录标记 → 草稿；否则保守按代码处理。
 */
export function classifyShellWrite(command: string): "code" | "record" | "scratch" {
  if (isScratchPath(command)) return "scratch";
  const hasRecord = SHELL_RECORD_MARKERS.some((m) => command.includes(m));
  const hasCode = SHELL_CODE_MARKERS.some((m) => command.includes(m));
  if (hasRecord && !hasCode) return "record";
  return "code";
}
