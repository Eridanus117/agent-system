// skill 仓储的全部机械检查（2026-09-02 旧治理退库后只剩这一条）。
// 运行：node plugins/tests/skills.test.ts
// 检查五样：
//   1. plugins/<plugin>/.claude-plugin/plugin.json 存在，name 与目录一致，skills 指向 ./skills/
//   2. plugins/<plugin>/skills/<skill>/SKILL.md 存在，frontmatter 的 name 与目录一致，description 非空且 ≤ 1000 UTF-8 字节
//   3. skill 名跨 plugin 不重复
//   4. .claude-plugin/marketplace.json 里每个 plugin 的 version 与 plugin.json 一致
//   5. docs/skills-overview.md 与 scripts/skills-overview.ts 的渲染结果一致（目录页没漂）
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
  }
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

console.log(`PASS: ${plugins.length} 个 Plugin、${seen.size} 个 Skill，目录页一致`);

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
