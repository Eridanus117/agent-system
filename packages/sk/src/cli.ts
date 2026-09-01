#!/usr/bin/env bun
// sk — skills profile 管理与启动薄层（提案：desk/提案/2026-08-26-Skills管理工具.md）
// profile = <库根>/profiles/<名>/ 文件夹：skills/ 内是指回库的 junction，文件夹即配置。
// plugin.json / overlay.yml / manifest.json 均由 sync 派生，勿手改。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { SK_VERSION } from "./version.ts";

interface Skill { name: string; group: string; dir: string; desc: string; }
interface ProfileEntry { name: string; link: string; target: string | null; alive: boolean; }
interface ManifestSkill { name: string; target: string; }

// 技能库根的解析顺序：SK_ROOT 环境变量 → 从源码位置上溯 → 从编译后可执行文件位置上溯。
// 判定标准：目录下存在 plugins/ 或 vendor/（技能库的扫描根）。
function isLibraryRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, "plugins")) || fs.existsSync(path.join(dir, "vendor"));
}

function walkUp(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (isLibraryRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveRoot(): string {
  const env = process.env.SK_ROOT;
  if (env) {
    if (isLibraryRoot(env)) return fs.realpathSync(env);
    die(`SK_ROOT 指向的目录里找不到 plugins/ 或 vendor/：${env}`);
  }
  const fromSource = walkUp(path.dirname(fileURLToPath(import.meta.url)));
  if (fromSource) return fs.realpathSync(fromSource);
  const fromExe = walkUp(path.dirname(process.execPath));
  if (fromExe) return fs.realpathSync(fromExe);
  die("找不到技能库根：请设置 SK_ROOT 环境变量指向 agent-system 仓库根目录。");

}

const ROOT = resolveRoot();
const PROFILES = path.join(ROOT, "profiles");
// 库的扫描根：<根>/<组>/skills/<技能>/SKILL.md
const SCAN_ROOTS = [path.join(ROOT, "plugins"), path.join(ROOT, "vendor")];

// junction/symlink 的摘除：Windows junction 用 rmdir，POSIX symlink 用 unlink。
// 两者都只摘链接本身，不碰目标目录。
function removeLink(link: string): void {
  try { fs.rmdirSync(link); } catch { fs.unlinkSync(link); }
}

function listGroups(): { group: string; dir: string }[] {
  const groups: { group: string; dir: string }[] = [];
  for (const root of SCAN_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const g of fs.readdirSync(root, { withFileTypes: true })) {
      if (!g.isDirectory()) continue;
      const skillsDir = path.join(root, g.name, "skills");
      if (fs.existsSync(skillsDir)) groups.push({ group: g.name, dir: skillsDir });
    }
  }
  return groups;
}

function frontmatter(file: string): Record<string, string> {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm: Record<string, string> = {};
  if (m && m[1] !== undefined) {
    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const kv = (lines[i] ?? "").match(/^(\w[\w-]*):\s*(.*)$/);
      if (!kv || kv[1] === undefined || kv[2] === undefined) continue;
      let val = kv[2].trim();
      if (val === "" || /^[>|][+-]?$/.test(val)) { // 块标量：收接下来的缩进行
        const parts: string[] = [];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1] ?? "")) parts.push((lines[++i] ?? "").trim());
        val = parts.join(" ");
      }
      fm[kv[1]] = val;
    }
  }
  return fm;
}

function inventory(): Skill[] {
  const skills: Skill[] = [];
  for (const { group, dir } of listGroups()) {
    for (const s of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!s.isDirectory()) continue;
      const skillMd = path.join(dir, s.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      skills.push({ name: s.name, group, dir: path.join(dir, s.name), desc: frontmatter(skillMd)["description"] ?? "" });
    }
  }
  return skills;
}

function globToRe(pattern: string): RegExp {
  return new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
}

