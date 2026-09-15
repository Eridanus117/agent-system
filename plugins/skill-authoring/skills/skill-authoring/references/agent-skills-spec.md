# Agent Skills 规范清单

按 Agent Skills 开放规范（agentskills.io）和三个客户端的实际行为核对。每一条都能机械检查，写完对一遍，不靠记忆。

## frontmatter

- `name`：kebab-case，只用小写字母、数字、连字符，不超过 64 字符，**必须等于目录名**（本仓 `plugins/tests/skills.test.ts` 与 agent-config 的 `deploy.ts` 都断言）。
- `description`：非空，一句话说「做什么、什么时候用」，给人看；规范上限 1024 字符，本仓测试上限 1000 UTF-8 字节。中文正文加英文尾，便于三个客户端的搜索。
- 描述里不写命令式路由句。agent-config 的 `deploy.ts check --scope=skill-descriptions` 会拦这些词：`MUST`、`ALWAYS`、`you must`、`prefer … over`、`instead of`、`before any`、`never use`、`必须先`、`一律`、`优先于`、`代替`、`任何…之前`。路由只在路线真源里写。
- 规范允许的其他键：`license`、`allowed-tools`、`metadata`、`compatibility`。别的键不写。
- 手动调用的 skill 加 `disable-model-invocation: true`。Claude Code 与 Codex 原生认；OMP 的解析器把 kebab-case 键转 camelCase 后认作 `disableModelInvocation`，被隐藏的 skill 仍注册 `/skill:<name>`。这个键不在开放规范的键表里，只影响 agent-plugins.org 那类打包校验，不影响三个客户端从 `~/.agents/skills`／`~/.claude/skills` 加载。
- 用 `>-` 折叠写多行描述时，测试与目录页都会拼成一行。

## 正文与目录

- 正文不超过 500 行；超过就把条件性细节推到 `references/`。
- 三个目录，各管一类：`scripts/` 放可执行、确定性的东西；`references/` 放按需读的文档；`assets/` 放会进产出物的模板。
- 引用一层直达：SKILL.md 直接链到 `references/<文件>.md`，不再从那里链第二层。超过 300 行的参考文件顶部加目录。
- 路径一律正斜杠，不写盘符、用户名、机器名。
- 不用 `@文件` 这种强加载写法；引用只写名字加相对链接。
- 不复述环境（目录结构、命令帮助、配置项）：那些是会过期的缓存，让 agent 自己去查。

## 三个客户端的差异（写的时候要知道）

- Claude Code：只读 `~/.claude/skills`；可见档靠 agent-config 的 `skillOverrides`（`on`／`name-only`／`user-invocable-only`／`off`）或 frontmatter 的 `disable-model-invocation`。
- Codex：读 `~/.agents/skills` 与 `.agents/skills`（向上到 git 根）；插件内的 skill 显示为 `<插件>:<名>`；认 `disable-model-invocation`；`$名` 或 `/skills` 手动调用。
- OMP：读 `~/.agents/skills`；`hide`／`disableModelInvocation`（kebab 自动转）隐藏但 `/skill:<名>` 可敲；`ignoredSkills` 是加载时滤掉，等于关闭。

## 装配

- `profiles/daily/manifest.json` 一条 `{ "name", "target" }`，`target` 是仓内相对路径，`name` 必须与目录名和 frontmatter 一致。`profiles/all/manifest.json` 同样加一条。
- `.claude-plugin/marketplace.json` 的版本必须与插件 `plugin.json` 一致。
- 改了 SKILL.md 或 plugin.json 就重跑 `node plugins/scripts/skills-overview.ts --write`，pre-commit 与 CI 都会比对目录页。
