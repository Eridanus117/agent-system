# sk — skills profile 管理与启动

背景与全部裁决史：`C:\Workspace\desk\提案\2026-08-26-Skills管理工具.md`。

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
- **profile** = `profiles/<名>/`：`skills/` 内是指回库的 junction，**文件夹即配置**。`plugin.json`（让它同时是合法 Claude plugin）、`overlay.yml`（omp 消费）、`manifest.json`（git 序列化）均由 `sk sync` 派生，勿手改。
- **加载全部走 session 级**，不改任何目录状态：
  - omp：`--config <profile>/overlay.yml`（`skills.customDirectories` 指向 profile）
  - Claude Code：`--plugin-dir <profile>`（技能以 `<profile>:<技能>` 命名空间出现）
  - 同目录多 session 各用不同 profile 互不影响；项目自带的 `.claude/skills`、`.agents/skills` 照常叠加（注意：Claude Code 不认 `.agents/skills`，omp 认）。

## 命令

```
sk list                       库存清单（含同名冲突标记）
sk profiles                   profile 一览
sk new <profile>              新建空 profile
sk add <profile> <模式...>    加技能（技能名 glob 或 @组名，如 sk add 写作 grilling @bmad）
sk rm <profile> <模式...>     移除技能（同样支持 glob 与 @组名）
sk sync <profile>             重生成派生文件、清理失效链接
sk restore <profile>          按 manifest 重建 junction（新 clone 后执行）
sk run <profile> omp|claude [参数...]   按 profile 启动 session
sk version                    版本（release 产物显示 tag 版本，源码显示 dev）
```

## 约定

- 特殊 profile：`all`（全部技能）、`general`（通用兜底，由主人策展）。
- bmad、speckit 这类成套框架按原子组进出（`@bmad`），不单挑。
- junction 与 overlay.yml 不入 git（`profiles/.gitignore`）；manifest.json 入 git，换机器后 `sk restore <profile>`——`sk run` 检测到链接全缺且 manifest 非空时也会自动 restore，绝不静默清空 manifest。
- 同名冲突：`sk add` 遇到跨组同名技能会拒绝并列出双方，`sk list` 会标记 ⚠。
- 测试：`bun test`（`tests/sk.test.ts`，在临时库根上跑真实 CLI 进程）。
