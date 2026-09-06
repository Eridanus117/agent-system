#!/usr/bin/env bun
// sk — skills profile 管理与启动薄层（提案：desk/提案/2026-08-26-Skills管理工具.md）
// profile 的 manifest.json 是唯一声明；只有 new/add/rm 显式修改它。
// skills/ junction、plugin.json 与 overlay.yml 都由声明派生；sync 不从投影反写声明。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { SK_VERSION } from "./version.ts";

interface Skill { name: string; group: string; dir: string; desc: string; }
interface ProfileEntry extends ManifestSkill { alive: boolean; desc: string; }
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

function insideLibrary(target: string): boolean {
  const rel = path.relative(ROOT, target);
  return !!rel && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function validateManifest(name: string, manifest: unknown): ManifestSkill[] {
  const mf = path.join(profileDir(name), "manifest.json");
  if (!manifest || typeof manifest !== "object" || !("skills" in manifest) || !Array.isArray(manifest.skills)) {
    die(`无效 skill 声明：${mf} 必须包含 skills 数组`);
  }
  const names = new Set<string>();
  for (const [index, skill] of manifest.skills.entries()) {
    if (!skill || typeof skill !== "object"
      || typeof skill.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(skill.name)
      || skill.name.endsWith(".")
      || process.platform === "win32" && /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(skill.name)
      || typeof skill.target !== "string" || !skill.target.trim() || path.isAbsolute(skill.target)) {
      die(`无效 skill 声明：${mf} 的 skills[${index}] 需要合法单段 name 与相对目录 target`);
    }
    const key = process.platform === "win32" ? skill.name.toLowerCase() : skill.name;
    if (names.has(key)) die(`重复 skill 名：${mf} 的 ${skill.name}`);
    names.add(key);
    if (!insideLibrary(path.resolve(ROOT, skill.target))) {
      die(`无效 skill 目标：${mf} 的 ${skill.name} 超出技能库：${skill.target}`);
    }
  }
  return manifest.skills;
}

function readManifest(name: string): ManifestSkill[] {
  const mf = path.join(profileDir(name), "manifest.json");
  let manifest: unknown;
  try { manifest = JSON.parse(fs.readFileSync(mf, "utf8")); }
  catch (cause) { die(`无法读取 skill 声明：${mf}：${cause}`); }
  return validateManifest(name, manifest);
}

function profileSkills(name: string): ProfileEntry[] {
  return readManifest(name).map(skill => {
    const link = path.join(skillsDirOf(name), skill.name);
    let alive = false;
    let desc = "";
    try {
      const target = fs.realpathSync(path.resolve(ROOT, skill.target));
      if (insideLibrary(target) && path.basename(target) === skill.name && fs.lstatSync(link).isSymbolicLink()
        && fs.realpathSync(link) === target && fs.statSync(path.join(target, "SKILL.md")).isFile()) {
        const info = frontmatter(path.join(target, "SKILL.md"));
        alive = info["name"] === skill.name;
        desc = info["description"] ?? "";
      }
    } catch { /* 缺失、断链或目标不可读，都保留声明并展示为投影不一致。 */ }
    return { ...skill, alive, desc };
  });
}

function undeclaredSkills(name: string, declared: Iterable<string>): string[] {
  const names = new Set([...declared].map(n => process.platform === "win32" ? n.toLowerCase() : n));
  const dir = skillsDirOf(name);
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(n => !names.has(process.platform === "win32" ? n.toLowerCase() : n))
    : [];
}

/** 写入前一次性核实全部声明目标和受管槽位；不能装到一半才发现坏目标或实体目录。 */
function resolveTargets(name: string, skills: ManifestSkill[]): Map<string, string> {
  const targets = new Map<string, string>();
  for (const skill of skills) {
    let target: string;
    try {
      target = fs.realpathSync(path.resolve(ROOT, skill.target));
      if (!insideLibrary(target) || !fs.statSync(target).isDirectory() || !fs.statSync(path.join(target, "SKILL.md")).isFile()) {
        throw new Error("目标必须是技能库内包含 SKILL.md 的目录");
      }
      const sourceName = frontmatter(path.join(target, "SKILL.md"))["name"];
      if (path.basename(target) !== skill.name || sourceName !== skill.name) {
        throw new Error(`声明名 ${skill.name} 与源目录或 SKILL.md name 不一致（源 name：${sourceName ?? "缺失"}）`);
      }
    } catch (cause) {
      die(`失效 skill 目标：${path.join(profileDir(name), "manifest.json")} 的 ${skill.name} -> ${skill.target}：${cause}`);
    }
    const link = path.join(skillsDirOf(name), skill.name);
    const entry = fs.lstatSync(link, { throwIfNoEntry: false });
    if (entry && !entry.isSymbolicLink()) die(`拒绝替换实体路径：${link}；请先移走其内容，sk 不删除实体目录`);
    targets.set(skill.name, target);
  }
  return targets;
}

// 仅 new/add/rm 调用；调用者先校验完整的新声明，再提交声明并修复投影。
function writeManifest(name: string, skills: ManifestSkill[]): void {
  const dir = profileDir(name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ skills }, null, 2) + "\n");
}

