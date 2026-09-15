// 把 claude plugin eval 的结果 JSON 里的本机路径抹掉，再提交进仓。
// 运行：node plugins/skill-authoring/skills/skill-authoring/scripts/scrub-eval-results.ts <结果目录>
// 只改 *.json：家目录（C:\Users\<名>、/Users/<名>、/home/<名>）→ <home>，仓库根（含 worktree）→ <repo>。
// 公共面门禁扫最终 tree，家目录路径是它拦的一类（见 docs/adr/0002）。
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const target = process.argv[2];
if (!target) {
  console.error('用法：node scrub-eval-results.ts <结果目录>');
  process.exit(2);
}

/** 把一个绝对路径变成能同时匹配正斜杠、反斜杠和 JSON 转义反斜杠的正则 */
function pathPattern(p: string): RegExp {
  const escaped = p
    .replace(/\\/gu, '/')
    .replace(/[.*+?^${}()|[\]]/gu, '\\$&')
    .replace(/\//gu, '(?:\\/|\\\\\\\\|\\\\)');
  return new RegExp(escaped, 'giu');
}

const home = homedir();
let repoRoot = '';
try {
  repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
} catch {
  repoRoot = '';
}

const patterns: Array<[RegExp, string]> = [];
if (repoRoot) patterns.push([pathPattern(repoRoot), '<repo>']);
patterns.push([pathPattern(home), '<home>']);
// 家目录的通用形态（其他机器上跑出来的结果也能抹）
patterns.push([/[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\\\/"]+/gu, '<home>']);
patterns.push([/\/(?:Users|home)\/[^\/"]+/gu, '<home>']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(resolve(target))) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [re, rep] of patterns) after = after.replace(re, rep);
  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
  }
}
console.log(`已抹去本机路径：${changed} 个文件`);
