---
status: accepted
date: 2026-09-14
decision-makers: 负责人
---

# 自建 skill 靠入口路由、不靠描述触发，并按手动调用／自动调用分两档

## 背景与问题（Context and Problem Statement）

- 2026-09-08 负责人定「描述只写触发条件」（commit 090f6e5），agent-config 的 `deploy.ts check --scope=skill-descriptions` 只查描述里有没有抢路由句，没有查长度；这条家法此前在本仓没有落盘。
- 2026-09-14 agent-config#37 把 Superpowers 14 条在 Windows 全部关闭，空出的段要自建 skill；负责人同日定「skill 只在规则点名或主人敲 `/名` 时才用，模型不靠说明文字自己猜」。
- 三家写 skill 的指南在描述上打架：Anthropic skill-creator 要描述「做什么＋什么时候」且写得推销一点以对抗触发不足；Matt Pocock 的 writing-for-agents 说只由人敲的 skill 用 `disable-model-invocation: true`，描述只是给人看的一行。
- 三个客户端的可见性机制不同：Claude Code 用 `settings.json` 的 `skillOverrides`（`on`／`name-only`／`user-invocable-only`／`off`）或 frontmatter `disable-model-invocation`；Codex 认 frontmatter `disable-model-invocation`；OMP v18.1.19 认 frontmatter `hide` 或 `disableModelInvocation`，且解析器默认把 kebab-case 键转 camelCase，所以 `disable-model-invocation: true` 三处同一写法生效（OMP 里被隐藏的 skill 仍注册 `/skill:<name>` 命令；`ignoredSkills` 则是加载时滤掉，等于关闭，见 agent-config#38）。

请负责人定的一件事：自建 skill 的 frontmatter 怎么写，模型能不能自己触发，「段的门只能主人敲」靠文字还是靠机制。

## 决策驱动因素（Decision Drivers）

- 路由权归规则和人，不归描述；描述不得在系统提示里与路由器并排发号施令。
- 「门只能主人敲」是既有规矩，越少靠 agent 自觉越好。
- 三个客户端行为要一致，不为某个客户端单独维护一套。
- 写一条 skill 时多做的判断越少越好。

## 考虑过的方案（Considered Options）

| 方案 | 做法 | 适用场景 | 代价 |
|---|---|---|---|
| A 描述触发 | 按 Anthropic 指南写推销式描述，靠模型自己挑 | skill 少、没有独立路由器 | 描述每轮进上下文；与共用规则的路由器并排发号施令，09-08 已因此把 10 条描述瘦身 |
| B 一档 | 全部 `name-only`，「门只能主人敲」靠规矩文字 | 手动调用的 skill 尚未自建 | 规矩靠 agent 自觉；一旦越过门没有机制拦 |
| C 两档 | 自动调用的 skill 什么都不加、上线待办里设 `name-only`；手动调用的 skill 加 `disable-model-invocation: true` | 既有自动调用的 skill 又有手动调用的 skill | 写 skill 时多答一个是非题「手动还是自动调用」 |

## 决定结果（Decision Outcome）

选 **C**。原先反对 C 的理由是 OMP 没有这一档，2026-09-14 读 OMP 加载代码后不成立。不选 A 因为它与路由权归规则直接冲突；不选 B 因为多出的成本只是一个是非题，而换来的是门从文字变成机制。

接入顺序（每步可单独退）：

1. 自动调用的 skill：frontmatter 只有 `name` 与 `description`（描述给人看，一句「做什么、什么时候用」，不含命令式路由句）；上线待办里在 agent-config 的 Claude 模板设 `skillOverrides: name-only`，路由句加进当前路线真源。
2. 手动调用的 skill：frontmatter 加 `disable-model-invocation: true`；不进 `skillOverrides`；路由句只写「请敲 /名」。
3. 描述长度按 Agent Skills 规范（≤1024 字符）；本仓测试保持 1000 UTF-8 字节上限，不另立数字。

### 后果（Consequences）

- 好的：手动调用的 skill 在三个客户端里模型都调不到，只有主人敲得动；自动调用的 skill 的描述不参与路由，`deploy.ts check --scope=skill-descriptions` 对手动调用的 skill 自动跳过。
- 坏的或要承担的：每条自建 skill 写之前要先答「手动还是自动调用」；手动调用的 skill 在 Claude Code 里对模型完全不可见，agent 只能提示主人敲。
- 回退：revert 引入本 ADR 的 PR；已装进 manifest 的 skill 改 frontmatter 一行即可切档，agent-config 侧 `skillOverrides` 同步改，`deploy.ts sync` 重投影。

### 确认（Confirmation）

- 手动调用的 skill：在 Claude Code、Codex、OMP 的模型可见 skill 清单里都不出现，但 `/名`（Claude）、`$名`（Codex）、`/skill:名`（OMP）能敲。
- 自动调用的 skill：Claude Code 只露名字不露描述；`deploy.ts check --scope=skill-descriptions` 退出 0。
- 落地后回来补实际结果。

## 更多信息（More Information）

- desk#139（skill-authoring 方案对齐，2026-09-14 grill 结论）；agent-config#37、#38。
- `plugins/CONTEXT.md` 定义了「手动调用」「自动调用」。
