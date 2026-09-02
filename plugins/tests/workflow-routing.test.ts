// 当前 Plugin／Skill 来源、路由、预算、生成物与装配边界的符合性检查。
// 运行：node plugins/tests/workflow-routing.test.ts
//
// 只校验版本化来源，不代表任何运行端已经安装或产生净收益。

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render as renderSkillsOverview } from '../scripts/skills-overview.ts';

type SkillDecl = {
  plugin: string;
  drive?: string[];
  return?: string[];
  reference?: string[];
};

type ScenarioCheck = {
  skill: string;
  mustContain: string[];
  mustNotContain?: string[];
};

type Scenario = {
  id: string;
  title: string;
  checks: ScenarioCheck[];
};

type LifecycleEntry = {
  invalidatedWhen: string;
  minimalRecheck: string;
  lastVerified: string | null;
  suspect: boolean;
  suspectReason?: string;
  suspectSince?: string;
};

type Config = {
  edgeKinds: Record<'drive' | 'return' | 'reference', string>;
  skills: Record<string, SkillDecl>;
  skillLifecycle: { entries: Record<string, LifecycleEntry> };
  skillOverview: {
    entries: Record<string, { forYou: string; whenToUse: string; workingSignals: string }>;
  };
  complexityBudget: {
    comment: string;
    // 数量门已于 2026-08-24 退役：它按资产数量计却以运行上下文成本为理由，
    // 而资产数量不等于装配数量。退役记录本身受下方断言保护，不得被静默恢复。
    retiredSkillCountGate: {
      reportedMaxSkills: number;
      retiredBy: string;
      retiredAt: string;
      reason: string;
      replacedBy: string;
      supersededExceptions: Array<{
        dimension: 'maxSkills';
        from: number;
        to: number;
        authorizedBy: string;
        scope: string;
      }>;
      supersededBaseline: { observedAt: string; skills: number; maxSkills: number };
    };
    retiredCorpusGate: {
      reportedUtf8Bytes: number;
      maxUtf8Bytes: number;
      retiredBy: string;
      reason: string;
    };
  };
  pluginVersions: Record<string, string>;
  descriptionBudget: {
    unit: string;
    maxUtf8Bytes: number;
    runtimeCatalogs: Array<{
      runtime: string;
      observedAt: string;
      maxSafeUtf8Bytes: number;
    }>;
    exceptions: Array<{ skill: string; decision: string; reason: string }>;
  };
  scenarios: Scenario[];
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(repoRoot, '..');
const pluginsRoot = repoRoot;
const read = (path: string): string =>
  readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const directories = (path: string): string[] =>
  readdirSync(path).filter((entry) => statSync(join(path, entry)).isDirectory());
const pluginDirectories = (path: string): string[] =>
  directories(path).filter(
    (entry) =>
      existsSync(join(path, entry, '.codex-plugin', 'plugin.json')) &&
      existsSync(join(path, entry, '.claude-plugin', 'plugin.json')),
  );
const config = JSON.parse(read(join(repoRoot, 'tests', 'workflow-routing.json'))) as Config;
const profileSkillImports = read(join(repoRoot, 'skill-imports.toml'));

function markdownBytesRecursively(root: string): number {
  if (!existsSync(root)) return 0;
  let total = 0;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      total += markdownBytesRecursively(path);
    } else if (entry.endsWith('.md')) {
      total += Buffer.byteLength(read(path), 'utf8');
    }
  }
  return total;
}

function deliveredDescription(skill: string, body: string): string {
  assert.ok(body.startsWith('---\n'), `${skill}: 缺少 frontmatter`);
  const end = body.indexOf('\n---\n', 4);
  assert.ok(end > 0, `${skill}: frontmatter 未闭合`);
  const frontmatter = body.slice(4, end);
  assert.equal(/^name:\s*(\S+)\s*$/mu.exec(frontmatter)?.[1], skill, `${skill}: name 与目录名不一致`);
  const match = /^description:\s*[>|][-+]?\s*\n(?<body>(?: {2,}.*(?:\n|$))*)/mu.exec(frontmatter);
  assert.ok(match?.groups?.body, `${skill}: 缺少可折叠 description`);
  return match.groups.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
}

