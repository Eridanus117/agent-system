// skill 仓储的全部机械检查（2026-09-02 旧治理退库后只剩这一条）。
// 运行：node plugins/tests/skills.test.ts
// 检查八样：
//   1. plugins/<plugin>/.claude-plugin/plugin.json 存在，name 与目录一致，skills 指向 ./skills/
//   2. plugins/<plugin>/skills/<skill>/SKILL.md 存在，frontmatter 的 name 与目录一致，description 非空且 ≤ 1000 UTF-8 字节
//   3. skill 名跨 plugin 不重复
//   4. .claude-plugin/marketplace.json 里每个 plugin 的 version 与 plugin.json 一致
//   5. docs/skills-overview.md 与 scripts/skills-overview.ts 的渲染结果一致（目录页没漂）
//   6. 所有 SKILL.md 与词汇表 plugins/CONTEXT.md 不含「自造」标记（ADR-0006：术语只用有出处的业界词）
//   7. 词汇表每个词条标题带英文原词与出处
//   8. 所有 SKILL.md 与词汇表不出现 ADR-0006 换掉的旧词（agent-system#123 收口后旧名别名已删，旧词零出现）
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSkillsOverview } from '../scripts/skills-overview.ts';

const pluginsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(pluginsRoot, '..');
const read = (path: string): string => readFileSync(path, 'utf8').replace(/^﻿/u, '').replace(/\r\n/gu, '\n');
const dirs = (path: string): string[] =>
  readdirSync(path).filter((entry) => statSync(join(path, entry)).isDirectory());

const MAX_DESCRIPTION_BYTES = 1000;
/**
 * ADR-0006 换掉的旧词（替换表见 agent-system#115 实现决定第 2 条），收口票 agent-system#123 之后在 SKILL.md 与词汇表里零出现。
 * 多字旧词按原样子串判；单字旧词「段」「步」只判旧用法的固定搭配（第 N 段、段的门、可选步……），
 * 放过「阶段」「活动」「步骤」「第 3 步」「一段旧代码」这类含同一个字的新词与平语。
 */
const RETIRED_TERMS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: '来往', pattern: /来往/u },
  { label: '要答案', pattern: /要答案/u },
  { label: '小改动', pattern: /小改动/u },
  { label: '改动落地', pattern: /改动落地/u },
  { label: '停靠记录', pattern: /停靠记录/u },
  { label: '硬问题', pattern: /硬问题/u },
  { label: '上线待办', pattern: /上线待办/u },
  { label: '焦点', pattern: /焦点/u },
  { label: '领域分支', pattern: /领域分支/u },
  { label: '手动调用', pattern: /手动调用/u },
  { label: '自动调用', pattern: /自动调用/u },
  { label: '可选步', pattern: /可选步/u },
  { label: '段（第 N 段）', pattern: /第s*[0-9０-９一二三四五六七八九十N]+s*段(?!落)/u },
  { label: '段（起始段、段的门、段里……）', pattern: /(?<!阶)(起始段|进段|哪段|各段|每段|九段|段的门|段里|段结果|段号)/u },
  { label: '步（点名的步、薄步……）', pattern: /点名的步|条步|薄步|步的门|开哪些步/u },
];
const seen = new Map<string, string>();
const plugins = dirs(pluginsRoot).filter((entry) => existsSync(join(pluginsRoot, entry, '.claude-plugin', 'plugin.json')));
assert.ok(plugins.length > 0, '没有任何 plugin');

for (const plugin of plugins) {
  const manifest = JSON.parse(read(join(pluginsRoot, plugin, '.claude-plugin', 'plugin.json')));
  assert.equal(manifest.name, plugin, `${plugin}: plugin.json 的 name 与目录名不一致`);
  assert.equal(manifest.skills, './skills/', `${plugin}: plugin.json 必须从 ./skills/ 发现 Skill`);
  assert.match(String(manifest.version ?? ''), /^\d+\.\d+\.\d+$/u, `${plugin}: version 须为 x.y.z`);
  const skillsRoot = join(pluginsRoot, plugin, 'skills');
  assert.ok(existsSync(skillsRoot), `${plugin}: 缺少 skills/`);
  for (const skill of dirs(skillsRoot)) {
    const skillPath = join(skillsRoot, skill, 'SKILL.md');
    assert.ok(existsSync(skillPath), `${skill}: 缺少 SKILL.md`);
    assert.ok(!seen.has(skill), `${skill}: Skill 名跨 Plugin 重复（${seen.get(skill)} 与 ${plugin}）`);
    seen.set(skill, plugin);
    const body = read(skillPath);
    assert.ok(body.startsWith('---\n'), `${skill}: 缺少 frontmatter`);
    const end = body.indexOf('\n---\n', 4);
    assert.ok(end > 0, `${skill}: frontmatter 未闭合`);
    const frontmatter = body.slice(4, end);
    assert.equal(/^name:\s*(\S+)\s*$/mu.exec(frontmatter)?.[1], skill, `${skill}: name 与目录名不一致`);
    const description = readDescription(frontmatter);
    assert.ok(description.length > 0, `${skill}: description 为空`);
    assert.ok(
      Buffer.byteLength(description, 'utf8') <= MAX_DESCRIPTION_BYTES,
      `${skill}: description 超过 ${MAX_DESCRIPTION_BYTES} UTF-8 字节（Codex 侧目录会截断）`,
    );
    assertNoCoinedMarker(body, `${skill}/SKILL.md`);
    assertNoRetiredTerm(body, `${skill}/SKILL.md`);
  }
}

