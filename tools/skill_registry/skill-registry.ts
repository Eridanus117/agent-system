#!/usr/bin/env node
// 生成 tools/skill_registry/registry.md：全仓 Skill 资产面。
//
// **组是第一结构。** 装卸、版本、发现、判定、复核都以组为单位，不以 Skill 为单位。
// 组不是 OMP plugin——2026-08-24 实测 omp v18.0.3：skill 走目录约定加选择开关
// （skills.customDirectories／includeSkills／ignoredSkills／enable*），plugin 走 npm
// 包加 TS/JS extension，两套互不相干。组是本仓自己的概念，由 configs 在启动时投影
// 到 OMP 的 skill 配置。详见 matters.json 的 formNote。
//
// 与 plugins/docs/skills-overview.md 的分工：
//   skills-overview  = 选型面。只覆盖 plugins/ 的 Skill，回答“该用哪个”。
//   registry（本文件）= 资产面。覆盖全部三处来源，回答“我有哪些组、归哪个事项、
//                       健康吗、下次怎么用最小代价复核”。
//
// 安装态不在本工具范围内：那是本机事实，入口是 tools/plugin_release。本页只读
// 版本化来源，全部结论都是声明态。
//
// 运行：node tools/skill_registry/skill-registry.ts [--write] [--check]
//   --write  写入 registry.md
//   --check  与 skills-overview.md 交叉校验重叠 Skill 的 L1 读数，并校验生成物未漂移

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(toolDir, '..', '..');
const read = (path: string): string =>
  readFileSync(path, 'utf8').replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
const posix = (path: string): string => path.split('\\').join('/');

type Origin = {
  kind: 'own' | 'fork' | 'vendor';
  upstream?: string;
  ref?: string;
  license?: string;
  installedAt?: string;
  lastSynced?: string;
  localChanges?: string | string[];
  updateTrigger?: string;
  // kind 与 dependsOn 是两回事：一个 own 组也可以依赖外部工具版本。
  // dependsOn 的 updateTrigger 是该组的失效条件之一，与 kind 无关。
  dependsOn?: {
    tool: string;
    version: string;
    lockedBy?: string;
    updateTrigger?: string;
  };
};

type GroupDecl = {
  // 人读名。机器名保持 kebab-case ASCII——三端按名路由，且 .cap 要求稳定机器 id、
  // 路径、命令与配置键保持规范形式。两者始终并列显示，不互相取代。
  displayName: string;
  matters: string[];
  packagedForClaude: boolean;
  origin: Origin;
  note?: string;
};

type Matters = {
  recheckStaleDays: number;
  formNote: string;
  originKinds: Record<string, string>;
  displayNameNote: string;
  matters: Record<string, { name: string }>;
  groups: Record<string, GroupDecl>;
  groupRules: {
    byLocation: { prefix: string; namePrefix?: string; group: string }[];
  };
  scanRoots: { path: string; shape: string }[];
};

type Cognition = {
  invalidatedWhen: string;
  minimalRecheck: string;
  lastVerified: string | null;
  suspect: boolean;
};

const decl = JSON.parse(read(join(toolDir, 'matters.json'))) as Matters;
// 组级认知优先：vendored／fork 组的失效来自上游版本，全组共享同一条失效条件与
// 同一次复核——写一次而不是逐个成员写。skills 里的逐个条目只用于组内确实需要
// 单独判定的成员，覆盖组级值。
const appraisals = JSON.parse(read(join(toolDir, 'appraisals.json'))) as {
  groups: Record<string, Partial<Cognition> & { evidence?: string }>;
  skills: Record<string, Partial<Cognition>>;
};
const routing = JSON.parse(read(join(repoRoot, 'plugins', 'tests', 'workflow-routing.json'))) as {
  skillLifecycle: { entries: Record<string, Cognition> };
  pluginVersions: Record<string, string>;
};

// --- 度量 -------------------------------------------------------------

function markdownBytesRecursively(root: string): number {
  if (!existsSync(root)) return 0;
  let total = 0;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) total += markdownBytesRecursively(path);
    else if (entry.endsWith('.md')) total += Buffer.byteLength(read(path), 'utf8');
  }
  return total;
}

