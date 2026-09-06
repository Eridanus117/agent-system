# sk — skills profile 管理与启动

背景与全部裁决史：当前工作区根目录下的 `desk/提案/2026-08-26-Skills管理工具.md`。

## 安装

sk 是独立的 TS CLI，发布产物为各平台单文件可执行（`sk-v*` tag 触发 `.github/workflows/release-sk.yml` 交叉编译并发 GitHub Release，附 SHA256SUMS 与 provenance）。安装 = 下载对应平台的二进制放进 PATH。

本机从源码构建同一产物：

```powershell
cd packages/sk && bun run build   # 产出 dist/sk（Windows 为 dist/sk.exe）
```

开发态直接跑源码：`bun packages/sk/src/cli.ts <命令>`。

**技能库根**的解析顺序：`SK_ROOT` 环境变量 → 从 sk 所在位置向上查找含 `plugins/`、`vendor/` 的目录。二进制放在本仓目录树内（如 `tools/sk/`，已不入 git）可免设环境变量。

## 模型

- **库** = 库根 `plugins/<组>/skills/<技能>/` 与 `vendor/<组>/skills/<技能>/`（Agent Skills 标准格式，SKILL.md）。
- **profile** = `profiles/<名>/`：`manifest.json` 的 `skills: [{name, target}]` 是唯一技能声明，`target` 是库根相对路径；`skills/` 内指回库的 junction 是投影，`.claude-plugin/plugin.json` 与 `overlay.yml` 是生成的客户端配置。
- **加载全部走 session 级**，不改项目目录或用户级配置；启动前会按声明修复 profile 投影：
  - omp：`--config <profile>/overlay.yml`（`skills.customDirectories` 指向 profile）
  - Claude Code：`--plugin-dir <profile>`（技能以 `<profile>:<技能>` 命名空间出现）
  - 同目录多 session 各用不同 profile 互不影响；项目自带的 `.claude/skills`、`.agents/skills` 照常叠加（注意：Claude Code 不认 `.agents/skills`，omp 认）。

## 命令

```
sk list                       库存清单（含同名冲突标记）
sk profiles                   profile 一览（按声明计数，显示缺链与未接入项）
sk show <profile>             只读查看声明、组、技能、描述与链接健康度；缺链提示 sync 修复
sk new <profile>              新建空 profile 声明
sk add <profile> <模式...>    加入声明并装配（技能名 glob 或 @组名，如 sk add 写作 grilling @openspec）
sk rm <profile> <模式...>     按声明移除技能（支持 glob 与 @组名；缺链或目标失效也可移除）
sk sync <profile>             校验声明、修复投影、重生成客户端配置；保留并报告未声明项
sk restore <profile>          同样按声明修复投影和配置（可用于新 clone）
sk run <profile> omp|claude [参数...]   校验并修复后按 profile 启动 session，拒绝未声明额外项
sk version                    版本（release 产物显示 tag 版本，源码显示 dev）
```

## 约定

- 特殊 profile：`all`（全部技能）。此前的 `general` 为空 profile，已于 2026-09-03 删除。
- 成套框架类技能组按原子组进出（`@组名`），不单挑。
- 只有 `sk new/add/rm` 显式更新声明。junction 与 overlay.yml 不入 git（`profiles/.gitignore`），manifest.json 入 git；`sync/restore/run` 完整校验后修复缺失、错误或断链投影并生成客户端配置，不反写 manifest，保持其逐字节不变。换机器可用 `sk restore <profile>` 或 `sk sync <profile>`。
- 同名冲突：`sk add` 遇到跨组同名或已声明同名异源技能会拒绝，保留原声明；`sk list` 会标记冲突。
- 未声明额外项不属于 profile 的声明技能：`show/profiles` 归为未接入，`sync` 保留并报告、不吸收也不删除，`run` 在写入或启动前拒绝。
- 装配前完整校验 manifest 结构、重复或不安全的技能名、越出库根或失效的目标；声明名必须与真实源目录名及 SKILL frontmatter 的 `name` 一致。任何校验失败或声明同名位置被实体目录占用，都在写入前失败，绝不删除实体内容；`show` 只读提示用 `sync` 修复。
- 测试：`bun test`（`tests/sk.test.ts`，每例独立临时库根与 HOME，子进程 PATH 隔离到空临时目录，不启动真实客户端）。
