#!/usr/bin/env node
// sk — skills profile 管理与启动薄层（提案：desk/提案/2026-08-26-Skills管理工具.md）
// profile = profiles/<名>/ 文件夹：skills/ 内是指回库的 junction，文件夹即配置。
// plugin.json / overlay.yml / manifest.json 均由 sync 派生，勿手改。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROFILES = path.join(ROOT, "profiles");
// 库的扫描根：<根>/<组>/skills/<技能>/SKILL.md
const SCAN_ROOTS = [path.join(ROOT, "plugins"), path.join(ROOT, "vendor")];

function listGroups() {
  const groups = [];
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

function frontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = {};
  if (m) {
    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const kv = lines[i].match(/^(\w[\w-]*):\s*(.*)$/);
      if (!kv) continue;
      let val = kv[2].trim();
      if (val === "" || /^[>|][+-]?$/.test(val)) { // 块标量：收接下来的缩进行
        const parts = [];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
        val = parts.join(" ");
      }
      fm[kv[1]] = val;
    }
  }
  return fm;
}

function inventory() {
  const skills = [];
  for (const { group, dir } of listGroups()) {
    for (const s of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!s.isDirectory()) continue;
      const skillMd = path.join(dir, s.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      skills.push({ name: s.name, group, dir: path.join(dir, s.name), desc: frontmatter(skillMd).description ?? "" });
    }
  }
  return skills;
}

function globToRe(pattern) {
  return new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
}

// 模式：@组名 → 整组；否则按技能名 glob（* ? 通配）
function matchSkills(patterns) {
  const inv = inventory();
  const picked = new Map();
  for (const p of patterns) {
    let hits;
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

function profileDir(name) { return path.join(PROFILES, name); }
function skillsDirOf(name) { return path.join(profileDir(name), "skills"); }

function profileSkills(name) {
  const dir = skillsDirOf(name);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() || d.isSymbolicLink())
    .map(d => {
      const link = path.join(dir, d.name);
      let target = null, alive = false;
      try { target = fs.readlinkSync(link); alive = fs.existsSync(path.join(link, "SKILL.md")); } catch { /* 非链接目录 */ alive = fs.existsSync(path.join(link, "SKILL.md")); }
      return { name: d.name, link, target, alive };
    });
}

function sync(name) {
  const dir = profileDir(name);
  if (!fs.existsSync(dir)) die(`profile 不存在：${name}`);
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.mkdirSync(skillsDirOf(name), { recursive: true });
  const entries = profileSkills(name);
  for (const e of entries.filter(e => !e.alive)) {
    fs.rmdirSync(e.link); // junction：只摘链接，不碰目标
    console.log(`已清除失效链接：${name}/${e.name}`);
  }
  const live = entries.filter(e => e.alive);
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

function cmdNew(name) {
  if (!name) die("用法：sk new <profile>");
  if (fs.existsSync(profileDir(name))) die(`已存在：${name}`);
  fs.mkdirSync(skillsDirOf(name), { recursive: true });
  sync(name);
  console.log(`已创建 profile：${name}`);
}

function cmdAdd(name, patterns) {
  if (!name || patterns.length === 0) die("用法：sk add <profile> <模式...>（技能名 glob 或 @组名）");
  if (!fs.existsSync(profileDir(name))) cmdNew(name);
  const existing = new Set(profileSkills(name).map(e => e.name));
  let added = 0;
  for (const s of matchSkills(patterns)) {
    if (existing.has(s.name)) continue;
    fs.symlinkSync(s.dir, path.join(skillsDirOf(name), s.name), "junction");
    added++;
  }
  const total = sync(name);
  console.log(`${name}：新增 ${added}，现共 ${total} 个技能`);
}

function cmdRm(name, patterns) {
  if (!name || patterns.length === 0) die("用法：sk rm <profile> <模式...>");
  let removed = 0;
  for (const e of profileSkills(name)) {
    if (patterns.some(p => p.startsWith("@") ? false : globToRe(p).test(e.name))) {
      fs.rmdirSync(e.link); // junction：只摘链接，不碰目标
      removed++;
    }
  }
  const total = sync(name);
  console.log(`${name}：移除 ${removed}，现共 ${total} 个技能`);
}

function cmdRestore(name) {
  const mf = path.join(profileDir(name), "manifest.json");
  if (!fs.existsSync(mf)) die(`无 manifest：${name}`);
  const { skills } = JSON.parse(fs.readFileSync(mf, "utf8"));
  fs.mkdirSync(skillsDirOf(name), { recursive: true });
  for (const s of skills) {
    const link = path.join(skillsDirOf(name), s.name);
    if (!fs.existsSync(link)) fs.symlinkSync(path.join(ROOT, s.target), link, "junction");
  }
  console.log(`${name}：已按 manifest 重建，共 ${sync(name)} 个技能`);
}

function cmdList() {
  const inv = inventory();
  const byName = new Map();
  for (const s of inv) (byName.get(s.name) ?? byName.set(s.name, []).get(s.name)).push(s);
  for (const s of inv.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))) {
    const dup = byName.get(s.name).length > 1 ? "  ⚠ 同名冲突" : "";
    console.log(`${s.group.padEnd(24)} ${s.name.padEnd(40)} ${s.desc.slice(0, 60)}${dup}`);
  }
  console.log(`\n共 ${inv.length} 个技能，${listGroups().length} 个组（@组名 可整组引用）`);
}

