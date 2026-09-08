// shell 命令与文件路径的分类辅助函数：从 checks.ts 拆出，供机械检查复用。
// 注意：SHELL_RECORD_MARKERS（扫整条命令文本）与 RECORD_DIRS/RECORD_WORDS（扫单个路径）
// 是两套故意分开维护的词表——前者服务于「抽不出字面路径、退回扫命令文本」这条粗判路径，
// 后者服务于「已经拿到字面路径」这条精确判定路径；两者标记词不完全重合，不要合并成一份。

/** 重定向／原地编辑／写文件调用：真写文件。这是全仓唯一一份重定向识别正则——
 * `tagCommand`（types.ts）与 `shellWriteTarget`（本文件）都必须用同一份，否则一条命令里出现
 * 多个 `>` 时两处会认出不同的目标（先出现的假重定向偷走后面真重定向的目标）。
 * 排除两类假阳性：(1) `=>`/`->`/`2>`/`2>&1`/`&>`/`1>` 这类不是「重定向到文件」的写法——`>` 前一个字符
 *   是 `=`/`-`/`<`/`2`/`&`/`1` 时不算；(2) `>` 后面（跳过空白）不像路径或引号的写法（比如比较运算符
 *   `x > 5` 里的 `5`）——要求紧跟着的 token 以引号/`/`/`.`/`~`/`$`/盘符（`C:`）开头，或是一个含 `/`／`.`
 *   的普通词（如 `out.txt`），并且不是写 /dev/null。 */
export const WRITE_REDIRECT = /(?<![=\-<2&1])>>?(?!\s*\/dev\/null)(?=\s*(?:['"]|[/.~$]|[A-Za-z]:|\w[^\s]*[/.]))/;

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

/** 从 shell 命令里抠出写入目标：优先取 WRITE_REDIRECT 认定的第一个真重定向之后的路径——
 * 用同一份 WRITE_REDIRECT 定位，避免命令里更早出现的假重定向（`=>`/`->`/比较运算符）偷走
 * 后面真重定向的目标。目标带引号时取引号内的完整内容（允许含空格），不带引号时取到
 * 空白/`;`/`&&`/`|` 为止；其次是 `tee`/`sed -i` 的目标参数；都取不到时返回 null
 *（比如 `writeFileSync(...)` 这种代码里的调用）。 */
export function shellWriteTarget(command: string): string | null {
  const redirect = WRITE_REDIRECT.exec(command);
  if (redirect) {
    const rest = command.slice(redirect.index + redirect[0].length);
    const quoted = rest.match(/^\s*(['"])((?:(?!\1).)+)\1/);
    if (quoted?.[2]) return quoted[2];
    const bare = rest.match(/^\s*([^\s;&|'"]+)/);
    if (bare?.[1]) return bare[1];
  }
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

/** 找不到 shellWriteTarget 时的兜底：如果命令里确实有一处 WRITE_REDIRECT 认定的重定向，
 * 只取该重定向之后（到下一个 `&&`/`||`/`;`/`|` 为止）的字面 token 供草稿目录判定用——
 * 不能拿整条命令去扫，否则命令里其它位置提到的 `/tmp/...`（比如读取的源文件）会误伤写入目标的判定。 */
function redirectTail(command: string): string | null {
  const redirect = WRITE_REDIRECT.exec(command);
  if (!redirect) return null;
  const rest = command.slice(redirect.index + redirect[0].length);
  return rest.split(/&&|\|\||[;|]/)[0]?.trim() || null;
}

/**
 * 当 `shellWriteTarget` 抽不出字面路径（写入目标是 shell 变量引用，或压根找不到重定向）时，
 * 退回扫描整条命令的记录类/代码类标记词做粗判：命令里出现记录类标记且没有代码类标记 → 记录；
 * 否则保守按代码处理。草稿目录的判定只看写入目标（或重定向之后的字面 token），不看整条命令——
 * 命令里其它地方出现的 `/tmp/...`（比如读取的源文件）不该让写入目标被误判成草稿。
 */
export function classifyShellWrite(command: string): "code" | "record" | "scratch" {
  const scratchProbe = shellWriteTarget(command) ?? redirectTail(command);
  if (scratchProbe !== null && isScratchPath(scratchProbe)) return "scratch";
  const hasRecord = SHELL_RECORD_MARKERS.some((m) => command.includes(m));
  const hasCode = SHELL_CODE_MARKERS.some((m) => command.includes(m));
  if (hasRecord && !hasCode) return "record";
  return "code";
}