function sync(name: string, targets = resolveTargets(name, readManifest(name))): number {
  const dir = profileDir(name);
  fs.mkdirSync(skillsDirOf(name), { recursive: true });
  for (const [skill, target] of targets) {
    const link = path.join(skillsDirOf(name), skill);
    let same = false;
    try { same = fs.lstatSync(link).isSymbolicLink() && fs.realpathSync(link) === target; } catch { /* 缺链待重建。 */ }
    if (same) continue;
    if (fs.lstatSync(link, { throwIfNoEntry: false })) removeLink(link);
    fs.symlinkSync(target, link, "junction");
  }
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({
    name, version: "0.0.0", description: `skills profile: ${name}（sk 生成，勿手改）`,
  }, null, 2) + "\n");
  const skillsPath = skillsDirOf(name).replaceAll("\\", "/");
  fs.writeFileSync(path.join(dir, "overlay.yml"), `# sk 生成，勿手改（机器相关的绝对路径，不入 git）\nskills:\n  customDirectories:\n    - ${skillsPath}\n`);
  for (const skill of undeclaredSkills(name, targets.keys())) {
    console.log(`未接入：${path.join(skillsDirOf(name), skill)} 不在 manifest 声明中（保留，也未授权）`);
  }
  return targets.size;
}

function cmdNew(name: string | undefined): void {
  if (!name) die("用法：sk new <profile>");
  if (fs.existsSync(profileDir(name))) die(`已存在：${name}`);
  writeManifest(name, []);
  sync(name);
  console.log(`已创建 profile：${name}`);
}

function cmdAdd(name: string | undefined, patterns: string[]): void {
  if (!name || patterns.length === 0) die("用法：sk add <profile> <模式...>（技能名 glob 或 @组名）");
  const skills = fs.existsSync(profileDir(name)) ? readManifest(name) : [];
  let added = 0;
  for (const skill of matchSkills(patterns)) {
    const target = path.relative(ROOT, fs.realpathSync(skill.dir)).replaceAll("\\", "/");
    const existing = skills.find(s => process.platform === "win32"
      ? s.name.toLowerCase() === skill.name.toLowerCase() : s.name === skill.name);
    if (existing) {
      if (path.resolve(ROOT, existing.target) !== path.resolve(ROOT, target)) {
        die(`同名冲突：${skill.name}\n  已声明 ${existing.target}\n  待添加 ${target}\n请先显式 sk rm 再选择新目标。`);
      }
      continue;
    }
    skills.push({ name: skill.name, target });
    added++;
  }
  validateManifest(name, { skills });
  const targets = resolveTargets(name, skills);
  if (added) writeManifest(name, skills);
  const total = sync(name, targets);
  console.log(`${name}：新增 ${added}，现共声明 ${total} 个技能`);
}

function cmdRm(name: string | undefined, patterns: string[]): void {
  if (!name || patterns.length === 0) die("用法：sk rm <profile> <模式...>（技能名 glob 或 @组名）");
  const skills = readManifest(name);
  const removed = skills.filter(skill => patterns.some(p => p.startsWith("@")
    ? skill.target.split(/[\\/]/)[1] === p.slice(1) : globToRe(p).test(skill.name)));
  if (removed.length === 0) die(`模式未匹配任何技能：${patterns.join(" ")}（sk profiles / sk list 查看）`);
  const selected = new Set(removed.map(skill => skill.name));
  const remaining = skills.filter(skill => !selected.has(skill.name));
  const targets = resolveTargets(name, remaining);
  for (const skill of removed) {
    const link = path.join(skillsDirOf(name), skill.name);
    const entry = fs.lstatSync(link, { throwIfNoEntry: false });
    if (entry && !entry.isSymbolicLink()) die(`拒绝移除实体路径：${link}；sk 只摘受管链接，不删除实体内容`);
  }
  writeManifest(name, remaining);
  for (const skill of removed) {
    const link = path.join(skillsDirOf(name), skill.name);
    if (fs.lstatSync(link, { throwIfNoEntry: false })) removeLink(link);
  }
  const total = sync(name, targets);
  console.log(`${name}：移除 ${removed.length}，现共声明 ${total} 个技能`);
}