// 模式：@组名 → 整组；否则按技能名 glob（* ? 通配）
function matchSkills(patterns: string[]): Skill[] {
  const inv = inventory();
  const picked = new Map<string, Skill>();
  for (const p of patterns) {
    let hits: Skill[];
    if (p.startsWith("@")) hits = inv.filter(s => s.group === p.slice(1));
    else { const re = globToRe(p); hits = inv.filter(s => re.test(s.name)); }
    if (hits.length === 0) die(`模式无匹配：${p}`);
    for (const s of hits) {
      const prev = picked.get(s.name);
      if (prev && prev.dir !== s.dir) die(`同名冲突：${s.name}\n  ${prev.group}/${s.name}\n  ${s.group}/${s.name}\n请用更精确的模式二选一。`);
      picked.set(s.name, s);
    }
  }
  return [...picked.values()];
}

// profile 名限制为单一路径段，防止 `..\..\x` 之类穿越出 profiles/ 目录
function profileDir(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) die(`非法 profile 名：${name}（只允许字母数字与 . _ -，且不含路径分隔符）`);
  const dir = path.join(PROFILES, name);
  if (path.relative(PROFILES, dir).includes("..")) die(`非法 profile 名：${name}`);
  return dir;
}
function skillsDirOf(name: string): string { return path.join(profileDir(name), "skills"); }

function profileSkills(name: string): ProfileEntry[] {
  const dir = skillsDirOf(name);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() || d.isSymbolicLink())
    .map(d => {
      const link = path.join(dir, d.name);
      let target: string | null = null, alive = false;
      try { target = fs.readlinkSync(link); alive = fs.existsSync(path.join(link, "SKILL.md")); } catch { /* 非链接目录 */ alive = fs.existsSync(path.join(link, "SKILL.md")); }
      return { name: d.name, link, target, alive };
    });
}

// 由 junction 目标推断技能所属组：<扫描根>/<组>/skills/<技能>
function groupOfEntry(e: ProfileEntry): string | null {
  try {
    const rel = path.relative(ROOT, fs.realpathSync(e.link));
    const seg = rel.split(path.sep);
    return seg.length >= 3 ? (seg[1] ?? null) : null;
  } catch { return null; }
}

function readManifest(name: string): ManifestSkill[] {
  const mf = path.join(profileDir(name), "manifest.json");
  if (!fs.existsSync(mf)) return [];
  return (JSON.parse(fs.readFileSync(mf, "utf8")).skills ?? []) as ManifestSkill[];
}

// allowEmpty：只有明确的用户操作（new/rm）允许把非空 manifest 写空；
// 其他路径（run/add/sync）遇到「manifest 非空但链接全缺」视为未 restore 的 clone，拒绝覆盖。
function sync(name: string, allowEmpty = false): number {
  const dir = profileDir(name);
  if (!fs.existsSync(dir)) die(`profile 不存在：${name}`);
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.mkdirSync(skillsDirOf(name), { recursive: true });
  const entries = profileSkills(name);
  const live = entries.filter(e => e.alive);
  if (!allowEmpty && live.length === 0 && readManifest(name).length > 0) {
    die(`拒绝把 ${name} 的 manifest 覆盖为空：技能链接全部缺失（多半是新 clone）。先执行 sk restore ${name}。`);
  }
  for (const e of entries.filter(e => !e.alive)) {
    removeLink(e.link);
    console.log(`已清除失效链接：${name}/${e.name}`);
  }
  fs.writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({
    name, version: "0.0.0", description: `skills profile: ${name}（sk 生成，勿手改）`,
  }, null, 2) + "\n");
  const skillsPath = skillsDirOf(name).replaceAll("\\", "/");
  fs.writeFileSync(path.join(dir, "overlay.yml"), `# sk 生成，勿手改（机器相关的绝对路径，不入 git）\nskills:\n  customDirectories:\n    - ${skillsPath}\n`);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    skills: live.map(e => ({ name: e.name, target: path.relative(ROOT, fs.realpathSync(e.link)).replaceAll("\\", "/") })),
  }, null, 2) + "\n");
  return live.length;
}

