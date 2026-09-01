# Changelog

本文件记录本仓库面向用户的可见变更。

## [Unreleased]

### Added

- 为 `skill-maintenance` 增加可移植的 Skill 评估合同、配对结果汇总工具和正负触发样例；工具不调用模型、不读取凭据，也不替代真实客户端验收。

## [0.1.1.0] - 2026-08-30

### Changed

- 整理历史归档 Python 实现与测试的导入、上下文管理器和闭包写法，统一静态检查结果。

### Fixed

- 保留归档 CAP/OMP 模块的兼容导出，并修正 Python 3.11+ 的 UTC 时间写法。

## [0.1.0.0] - 2026-08-27

### Added

- `configs search` 支持基于 SQLite FTS5 的 BM25 配置修订搜索，并提供可重建索引与 JSON 输出。

### Changed

- 明确 OMP 核心 MVP、已激活的 Claude Code adapter 与仍 Deferred 的 Codex CLI 之间的合同边界。
- 将 explicit resume、opaque native Session locator 与 lease-fencing 明确为当前版本的 `N/A / Deferred` 目标态能力，不再作为当前 MVP 验收门。
- 同步 Epic 3/4 的完成状态、Claude adapter parity gate、物化清理与验证证据，保持外部 `ValidationDecision` 的 append-only 边界。