function cmdProfiles() {
  if (!fs.existsSync(PROFILES)) return console.log("（还没有 profile）");
  for (const d of fs.readdirSync(PROFILES, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const entries = profileSkills(d.name);
    const dead = entries.filter(e => !e.alive).length;
    console.log(`${d.name.padEnd(20)} ${entries.length} 个技能${dead ? `（${dead} 个链接失效，跑 sk sync ${d.name}）` : ""}`);
  }
}

function cmdRun(name, cli, rest) {
  if (!name || !cli) die("用法：sk run <profile> <omp|claude> [参数...]");
  if (!fs.existsSync(profileDir(name))) die(`profile 不存在：${name}（sk profiles 查看）`);
  sync(name);
  let cmd, args;
  if (cli === "omp") { cmd = "omp"; args = ["--config", path.join(profileDir(name), "overlay.yml"), ...rest]; }
  else if (cli === "claude") { cmd = "claude"; args = ["--plugin-dir", profileDir(name), ...rest]; }
  else die(`不认识的 CLI：${cli}（支持 omp | claude）`);
  const q = s => /[\s"]/.test(s) ? `"${s.replaceAll('"', '\\"')}"` : s;
  const r = spawnSync([cmd, ...args].map(q).join(" "), { stdio: "inherit", shell: true });
  process.exit(r.status ?? 1);
}

function die(msg) { console.error(msg); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "list": cmdList(); break;
  case "profiles": cmdProfiles(); break;
  case "new": cmdNew(rest[0]); break;
  case "add": cmdAdd(rest[0], rest.slice(1)); break;
  case "rm": cmdRm(rest[0], rest.slice(1)); break;
  case "sync": rest[0] ? sync(rest[0]) && console.log("ok") : die("用法：sk sync <profile>"); break;
  case "restore": cmdRestore(rest[0]); break;
  case "run": cmdRun(rest[0], rest[1], rest.slice(2)); break;
  default:
    console.log(`sk — skills profile 管理与启动
  sk list                       库存清单（含同名冲突标记）
  sk profiles                   已有 profile 一览
  sk new <profile>              新建空 profile
  sk add <profile> <模式...>    加技能（glob 或 @组名，如 sk add 写作 grilling '@bmad'）
  sk rm <profile> <模式...>     移除技能
  sk sync <profile>             重新生成派生文件、清理失效链接
  sk restore <profile>          按 manifest 重建链接（新 clone 后用）
  sk run <profile> omp|claude [参数...]   按 profile 启动 session`);
}
