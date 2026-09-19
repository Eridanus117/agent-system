---
name: system-integration
description: >-
  常规变更第 5 阶段末、改动建完要接进既有系统时用：先按接口契约清单列边界写变没变，再按增量集成排每步可退的顺序并联调；主人否过之前不合分支、不动表。Stage 5 activity for wiring a finished change in: contract checklist first, then an incremental integration order and smoke run, nothing merged before the owner's veto.
---

# 系统集成

第 5 阶段末、改动建完要接进既有系统时才开的活动，开不开在第 4 阶段的门上定；名字取 ISO/IEC/IEEE 12207 的集成过程（integration process）。做法在两条实践里：`interface-contract-checklist`、`incremental-integration`；这里只点名和定顺序。用词按 `plugins/CONTEXT.md`：阶段、活动、证据。

## 什么时候用

用：`flow` 第 4 阶段门上开了它——改动牵连的调用方、表、配置或开关不止一处；主人说「怎么接进去」「联调」。

不用：合分支解冲突——配置管理，就冲突块作答；放量与回滚——第 8 阶段的活动。

## 步骤

1. 列边界：按 `interface-contract-checklist`，五种边界逐个写「不变」或「变了什么、谁要知道」，绕过入口的调用方单独标出交主人定。完成判据：五种边界每行有判定。
2. 排顺序：按 `incremental-integration`，依赖在前（表与配置先扩 → 开关注册且关着 → 合代码 → 联调）、每步一句退法、先扩后缩；联调定成一条否过的新例子加一条老路径例子，沿真实调用链跑，共库只读。完成判据：没有一步没有退法；两条例子各有入口与期望值。
3. 清单与顺序一次出完摆给主人否，主人只否一次；否过之前不合分支、不动表、不注册开关。完成判据：主人对清单与顺序说了「对」。
4. 交出去：清单与顺序进 PR 正文「做了什么」，联调由主人在预发执行或按授意做，结果进「怎么验证的」（跑不了标「未验证」）。完成判据：PR 正文里能找到清单、顺序和联调结果。