// 各来源的 frontmatter 写法不统一：plugins 用折叠标量；历史来源三种混用
// ——单引号并以 '' 转义、裸标量、双引号并以 \" 转义。全部归一到运行端实际看到的
// 一行。（原注释把裸标量的来源记作 .cap 与 deliverables：.cap 已随 Story 4.7 退役
// 删除，deliverables 不在 scanRoots 里；裸标量今天来自 .agents。）
export function descriptionBytes(skillBody: string): number | null {
  const block = /^description:\s*[>|][-+]?[ \t]*\n((?:[ \t]+.*(?:\n|$))*)/m.exec(skillBody);
  if (block) {
    const joined = block[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');
    return Buffer.byteLength(joined, 'utf8');
  }
  const inline = /^description:[ \t]+(.*(?:\n(?![ \t]*[A-Za-z_-]+:|---)[ \t]*\S.*)*)/m.exec(
    skillBody,
  );
  if (!inline) return null;
  let value = inline[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1).split("''").join("'");
  } else if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).split('\\"').join('"');
  }
  return Buffer.byteLength(value, 'utf8');
}

// --- 扫描 -------------------------------------------------------------

type Row = {
  name: string;
  location: string;
  group: string;
  description: number | null;
  main: number;
  references: number;
  cognition: Partial<Cognition> | null;
  cognitionSource: string | null;
};