function cmdNew(name: string | undefined): void {
  if (!name) die("用法：sk new <profile>");
  if (fs.existsSync(profileDir(name!))) die(`已存在：${name}`);
  fs.mkdirSync(skillsDirOf(name!), { recursive: true });
  sync(name!, true);
  console.log(`已创建 profile：${name}`);
}

function cmdAdd(name: string | undefined, patterns: string[]): void {
  if (!name || patterns.length === 0) die("用法：sk add <profile> <模式...>（技能名 glob 或 @组名）");
  if (!fs.existsSync(profileDir(name!))) cmdNew(name);
  // 只把存活链接算作已存在；同名的失效链接先摘掉，让重新 add 能恢复
  const entries = profileSkills(name!);
  const existing = new Set(entries.filter(e => e.alive).map(e => e.name));
  const dead = new Map(entries.filter(e => !e.alive).map(e => [e.name, e.link]));
  let added = 0;
  for (const s of matchSkills(patterns)) {
    if (existing.has(s.name)) continue;
    const deadLink = dead.get(s.name);
    if (deadLink) removeLink(deadLink);
    fs.symlinkSync(s.dir, path.join(skillsDirOf(name!), s.name), "junction");
    added++;
  }
  const total = sync(name!);
  console.log(`${name}：新增 ${added}，现共 ${total} 个技能`);
}

function cmdRm(name: string | undefined, patterns: string[]): void {
  if (!name || patterns.length === 0) die("用法：sk rm <profile> <模式...>（技能名 glob 或 @组名）");
  let removed = 0;
  for (const e of profileSkills(name!)) {
    const hit = patterns.some(p => p.startsWith("@") ? groupOfEntry(e) === p.slice(1) : globToRe(p).test(e.name));
    if (hit) {
      removeLink(e.link);
      removed++;
    }
  }
  if (removed === 0) die(`模式未匹配任何技能：${patterns.join(" ")}（sk profiles / sk list 查看）`);
  const total = sync(name!, true);
  console.log(`${name}：移除 ${removed}，现共 ${total} 个技能`);
}

function cmdRestore(name: string | undefined): void {
  if (!name) die("用法：sk restore <profile>");
  const skills = readManifest(name!);
  if (skills.length === 0 && !fs.existsSync(path.join(profileDir(name!), "manifest.json"))) die(`无 manifest：${name}`);
  fs.mkdirSync(skillsDirOf(name!), { recursive: true });
  for (const s of skills) {
    const link = path.join(skillsDirOf(name!), s.name);
    if (!fs.existsSync(link)) fs.symlinkSync(path.join(ROOT, s.target), link, "junction");
  }
  console.log(`${name}：已按 manifest 重建，共 ${sync(name!)} 个技能`);
}

function cmdList(): void {
  const inv = inventory();
  const byName = new Map<string, Skill[]>();
  for (const s of inv) {
    const arr = byName.get(s.name) ?? [];
    arr.push(s);
    byName.set(s.name, arr);
  }
  for (const s of inv.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))) {
    const dup = (byName.get(s.name)?.length ?? 0) > 1 ? "  ⚠ 同名冲突" : "";
    console.log(`${s.group.padEnd(24)} ${s.name.padEnd(40)} ${s.desc.slice(0, 60)}${dup}`);
  }
  console.log(`\n共 ${inv.length} 个技能，${listGroups().length} 个组（@组名 可整组引用）`);
}

