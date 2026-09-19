// 把 claude plugin eval 的结果 JSON 里家目录路径中的本机用户名换成 `<user>`，再提交进仓。
// 运行：node plugins/skill-authoring/skills/skill-authoring/scripts/scrub-eval-results.ts <结果目录>
// 只改 *.json，只动用户名那一段，其余字节不动（占位约定见 docs/adr/0003）。
// 覆盖的写法：C:\Users\<名>、C:\\Users\\<名>（JSON 转义）、C:\\\\Users\\\\<名>（执行记录当字符串再嵌进 JSON 的双重转义）、
// C:/Users/<名>、/Users/<名>、/home/<名>、/mnt/c/Users/<名>，以及 Claude Code 把工作目录压成的 slug C--Users-<名>-…。
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('用法：node scrub-eval-results.ts <结果目录>');
  process.exit(2);
}

const patterns: Array<[RegExp, string]> = [
  // 盘符:\Users\<名>、盘符:\\Users\\<名>、盘符:\\\\Users\\\\<名>（执行记录当字符串再嵌进 JSON 的双重转义）、盘符:/Users/<名>；分隔符原样保留
  [/([A-Za-z]:)(\\\\\\\\|\\\\|\\|\/)(Users)(\\\\\\\\|\\\\|\\|\/)(?!<user>)[^\\\/"'\s]+/gu, '$1$2$3$4<user>'],
  // /Users/<名>、/home/<名>、/mnt/<盘符>/Users/<名>
  [/(\/(?:Users|home)\/)(?!<user>)[^\/"'\s]+/gu, '$1<user>'],
  [/(\/mnt\/[a-z]\/Users\/)(?!<user>)[^\/"'\s]+/gu, '$1<user>'],
  // Claude Code 把工作目录路径压成的 slug：C--Users-<名>-AppData-…（执行记录 init 行的 memory_paths 里有）
  [/([A-Za-z]--Users-)(?!<user>)[^-"'\s\\\/]+/gu, '$1<user>'],
];

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
console.log(`已把用户名换成 <user>：${changed} 个文件`);