function collectSkillDirs(): { name: string; dir: string; pluginDir: string | null }[] {
  const found: { name: string; dir: string; pluginDir: string | null }[] = [];
  for (const root of decl.scanRoots) {
    const abs = join(repoRoot, root.path);
    if (!existsSync(abs)) continue;
    if (root.shape === 'plugin') {
      for (const plugin of readdirSync(abs)) {
        const skillsDir = join(abs, plugin, 'skills');
        if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) continue;
        for (const skill of readdirSync(skillsDir)) {
          const dir = join(skillsDir, skill);
          if (existsSync(join(dir, 'SKILL.md'))) found.push({ name: skill, dir, pluginDir: plugin });
        }
      }
    } else {
      for (const skill of readdirSync(abs)) {
        const dir = join(abs, skill);
        if (existsSync(join(dir, 'SKILL.md'))) found.push({ name: skill, dir, pluginDir: null });
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

// plugins/ 下 plugin 目录名即组名，机械可推；其余按声明的位置＋名称前缀规则。
function assignGroup(name: string, location: string, pluginDir: string | null): string {
  if (pluginDir) return pluginDir;
  for (const rule of decl.groupRules.byLocation) {
    if (!location.startsWith(rule.prefix)) continue;
    if (rule.namePrefix && !name.startsWith(rule.namePrefix)) continue;
    return rule.group;
  }
  return '未归组';
}

export function buildRows(): Row[] {
  return collectSkillDirs().map(({ name, dir, pluginDir }) => {
    const location = posix(relative(repoRoot, dir));
    const body = read(join(dir, 'SKILL.md'));
    const group = assignGroup(name, location, pluginDir);
    const inPlugins = location.startsWith('plugins/');
    // 解析顺序：plugins 内走 skillLifecycle；plugins 外先看逐个条目，再回落到组级。
    const routed = inPlugins ? routing.skillLifecycle.entries[name] : undefined;
    const perSkill = inPlugins ? undefined : appraisals.skills[name];
    const perGroup = inPlugins ? undefined : appraisals.groups[group];
    const cognition = routed ?? perSkill ?? perGroup ?? null;
    const cognitionSource = routed
      ? 'plugins/tests/workflow-routing.json'
      : perSkill
        ? 'appraisals.json · skills'
        : perGroup
          ? `appraisals.json · groups.${group}（组级，全组共享）`
          : null;
    return {
      name,
      location,
      group,
      description: descriptionBytes(body),
      main: Buffer.byteLength(body, 'utf8'),
      references: markdownBytesRecursively(join(dir, 'references')),
      cognition,
      cognitionSource,
    };
  });
}

// --- 渲染 -------------------------------------------------------------

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
const mark = (present: boolean): string => (present ? '有' : '—');

function daysSince(iso: string, today: Date): number {
  const then = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(then)) return Number.NaN;
  return Math.floor((today.getTime() - then) / 86_400_000);
}

export function render(today: Date = new Date()): string {
  const rows = buildRows();
  const stale = decl.recheckStaleDays;
  const groupNames = [...new Set(rows.map((r) => r.group))].sort((a, b) => {
    const order = Object.keys(decl.groups);
    return (
      (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
      (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
    );
  });

  type GroupView = {
    name: string;
    rows: Row[];
    maintenance: number;
    version: string | null;
    d: GroupDecl | null;
  };
  const groups: GroupView[] = groupNames.map((name) => {
    const members = rows.filter((r) => r.group === name);
    return {
      name,
      rows: members,
      maintenance: members.reduce((s, r) => s + r.main + r.references, 0),
      version: routing.pluginVersions[name] ?? null,
      d: decl.groups[name] ?? null,
    };
  });
  const totalMaintenance = groups.reduce((s, g) => s + g.maintenance, 0);

  const unpackaged = groups.filter((g) => g.d && !g.d.packagedForClaude);
  const ungrouped = groups.filter((g) => !g.d);
  // 外来组：fork 承诺零改动，vendor 承认有补丁。两者都必须能说清改动状况和更新触发；
  // 说不清的比说清"有补丁"更危险——它会在下次升级时静默丢失。
  const external = groups.filter((g) => g.d && g.d.origin.kind !== 'own');
  const unverifiedOrigin = external.filter(
    (g) => !g.d?.origin.localChanges || g.d.origin.localChanges === '未核实',
  );
  const noUpdateTrigger = external.filter(
    (g) => !g.d?.origin.updateTrigger || g.d.origin.updateTrigger === '未声明',
  );
  const patched = external.filter((g) => Array.isArray(g.d?.origin.localChanges));
  const noCognition = groups.filter((g) => g.rows.some((r) => !r.cognition?.minimalRecheck));
  const overdueGroups = groups.filter((g) =>
    g.rows.some((r) => {
      const last = r.cognition?.lastVerified;
      return typeof last === 'string' && daysSince(last, today) > stale;
    }),
  );
  const unparsed = rows.filter((r) => r.description === null);

  const lines: string[] = [
    '<!-- 生成产物：node tools/skill_registry/skill-registry.ts --write。不要手改。',
    '     组、事项与归组规则来自 matters.json；判定认知来自 workflow-routing.json 与 appraisals.json。 -->',
    '',
    '# Skill 资产面',
    '',
    '**组是第一结构。** 装卸、版本、发现、判定、复核都以组为单位，不以 Skill 为单位——',
    `${rows.length} 个 Skill 实际是 ${groups.length} 个组，判定 ${groups.length} 次，不是 ${rows.length} 次。`,
    '',
    '## 组的形态',
    '',
    decl.formNote,
    '',
    '## 命名',
    '',
    decl.displayNameNote,
    '',
    '一个组可以服务多个事项（`openspec` 同时覆盖 E1 与 E2），因此不按 Skill 逐个归属事项——',
    '组内互相调用，拆组会拆断。',
    '',
    '## 边界',
    '',
    '| 面 | 回答 | 承载 |',
    '| --- | --- | --- |',
    '| 选型面 | 该用哪个 | [`plugins/docs/skills-overview.md`](../../plugins/docs/skills-overview.md)（13 个） |',
    '| **资产面（本页）** | **我有哪些组、归哪、打包没有、健康吗** | 本工具（82 个 / 12 组） |',
    '| 装配面 | 某个配置引用了什么 | `configs` 与其 SQLite（运行时权威） |',
    '| 安装态 | 运行端实际装了什么 | `tools/plugin_release`（本机事实） |',
    '',
    '本页只读版本化来源。字节是实测，其余全部是声明态；**不证明任何组在任一运行端已安装或生效。**',
    '',
    '## 当前缺口',
    '',
    `共 ${rows.length} 个 Skill / ${groups.length} 个组，递归维护面 ${totalMaintenance.toLocaleString('en-US')} 字节。`,
    '',
    '| 缺口 | 数量 | 含义 |',
    '| --- | ---: | --- |',
    `| 未打包（Claude 侧） | ${unpackaged.length} | 无 plugin.json／不在两份 Marketplace，因而无版本号；OMP 侧不受影响——它本就不走 plugin 道 |`,
    `| 未归组 | ${ungrouped.length} | 归组规则未覆盖，需在 matters.json 声明 |`,
    `| 外来组改动状况未核实 | ${unverifiedOrigin.length} | 不知道是 fork 还是 vendor，升级会静默丢改动 |`,
    `| 外来组无更新触发条件 | ${noUpdateTrigger.length} | 上游发新版没人知道，等于不更新 |`,
    `| 已打补丁的 vendor 组 | ${patched.length} | 升级前必须先重打补丁或把改动推回上游 |`,
    `| 组内有成员缺最少复核步骤 | ${noCognition.length} | 复核只能从零重判 |`,
    `| 组内有成员复核过期（> ${stale} 天） | ${overdueGroups.length} | 有认知但已超过节拍 |`,
    `| description 解析失败 | ${unparsed.length} | frontmatter 写法超出已知三种 |`,
    '',
    '缺口为空不代表健康，只代表本工具能检出的项目已满足。',
    '',
    '## 组总览',
    '',
    '| 组 | 成员 | 维护面 | 占比 | 版本 | Claude 打包 | 服务事项 | 来源 | 本地改动 |',
    '| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const g of groups) {
    const matters = g.d
      ? g.d.matters.map((m) => `${m} ${decl.matters[m]?.name ?? ''}`.trim()).join('、')
      : '**未声明**';
    const o = g.d?.origin;
    const origin = o
      ? o.kind === 'own'
        ? 'own'
        : `**${o.kind}**${o.ref ? ` ${o.ref}` : ''}`
      : '**未声明**';
    const changes = !o
      ? '—'
      : o.kind === 'own'
        ? '—'
        : Array.isArray(o.localChanges)
          ? `**${o.localChanges.length} 处**`
          : o.localChanges === 'none'
            ? '零'
            : '**未核实**';
    lines.push(
      `| ${g.d && g.d.displayName !== g.name ? `**${g.d.displayName}** ` : ''}\`${g.name}\` | ${g.rows.length} | ${kb(g.maintenance)} | ` +
        `${((g.maintenance / totalMaintenance) * 100).toFixed(1)}% | ${g.version ?? '**无**'} | ` +
        `${g.d ? (g.d.packagedForClaude ? '是' : '**否**') : '**未声明**'} | ${matters} | ${origin} | ${changes} |`,
    );
  }
  lines.push(
    '',
    `来源三分：${Object.entries(decl.originKinds)
      .filter(([k]) => k !== 'comment' && k !== 'dependsOnNote')
      .map(([k, v]) => `\`${k}\` ${v}`)
      .join('；')}。${decl.originKinds.dependsOnNote ?? ''}`,
    '',
    '**`fork` 的零改动是可机械验证的，不是一句声明**：内容指纹与上游 ref 不符即承诺已破，',
    '必须转 `vendor` 或把改动推回上游。名义 fork、实际改过的组，下次升级一定丢改动且无人知晓。',
    '',
  );

  for (const g of groups) {
    lines.push(`### ${g.d && g.d.displayName !== g.name ? `${g.d.displayName} · ` : ''}${g.name}`, '');
    if (g.d) {
      const o = g.d.origin;
      lines.push(
        `服务事项 ${g.d.matters.map((m) => `**${m}** ${decl.matters[m]?.name ?? ''}`).join('｜')}` +
          `　来源 \`${o.kind}\`　${g.d.packagedForClaude ? `已打包 v${g.version ?? '?'}` : '**未打包**'}`,
        '',
      );
      if (o.dependsOn) {
        const dep = o.dependsOn;
        lines.push(
          `**依赖外部工具** \`${dep.tool}\` \`${dep.version}\`` +
            `${dep.lockedBy ? `（锁于 ${dep.lockedBy}）` : ''}` +
            `${dep.updateTrigger ? `　更新触发：${dep.updateTrigger}` : ''}`,
          '',
        );
      }
      if (o.kind !== 'own') {
        const facts = [
          o.upstream ? `上游 ${o.upstream}` : null,
          o.ref ? `ref \`${o.ref}\`` : null,
          o.license ? `许可 ${o.license}` : null,
          o.installedAt ? `装于 ${o.installedAt}` : null,
          o.lastSynced ? `上次同步 ${o.lastSynced}` : null,
          o.updateTrigger ? `更新触发 ${o.updateTrigger}` : null,
        ].filter(Boolean);
        lines.push(...facts.map((f) => `- ${f}`), '');
        if (Array.isArray(o.localChanges)) {
          lines.push(
            `**本地改动 ${o.localChanges.length} 处——升级前必须先重打补丁或推回上游：**`,
            '',
            ...o.localChanges.map((c) => `- ${c}`),
            '',
          );
        } else if (o.localChanges === 'none') {
          lines.push('**本地改动：零**（fork 承诺成立）', '');
        } else {
          lines.push('**本地改动：未核实**——不知道升级会不会丢东西。', '');
        }
      }
      if (g.d.note) lines.push(`> ${g.d.note}`, '');
    } else {
      lines.push('**未在 matters.json 声明。** 归组规则未覆盖，事项与来源均未知。', '');
    }
    lines.push(
      '| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |',
      '| --- | --- | ---: | ---: | ---: | --- | --- | --- |',
    );
    for (const row of g.rows) {
      const last = row.cognition?.lastVerified;
      const verified = row.cognition?.suspect
        ? '**存疑**'
        : typeof last === 'string'
          ? daysSince(last, today) > stale
            ? `${last} **已过期**`
            : last
          : '**从未**';
      const l1 =
        row.description === null ? '**解析失败**' : `${row.description.toLocaleString('en-US')} B`;
      lines.push(
        `| \`${row.name}\` | \`${row.location}\` | ${l1} | ${kb(row.main)} | ${kb(row.references)} | ` +
          `${verified} | ${mark(Boolean(row.cognition?.invalidatedWhen))} | ` +
          `${mark(Boolean(row.cognition?.minimalRecheck))} |`,
      );
    }
    lines.push('');
  }

  // 复核要便宜，人就必须读得到步骤本身。表格只标有无，步骤正文在这里展开——
  // 这正是选型面缺的那一环：minimalRecheck 在 workflow-routing.json 里一直存在，
  // 却从未被渲染到任何人读得到的地方，于是每次复核都退化成重判。
  // 组级认知只渲染一次，不按成员重复——vendored 组一条认知覆盖全部成员，
  // 逐个渲染就是 49 份相同正文，正是组这一层要消除的东西。
  type RecheckEntry = { title: string; scope: string; c: Partial<Cognition>; source: string };
  const entries: RecheckEntry[] = [];
  for (const g of groups) {
    const ga = appraisals.groups[g.name];
    if (ga?.minimalRecheck) {
      entries.push({
        title: `${g.d && g.d.displayName !== g.name ? `${g.d.displayName} · ` : ''}${g.name}`,
        scope: `组级 · 覆盖 ${g.rows.length} 个成员`,
        c: ga,
        source: `appraisals.json · groups.${g.name}`,
      });
    }
  }
  for (const row of rows) {
    if (!row.cognition?.minimalRecheck) continue;
    if (row.cognitionSource?.startsWith('appraisals.json · groups.')) continue;
    entries.push({
      title: row.name,
      scope: `单个 Skill · 组 \`${row.group}\``,
      c: row.cognition,
      source: row.cognitionSource ?? '未知',
    });
  }

  const covered = rows.filter((r) => r.cognition?.minimalRecheck).length;
  lines.push('## 复核依据', '');
  if (entries.length === 0) {
    lines.push('当前没有任何组或 Skill 写下了最少复核步骤。', '');
  } else {
    lines.push(
      `${entries.length} 条复核依据，覆盖 ${covered}/${rows.length} 个 Skill。复核按下列步骤做，不重判。`,
      '',
    );
    for (const e of entries) {
      lines.push(
        `### ${e.title}`,
        '',
        `${e.scope}｜来源 \`${e.source}\`｜上次复核 ${e.c.lastVerified ?? '从未'}`,
        '',
        `**什么会让它失效** ${e.c.invalidatedWhen ?? '未写'}`,
        '',
        `**下次最少复核步骤** ${e.c.minimalRecheck ?? '未写'}`,
        '',
      );
      const ev = (e.c as { evidence?: string }).evidence;
      if (ev) lines.push(`**本次判定依据** ${ev}`, '');
    }
  }

  lines.push(
    '## 认知来源',
    '',
    '每个 Skill 的失效条件与最少复核步骤只有一个来源，不在两处重复：',
    '',
    '| 范围 | 来源 |',
    '| --- | --- |',
    '| `plugins/` 内 | `plugins/tests/workflow-routing.json` 的 `skillLifecycle` |',
    '| `plugins/` 外 | `tools/skill_registry/appraisals.json` |',
    '',
    '组边界、服务事项与归组规则来自 `tools/skill_registry/matters.json` 的显式声明。',
    '归组是判断而非推导（`plugins/` 下目录名即组名除外）；工具只套用已声明的规则，',
    '套不上就标未归组，不猜。',
    '',
    '**失效条件应挂在组上，不是逐个 Skill。** vendored 组（曾如 `bmad` 49 个成员）的失效',
    '来自上游版本，全组共享同一条失效条件与同一次复核——写一次，不是写 49 次。',
    '当前 `skillLifecycle` 仍是逐 Skill 结构，这是已知的建模落后项。',
    '',
  );
  return lines.join('\n');
}

// --- 与选型面的 L1 读数交叉校验 ---------------------------------------

// 生成物必须与来源一致，否则它就是一份会漂移的手写文档——正是 plugins/docs/lifecycle.md
// 要防的东西。对齐 workflow-routing.test.ts 对 skills-overview.md 的做法。
// 注意只比较 render() 的确定性部分：render 依赖 today，但输出里的日期全部来自
// 声明数据，唯一的时间敏感项是"已过期"标记，因此同日重生成必然一致。
function generatedFreshness(): number {
  const target = join(toolDir, 'registry.md');
  if (!existsSync(target)) {
    console.error('registry.md 不存在——运行 --write 生成');
    return 1;
  }
  if (read(target) !== render()) {
    console.error('registry.md 与来源不一致——运行 --write 重新生成');
    return 1;
  }
  console.log('生成物校验通过：registry.md 与来源一致');
  return 0;
}

function crossCheck(): number {
  const overviewPath = join(repoRoot, 'plugins', 'docs', 'skills-overview.md');
  if (!existsSync(overviewPath)) {
    console.error('跳过交叉校验：plugins/docs/skills-overview.md 不存在');
    return 0;
  }
  const overview = read(overviewPath);
  let mismatches = 0;
  let compared = 0;
  for (const row of buildRows()) {
    if (!row.location.startsWith('plugins/')) continue;
    const cell = new RegExp(
      `\\| \\[${row.name}\\]\\(#${row.name}\\) \\|[^|]*\\|\\s*([\\d,]+) B \\|`,
    ).exec(overview);
    if (!cell) continue;
    compared += 1;
    const reported = Number(cell[1].split(',').join(''));
    if (reported !== row.description) {
      mismatches += 1;
      console.error(`L1 读数不一致 ${row.name}：选型面 ${reported} B，资产面 ${row.description} B`);
    }
  }
  console.log(
    mismatches === 0
      ? `交叉校验通过：与选型面对 ${compared} 个 Skill 的 L1 读数一致`
      : `交叉校验失败：${mismatches}/${compared} 个不一致`,
  );
  return mismatches;
}

const wantsWrite = process.argv.includes('--write');
const wantsCheck = process.argv.includes('--check');

if (wantsWrite) {
  const target = join(toolDir, 'registry.md');
  writeFileSync(target, render(), 'utf8');
  console.log(`已生成 ${posix(relative(repoRoot, target))}`);
}
if (wantsCheck) {
  // 两条不变量都是"不要漂移"：与选型面的读数一致，与自身来源一致。
  process.exitCode = crossCheck() + generatedFreshness() === 0 ? 0 : 1;
}
if (!wantsWrite && !wantsCheck) {
  process.stdout.write(render());
}
