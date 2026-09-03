// skill 仓储的目录页生成器（2026-09-02 旧治理退库后的精简版）。
// 运行：node plugins/scripts/skills-overview.ts --write
// 全部内容从 plugins/<plugin>/skills/<skill>/SKILL.md 与 plugin.json 推出：
// 名称、所属 plugin 与版本、description、L2 体积（SKILL.md 字节数）、有无 evals。
// 没有任何手写字段，所以它不可能与来源漂移；tests/skills.test.ts 逐字节比对它。
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(path, 'utf8').replace(/^﻿/u, '').replace(/\r\n/gu, '\n');
const dirs = (path: string): string[] =>
  readdirSync(path).filter((entry) => statSync(join(path, entry)).isDirectory());

type Row = { skill: string; plugin: string; version: string; description: string; l2Bytes: number; evals: boolean };

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

function collect(): Row[] {
  const rows: Row[] = [];
  for (const plugin of dirs(pluginsRoot)) {
    const manifestPath = join(pluginsRoot, plugin, '.claude-plugin', 'plugin.json');
    if (!existsSync(manifestPath)) continue;
    const version = String(JSON.parse(read(manifestPath)).version ?? '');
    const skillsRoot = join(pluginsRoot, plugin, 'skills');
    if (!existsSync(skillsRoot)) continue;
    for (const skill of dirs(skillsRoot)) {
      const skillPath = join(skillsRoot, skill, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      const body = read(skillPath);
      const end = body.indexOf('\n---\n', 4);
      const description = end > 0 ? readDescription(body.slice(4, end)) : '';
      rows.push({
        skill,
        plugin,
        version,
        description,
        l2Bytes: Buffer.byteLength(body, 'utf8'),
        evals: existsSync(join(skillsRoot, skill, 'evals', 'evals.json')),
      });
    }
  }
  return rows.sort((a, b) => (a.plugin === b.plugin ? a.skill.localeCompare(b.skill) : a.plugin.localeCompare(b.plugin)));
}

export function renderSkillsOverview(): string {
  const rows = collect();
  const lines: string[] = [
    '<!-- 生成产物：node plugins/scripts/skills-overview.ts --write。不要手改；tests/skills.test.ts 逐字节比对。 -->',
    '',
    '# Skill 目录页',
    '',
    '一个 skill 一个目录：`plugins/<plugin>/skills/<skill>/SKILL.md`，旁边可放 `evals/evals.json`。装配用 `sk`（源码 `packages/sk`；profile 即文件夹里的 junction）。',
    '',
    `共 ${rows.length} 个 Skill，${new Set(rows.map((r) => r.plugin)).size} 个 Plugin。`,
    '',
    '| Skill | Plugin | 版本 | L2 字节 | evals | description |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const desc = r.description.replace(/\|/gu, '\\|');
    lines.push(`| \`${r.skill}\` | ${r.plugin} | ${r.version} | ${r.l2Bytes} | ${r.evals ? '有' : '无'} | ${desc.length > 120 ? `${desc.slice(0, 120)}…` : desc} |`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outPath = join(pluginsRoot, 'docs', 'skills-overview.md');
  if (process.argv.includes('--write')) {
    writeFileSync(outPath, renderSkillsOverview(), 'utf8');
    console.log(`已生成 ${outPath}`);
  } else {
    process.stdout.write(renderSkillsOverview());
  }
}