// ---------- 1. 物理资产、两端 manifest 与 Marketplace ----------
const pluginNames = pluginDirectories(pluginsRoot).sort();
assert.deepEqual(
  pluginNames,
  Object.keys(config.pluginVersions).sort(),
  'pluginVersions 必须恰好覆盖当前 Plugin 目录',
);
assert.ok(
  !existsSync(join(repoRoot, 'docs', 'issue-workflow-walkthrough.md')),
  '退役工作流的当前走读不得保留',
);

const skillPlugin = new Map<string, string>();
const bodies = new Map<string, string>();
for (const plugin of pluginNames) {
  const codexPath = join(pluginsRoot, plugin, '.codex-plugin', 'plugin.json');
  const claudePath = join(pluginsRoot, plugin, '.claude-plugin', 'plugin.json');
  assert.ok(existsSync(codexPath), `${plugin}: 缺少 Codex manifest`);
  assert.ok(existsSync(claudePath), `${plugin}: 缺少 Claude manifest`);
  const codex = JSON.parse(read(codexPath));
  const claude = JSON.parse(read(claudePath));
  assert.deepEqual(codex, claude, `${plugin}: 两端 manifest 漂移`);
  assert.equal(codex.name, plugin, `${plugin}: manifest name 不一致`);
  assert.equal(codex.version, config.pluginVersions[plugin], `${plugin}: manifest 版本与声明不一致`);
  assert.equal(codex.skills, './skills/', `${plugin}: manifest 必须从 ./skills/ 发现 Skill`);

  const skillsRoot = join(pluginsRoot, plugin, 'skills');
  assert.ok(existsSync(skillsRoot), `${plugin}: 缺少 skills/`);
  for (const skill of directories(skillsRoot)) {
    assert.ok(!skillPlugin.has(skill), `${skill}: Skill 名跨 Plugin 重复`);
    const skillPath = join(skillsRoot, skill, 'SKILL.md');
    assert.ok(existsSync(skillPath), `${skill}: 缺少 SKILL.md`);
    skillPlugin.set(skill, plugin);
    bodies.set(skill, read(skillPath));
  }
}

const declared = Object.keys(config.skills).sort();
assert.deepEqual(declared, [...skillPlugin.keys()].sort(), '路由声明必须恰好覆盖物理 Skill');
const codexMarketplace = JSON.parse(read(join(repositoryRoot, '.agents', 'plugins', 'marketplace.json')));
const claudeMarketplace = JSON.parse(read(join(repositoryRoot, '.claude-plugin', 'marketplace.json')));
for (const [name, marketplace] of [
  ['Codex', codexMarketplace],
  ['Claude', claudeMarketplace],
] as const) {
  const entries = marketplace.plugins as Array<{ name: string; version: string; source: unknown }>;
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    pluginNames,
    `${name} Marketplace 必须恰好覆盖当前 Plugin`,
  );
  for (const entry of entries) {
    assert.equal(entry.version, config.pluginVersions[entry.name], `${name} ${entry.name}: 版本漂移`);
  }
}