function cmdRestore(name: string | undefined): void {
  if (!name) die("用法：sk restore <profile>");
  console.log(`${name}：已按 manifest 重建，共 ${sync(name)} 个技能`);
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

// 只读展示声明与投影健康度；部分缺链和全部缺链都不会减少声明计数。
function cmdShow(name: string | undefined): void {
  if (!name) die("用法：sk show <profile>");
  if (!fs.existsSync(profileDir(name))) die(`profile 不存在：${name}（sk profiles 查看）`);
  const entries = profileSkills(name);
  const rows = entries.map(e => ({ e, group: e.target.split(/[\\/]/)[1] ?? "?" }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.e.name.localeCompare(b.e.name));
  for (const { e, group } of rows) {
    const info = e.alive
      ? e.desc.slice(0, 60)
      : `投影缺失或目标不一致：${e.target}（sk sync ${name} 修复）`;
    console.log(`${group.padEnd(24)} ${e.name.padEnd(40)} ${info}`);
  }
  for (const skill of undeclaredSkills(name, entries.map(e => e.name))) {
    console.log(`未接入：${skill}（不计入声明，也未授权）`);
  }
  if (entries.length === 0) console.log(`${name}：（空 profile，sk add ${name} <模式...> 加技能）`);
  else {
    const missing = entries.filter(e => !e.alive).length;
    console.log(`\n共声明 ${entries.length} 个技能${missing ? `（${missing} 个投影缺失或目标不一致）` : ""}`);
  }
}

function cmdProfiles(): void {
  if (!fs.existsSync(PROFILES)) { console.log("（还没有 profile）"); return; }
  for (const d of fs.readdirSync(PROFILES, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (!fs.existsSync(path.join(profileDir(d.name), "manifest.json"))) {
      console.log(`未接入：${d.name} 缺少 manifest 声明（不视为已登记 profile）`);
      continue;
    }
    const entries = profileSkills(d.name);
    const missing = entries.filter(e => !e.alive).length;
    const extra = undeclaredSkills(d.name, entries.map(e => e.name)).length;
    console.log(`${d.name.padEnd(20)} 声明 ${entries.length} 个技能${missing ? `（${missing} 个投影不一致，跑 sk sync ${d.name}）` : ""}${extra ? `（${extra} 个未接入项）` : ""}`);
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
  if (cli !== "omp" && cli !== "claude") die(`不认识的 CLI：${cli}（支持 omp | claude）`);
  if (!fs.existsSync(profileDir(name))) die(`profile 不存在：${name}（sk profiles 查看）`);
  const targets = resolveTargets(name, readManifest(name));
  const extra = undeclaredSkills(name, targets.keys());
  if (extra.length) die(`拒绝装载未接入技能：${extra.join("、")}；不在 ${name} 的 manifest 声明中，请先确认并处理，sk 不删除它们。`);
  sync(name, targets);
  let cmd: string, args: string[];
  if (cli === "omp") { cmd = "omp"; args = ["--config", path.join(profileDir(name), "overlay.yml"), ...rest]; }
  else { cmd = "claude"; args = ["--plugin-dir", profileDir(name), ...rest]; }
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
  case "show": cmdShow(rest[0]); break;
  case "new": cmdNew(rest[0]); break;
  case "add": cmdAdd(rest[0], rest.slice(1)); break;
  case "rm": cmdRm(rest[0], rest.slice(1)); break;
  case "sync": rest[0] ? console.log(`${rest[0]}：现共声明 ${sync(rest[0])} 个技能`) : die("用法：sk sync <profile>"); break;
  case "restore": cmdRestore(rest[0]); break;
  case "run": cmdRun(rest[0], rest[1], rest.slice(2)); break;
  case "version": case "--version": console.log(SK_VERSION); break;
  default:
    console.log(`sk — skills profile 管理与启动（v${SK_VERSION}）
  sk list                       库存清单（含同名冲突标记）
  sk profiles                   已有 profile 一览
  sk show <profile>             查看声明、技能描述与投影健康度
  sk new <profile>              新建空 profile
  sk add <profile> <模式...>    加技能（glob 或 @组名，如 sk add 写作 grilling '@openspec'）
  sk rm <profile> <模式...>     移除技能（同样支持 glob 与 @组名）
  sk sync <profile>             按声明修复投影、重生成派生文件（不反写声明）
  sk restore <profile>          按 manifest 重建链接（新 clone 后用）
  sk run <profile> omp|claude [参数...]   按 profile 启动 session
  sk version                    版本
技能库根：SK_ROOT 环境变量，或从 sk 所在位置向上查找 plugins/、vendor/。`);
}
