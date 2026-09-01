# sk — skills profile 管理与启动

背景与全部裁决史：`C:\Workspace\desk\提案\2026-08-26-Skills管理工具.md`。

## 安装（本机一次性）

实现是 TypeScript（`sk.ts`），由 bun 直接执行；本仓不提交 Batch 启动器（仓规：持久脚本只用 Go/Python/TypeScript/Rust）。想要 `sk` 短命令，把 `tools/sk` 加入 PATH 后，在该目录用一次性命令生成本机 launcher（已 gitignore，不入库）：

```powershell
Set-Content sk.cmd '@bun "%~dp0sk.ts" %*'
```

或者不装 launcher，直接 `bun tools/sk/sk.ts <命令>`。

## 模型

- **库** = 本仓 `plugins/<组>/skills/<技能>/` 与 `vendor/<组>/skills/<技能>/`（Agent Skills 标准格式，SKILL.md）。
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
sk rm <profile> <模式...>     移除技能
sk sync <profile>             重生成派生文件、清理失效链接
sk restore <profile>          按 manifest 重建 junction（新 clone 后执行）
sk run <profile> omp|claude [参数...]   按 profile 启动 session
```

## 约定

- 特殊 profile：`all`（全部技能）、`general`(通用兜底，由主人策展)。
- bmad、speckit 这类成套框架按原子组进出（`@bmad`），不单挑。
- junction 与 overlay.yml 不入 git（`profiles/.gitignore`）；manifest.json 入 git，换机器后 `sk restore <profile>`。
- 同名冲突：`sk add` 遇到跨组同名技能会拒绝并列出双方，`sk list` 会标记 ⚠。