// ---------- 2. description、路由边与剩余行为合同 ----------
const requiredDescriptionTriggers: Record<string, string[]> = {
  'adaptive-problem-solving': ['问题含糊', '波次／里程碑反思', '高成本或难回退', '低风险易回退'],
  'grilling': ['用户直接要求', '明确接受建议', '复杂性、关键词或 Agent 偏好不构成同意'],
  'knowledge-maintenance': ['多来源调研', '可重复实验', '价值门和可信门', '低成本一次性事实'],
  'orchestrated-collaboration': ['明确要求多 Agent／多 Session／跨 Provider 协作', '排他所有权', '不要因复杂、额度或空闲 Agent 擅自并行'],
  'self-improvement': ['Agent 漂移、误解、重复犯错', '持久记录纠正', '普通一次性错误'],
  'skill-maintenance': ['创建、审计、修正、拆分、升级、迁移或退役 Skill', '普通业务维护', '承载位置未定'],
};
const requiredBodyMarkers: Record<string, string[]> = {
  'adaptive-problem-solving': ['references/pre-action-gates.md', 'references/method-registry/INDEX.md', '换路或退出'],
  'grilling': ['先确认是否得到同意', '用户随时可以选择', '任务很复杂'],
  'knowledge-maintenance': ['价值门', '可信门', '失效条件', '下次最少复核'],
  'orchestrated-collaboration': ['写入所有权', '独立验收', '动态读取', '返回原始任务'],
  'self-improvement': ['当前任务', '系统提示词', 'Skill', '返回原始任务'],
  'skill-maintenance': ['clean cutover', '调用者', '生成物', '独立审查'],
};