function cmdProfiles(): void {
  if (!fs.existsSync(PROFILES)) { console.log("（还没有 profile）"); return; }
  for (const d of fs.readdirSync(PROFILES, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const entries = profileSkills(d.name);
    const dead = entries.filter(e => !e.alive).length;
    console.log(`${d.name.padEnd(20)} ${entries.length} 个技能${dead ? `（${dead} 个链接失效，跑 sk sync ${d.name}）` : ""}`);
  }
}

// 按 PATH + PATHEXT 解析可执行文件，避免走 shell 字符串拼接
function resolveExecutable(cmd: string): string {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map(e => e.toLowerCase()) : [""];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of ["", ...exts]) {
      const candidate = path.join(dir, cmd + ext);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  die(`找不到可执行文件：${cmd}（确认已安装并在 PATH 中）`);

}

// Windows 命令行参数转义（CommandLineToArgvW 规则）：引号包裹、反斜杠翻倍、内嵌引号转 \"
function winQuote(arg: string): string {
  if (/[%!]/.test(arg)) die(`参数含 cmd 展开字符（% 或 !），拒绝经 cmd.exe 传递：${arg}`);
  if (!/[\s"^&|<>()]/.test(arg) && arg !== "") return arg;
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}

function cmdRun(name: string | undefined, cli: string | undefined, rest: string[]): void {
  if (!name || !cli) die("用法：sk run <profile> <omp|claude> [参数...]");
  if (!fs.existsSync(profileDir(name!))) die(`profile 不存在：${name}（sk profiles 查看）`);
  // 新 clone：链接缺失但 manifest 有内容 → 先按 manifest 重建，不能静默清空
  if (profileSkills(name!).filter(e => e.alive).length === 0 && readManifest(name!).length > 0) cmdRestore(name);
  sync(name!);
  let cmd: string, args: string[];
  if (cli === "omp") { cmd = "omp"; args = ["--config", path.join(profileDir(name!), "overlay.yml"), ...rest]; }
  else if (cli === "claude") { cmd = "claude"; args = ["--plugin-dir", profileDir(name!), ...rest]; }
  else { die(`不认识的 CLI：${cli}（支持 omp | claude）`); return; }
  const exe = resolveExecutable(cmd);
  let r;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(exe)) {
    // .cmd/.bat 必须经 cmd.exe：自行拼接并转义，windowsVerbatimArguments 防止二次加引号
    const line = [exe, ...args].map(winQuote).join(" ");
    r = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], { stdio: "inherit", windowsVerbatimArguments: true });
  } else {
    r = spawnSync(exe, args, { stdio: "inherit" });
  }
  process.exit(r.status ?? 1);
}

function die(msg: string): never { console.error(msg); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "list": cmdList(); break;
  case "profiles": cmdProfiles(); break;
  case "new": cmdNew(rest[0]); break;
  case "add": cmdAdd(rest[0], rest.slice(1)); break;
  case "rm": cmdRm(rest[0], rest.slice(1)); break;
  case "sync": rest[0] ? console.log(`${rest[0]}：现共 ${sync(rest[0])} 个技能`) : die("用法：sk sync <profile>"); break;
  case "restore": cmdRestore(rest[0]); break;
  case "run": cmdRun(rest[0], rest[1], rest.slice(2)); break;
  case "version": case "--version": console.log(SK_VERSION); break;
  default:
    console.log(`sk — skills profile 管理与启动（v${SK_VERSION}）
  sk list                       库存清单（含同名冲突标记）
  sk profiles                   已有 profile 一览
  sk new <profile>              新建空 profile
  sk add <profile> <模式...>    加技能（glob 或 @组名，如 sk add 写作 grilling '@bmad'）
  sk rm <profile> <模式...>     移除技能（同样支持 glob 与 @组名）
  sk sync <profile>             重新生成派生文件、清理失效链接
  sk restore <profile>          按 manifest 重建链接（新 clone 后用）
  sk run <profile> omp|claude [参数...]   按 profile 启动 session
  sk version                    版本
技能库根：SK_ROOT 环境变量，或从 sk 所在位置向上查找 plugins/、vendor/。`);
}