// 词汇表：不含「自造」标记，每个词条标题带英文原词与出处
const glossaryPath = join(pluginsRoot, 'CONTEXT.md');
const glossary = read(glossaryPath);
assertNoCoinedMarker(glossary, 'plugins/CONTEXT.md');
assertNoRetiredTerm(glossary, 'plugins/CONTEXT.md');
// 词条是行首 `**` 的行；先剥掉 fenced code block，表头里的模板行不算词条
const glossaryEntries = glossary
  .replace(/^```[\s\S]*?^```[ \t]*$/gmu, '')
  .split('\n')
  .filter((line) => line.startsWith('**'));
assert.ok(glossaryEntries.length > 0, 'plugins/CONTEXT.md: 没有任何词条');
for (const line of glossaryEntries) {
  // 括号取到行尾最后一个「）」，出处里可以嵌套全角括号
  const m = /^\*\*[^*]+\*\*（(.+)）:\s*$/u.exec(line);
  if (!m) {
    assert.fail(`plugins/CONTEXT.md 词条形状不对，应为 **中文**（English；出处：…）: —— ${line}`);
    continue;
  }
  const [english, source] = m[1].split('；');
  assert.ok(
    english !== undefined && /[A-Za-z]{2,}/u.test(english) && !/[一-鿿]/u.test(english),
    `plugins/CONTEXT.md 词条缺英文原词 —— ${line}`,
  );
  assert.ok(source !== undefined && /^出处：\S/u.test(source), `plugins/CONTEXT.md 词条缺出处 —— ${line}`);
}

// marketplace 与 plugin.json 的版本一致
const marketplace = JSON.parse(read(join(repositoryRoot, '.claude-plugin', 'marketplace.json')));
for (const entry of marketplace.plugins as Array<{ name: string; version: string; source: string }>) {
  const manifestPath = join(repositoryRoot, entry.source, '.claude-plugin', 'plugin.json');
  assert.ok(existsSync(manifestPath), `marketplace ${entry.name}: source 指向的 plugin 不存在`);
  const manifest = JSON.parse(read(manifestPath));
  assert.equal(entry.version, manifest.version, `marketplace ${entry.name}: 版本与 plugin.json 漂移`);
}

// 目录页没漂
const overviewPath = join(pluginsRoot, 'docs', 'skills-overview.md');
assert.ok(existsSync(overviewPath), 'docs/skills-overview.md 不存在——运行 node plugins/scripts/skills-overview.ts --write');
assert.equal(read(overviewPath), renderSkillsOverview(), 'skills-overview 生成物与来源不一致——运行 node plugins/scripts/skills-overview.ts --write');

console.log(`PASS: ${plugins.length} 个 Plugin、${seen.size} 个 Skill，目录页一致，词汇表 ${glossaryEntries.length} 条带英文与出处，旧词零出现`);

/**
 * 「自造」标记指给术语打的标签写法：`（xxx，自造）` 或 `标「自造」`。
 * 正文里当普通词用的「自造词」「不擅自造」不算标记，不拦。
 */
function assertNoCoinedMarker(body: string, label: string): void {
  const m = /，\s*自造\s*）|「自造」/u.exec(body);
  assert.ok(!m, `${label}: 出现「自造」标记（${m?.[0]}）——术语只用有出处的业界词，查不到出处就用平语句子`);
}

function assertNoRetiredTerm(body: string, label: string): void {
  for (const { label: term, pattern } of RETIRED_TERMS) {
    const m = pattern.exec(body);
    assert.ok(!m, `${label}: 出现旧词「${term}」（${m?.[0]}）——按 plugins/CONTEXT.md 换成业界词`);
  }
}

/** description 可能是单行，也可能是 `>-` 折叠多行 */
function readDescription(frontmatter: string): string {
  const lines = frontmatter.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^description:\s*(.*)$/u.exec(lines[i]);
    if (!m) continue;
    if (/^(>-?|\|)$/u.test(m[1].trim())) {
      const parts: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/u.test(lines[i + 1])) parts.push(lines[++i].trim());
      return parts.join(' ');
    }
    return m[1].trim();
  }
  return '';
}