for (const skill of declared) {
  const body = bodies.get(skill)!;
  const description = deliveredDescription(skill, body);
  assert.match(description, /[一-鿿]{10,}/u, `${skill}: description 缺少中文触发说明`);
  assert.match(description, /[A-Za-z][A-Za-z ,.'’\-]{40,}/u, `${skill}: description 缺少英文触发说明`);
  assert.ok(
    Buffer.byteLength(description, 'utf8') <= config.descriptionBudget.maxUtf8Bytes,
    `${skill}: description 超过 ${config.descriptionBudget.maxUtf8Bytes} UTF-8 字节`,
  );
  for (const marker of requiredDescriptionTriggers[skill] ?? []) {
    assert.ok(description.includes(marker), `${skill}: description 丢失「${marker}」`);
  }
  for (const marker of requiredBodyMarkers[skill] ?? []) {
    assert.ok(body.includes(marker), `${skill}: 正文丢失「${marker}」`);
  }
  assert.equal(config.skills[skill].plugin, skillPlugin.get(skill), `${skill}: Plugin 声明与物理位置不符`);

  const openaiPath = join(pluginsRoot, config.skills[skill].plugin, 'skills', skill, 'agents', 'openai.yaml');
  assert.ok(existsSync(openaiPath), `${skill}: 缺少 agents/openai.yaml`);
  assert.match(
    read(openaiPath),
    /allow_implicit_invocation:\s*(?:true|false)/u,
    `${skill}: OpenAI 调用策略必须显式声明`,
  );
}

assert.deepEqual(Object.keys(config.edgeKinds).sort(), ['drive', 'reference', 'return']);
assert.match(config.edgeKinds.drive, /调用/u, 'drive 定义必须说明它是段调用');
assert.match(config.edgeKinds.drive, /不.*生命周期|不是生命周期/u, 'drive 定义不得转移生命周期决定权');
assert.match(config.edgeKinds.return, /段结果/u, 'return 定义必须说明返回段结果');
assert.match(config.edgeKinds.reference, /不发生调用/u, 'reference 定义必须排除运行时调用');
for (const [skill, spec] of Object.entries(config.skills)) {
  for (const edge of ['drive', 'return', 'reference'] as const) {
    for (const target of spec[edge] ?? []) {
      assert.ok(config.skills[target], `${skill}: ${edge} 指向未知 Skill ${target}`);
      assert.ok(bodies.get(skill)!.includes(target), `${skill}: ${edge} 边 ${target} 未在正文出现`);
    }
  }
}

const visiting = new Set<string>();
const visited = new Set<string>();
function visitDrive(skill: string): void {
  assert.ok(!visiting.has(skill), `drive 边形成运行时循环：${skill}`);
  if (visited.has(skill)) return;
  visiting.add(skill);
  for (const target of config.skills[skill].drive ?? []) visitDrive(target);
  visiting.delete(skill);
  visited.add(skill);
}
for (const skill of declared) visitDrive(skill);

for (const scenario of config.scenarios) {
  assert.ok(scenario.id.trim(), '场景缺少 id');
  assert.ok(scenario.title.trim(), `${scenario.id}: 场景缺少 title`);
  assert.ok(scenario.checks.length > 0, `${scenario.id}: 场景没有检查`);
  for (const check of scenario.checks) {
    const body = bodies.get(check.skill);
    assert.ok(body, `${scenario.id}: 检查指向未知 Skill ${check.skill}`);
    for (const marker of check.mustContain) {
      assert.ok(body.includes(marker), `${scenario.id}/${check.skill}: 缺少「${marker}」`);
    }
    for (const marker of check.mustNotContain ?? []) {
      assert.ok(!body.includes(marker), `${scenario.id}/${check.skill}: 禁止出现「${marker}」`);
    }
  }
}

// ---------- 3. 生命周期、数量门和分层成本 ----------
assert.deepEqual(
  Object.keys(config.skillLifecycle.entries).sort(),
  declared,
  'skillLifecycle 必须恰好覆盖当前 Skill',
);
assert.deepEqual(
  Object.keys(config.skillOverview.entries).sort(),
  declared,
  'skillOverview 必须恰好覆盖当前 Skill',
);
const invalidationTexts = new Map<string, string>();
for (const [skill, entry] of Object.entries(config.skillLifecycle.entries)) {
  assert.ok(entry.invalidatedWhen.trim().length >= 20, `${skill}: 失效条件不可执行`);
  assert.ok(entry.minimalRecheck.trim().length >= 20, `${skill}: 最少复核不可执行`);
  assert.ok(entry.lastVerified === null || /^\d{4}-\d{2}-\d{2}$/u.test(entry.lastVerified), `${skill}: lastVerified 格式错误`);
  assert.equal(typeof entry.suspect, 'boolean', `${skill}: suspect 必须是布尔`);
  if (entry.suspect) {
    assert.ok(entry.suspectReason && entry.suspectReason.length >= 10, `${skill}: suspect 缺少理由`);
    assert.match(entry.suspectSince ?? '', /^\d{4}-\d{2}-\d{2}$/u, `${skill}: suspectSince 格式错误`);
  }
  const previous = invalidationTexts.get(entry.invalidatedWhen);
  assert.ok(!previous, `${skill} 与 ${previous} 的失效条件逐字相同`);
  invalidationTexts.set(entry.invalidatedWhen, skill);

  const overview = config.skillOverview.entries[skill];
  for (const [field, value] of Object.entries(overview)) {
    assert.ok(value.trim().length >= 10, `${skill}: 选型面缺少 ${field}`);
  }
}

// 数量门已退役。这里断言的是"退役记录完整且不可静默撤销"，而不是任何数量上限：
// 被替代的例外与基线必须原样保留，退役理由与替代去向必须写明，且不得偷偷加回 maxSkills。
assert.ok(
  !('maxSkills' in config.complexityBudget),
  'Skill 数量门已于 2026-08-24 退役，不得重新引入 maxSkills；限制若有必要属于装配层',
);
const retiredCount = config.complexityBudget.retiredSkillCountGate;
assert.equal(retiredCount.reportedMaxSkills, 13);
assert.equal(retiredCount.retiredBy, 'https://github.com/Eridanus117/agent-system/pull/168');
assert.equal(retiredCount.retiredAt, '2026-08-24');
assert.ok(
  retiredCount.reason.includes('资产数量不等于'),
  '退役理由必须写明资产数量与装配数量不等价——那是它被退役的唯一依据',
);
assert.ok(
  retiredCount.replacedBy.includes('装配层'),
  '退役记录必须写明限制若有必要该落在哪一层，否则等于无条件放开',
);
assert.deepEqual(retiredCount.supersededBaseline, {
  observedAt: '2026-08-15',
  skills: 12,
  maxSkills: 12,
});
assert.equal(retiredCount.supersededExceptions.length, 1);
assert.equal(
  retiredCount.supersededExceptions[0].authorizedBy,
  'https://github.com/Eridanus117/agent-control/issues/57',
);
assert.equal(config.complexityBudget.retiredCorpusGate.retiredBy, 'https://github.com/Eridanus117/agent-plugins/issues/16');
assert.equal(config.descriptionBudget.unit, 'utf8-bytes');
assert.equal(
  config.descriptionBudget.maxUtf8Bytes,
  Math.min(...config.descriptionBudget.runtimeCatalogs.map((entry) => entry.maxSafeUtf8Bytes)),
  'description 门必须等于三端实测安全阈值最小值',
);

let level2MainBytes = 0;
let level3ReferenceBytes = 0;
for (const [skill, plugin] of skillPlugin) {
  const root = join(pluginsRoot, plugin, 'skills', skill);
  level2MainBytes += Buffer.byteLength(read(join(root, 'SKILL.md')), 'utf8');
  level3ReferenceBytes += markdownBytesRecursively(join(root, 'references'));
}
assert.ok(level2MainBytes > 0, 'L2 计量必须覆盖 SKILL.md');
assert.ok(level3ReferenceBytes > 0, 'L3 计量必须覆盖递归 references');
const maintenanceCorpusBytes = level2MainBytes + level3ReferenceBytes;

const overviewPath = join(repoRoot, 'docs', 'skills-overview.md');
assert.ok(existsSync(overviewPath), 'docs/skills-overview.md 必须存在');
const overviewText = read(overviewPath);
assert.equal(overviewText, renderSkillsOverview(), 'skills-overview 生成物与来源不一致');
for (const marker of [
  `当前 ${declared.length} 个 Skill`,
  `L2 主合同 ${level2MainBytes.toLocaleString('en-US')} 字节`,
  `L3 按需 references ${level3ReferenceBytes.toLocaleString('en-US')} 字节`,
  `递归维护面合计 ${maintenanceCorpusBytes.toLocaleString('en-US')} 字节`,
]) {
  assert.ok(overviewText.includes(marker), `选型面缺少分层事实「${marker}」`);
}
const CN_NUMERALS: Record<number, string> = {
  6: '六',
  7: '七',
  8: '八',
  9: '九',
  10: '十',
};

// ---------- 4. README 当前入口与装配边界 ----------
const readme = read(join(repoRoot, 'README.md'));
const overviewLines = readme.split('\n').filter((line) => line.includes('仓库目前包含'));
assert.equal(overviewLines.length, 1, 'README 必须有且只有一句当前版本总览');
const currentOverview = overviewLines[0];
assert.ok(
  currentOverview.includes(`${CN_NUMERALS[pluginNames.length] ?? pluginNames.length}个可安装 Plugin`),
  `README 当前总览必须说明 ${pluginNames.length} 个 Plugin`,
);
for (const [plugin, version] of Object.entries(config.pluginVersions)) {
  assert.ok(currentOverview.includes(`\`${plugin}\` \`${version}\``), `README 当前总览缺少 ${plugin} ${version}`);
}
for (const skill of declared) assert.ok(readme.includes(skill), `README 未提及当前 Skill ${skill}`);
assert.ok(
  readme.includes('仓库资产、Marketplace 可安装目录和当前默认装配是三个不同状态') &&
    readme.includes('`plugins/skill-imports.toml`') &&
    profileSkillImports.includes('source = "plugins/grilling/skills/grilling"') &&
    !profileSkillImports.includes('plugins/self-improvement/skills'),
  'README 与 skill imports 必须明确区分可安装资产和当前 profile 装配',
);

console.log(`PASS: ${declared.length} 个 Skill、${pluginNames.length} 个 Plugin、${config.scenarios.length} 个验收场景`);
