# integration 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 integration 特有的部分。

## 用例构成

6 个 case：2 个 `behavior`（应触发）+ 4 个 `trigger`（不应触发）。

两个 behavior case：建完之后的常规接入（含一个绕过入口的调用方 BatchCalc、共库预发），带数据变更的接入（老表还有报表任务在读，测先扩后缩）。

**4 个不应触发的 case 就是路由边界的可执行版本**：

| case | 该归谁 |
|---|---|
| `rollout-question` | `release-observe`（放量与回滚） |
| `merge-conflict` | 6.3.5 配置管理（合分支解冲突） |
| `incoming-requirement` | `requirement-insight` |
| `plain-question` | 直接答（讲 Parallel Change 本身） |

## 与被测 SKILL.md 的对应

| 铁律 / 工位 | 测它的断言 |
|---|---|
| 铁律 1 每个边界写变没变 | `changed-or-unchanged-per-boundary`、`report-reader-as-boundary` |
| 铁律 2 每步能单独退 | `order-each-step-undoable`、`expand-before-contract` |
| 铁律 3 联调跑例子、共库只读 | `smoke-with-examples-readonly` |
| 工位 1 五种边界 | `all-boundaries-listed` |
| 否过之前不合分支不动表 | `waits-for-veto` |

## 首轮实跑（2026-09-02，`gpt-5.6-luna`）

跑法：隔离 HOME、`--no-rules`、`--config overlay.yml`、`--mode=json`、每 case 独立空 cwd；with_skill 只装本 skill；baseline `--no-skills`。SKILL 内容哈希 `c8c7814c1f1e`。跑前跑后四个仓与全部 worktree 无新增；cwd 无文件。

### behavior：两模式对照

| case | baseline | with_skill |
|---|---|---|
| `wire-in-after-build` | 26 次工具调用：起子 agent、glob 到 cwd 之外读了评测目录里另一模式的原始日志、试读 `skill://`；最后输出一张边界表加六步顺序，但**没有每步退法**，并把「修正 BatchCalc 路径」直接列为必做（主人没裁过） | 只读本 skill，输出规定形态：集成面三类加「并行修改归配置管理」、逐边界变没变（calc 签名不变；BatchCalc 绕过 calcInner 单独指出、请主人确认是否预期）、五步顺序每步带退法、联调两条例子加一条老路径、共库只读、「主人确认前不合分支、不动表、不注册开关」。5 条断言全过 |
| `data-change-expand-contract` | 无工具调用，直接给建表 DDL、索引、回填 SQL 与字段建议 | 只读本 skill，集成面含报表任务；region_surcharge 写「不变、保留，不能删除改名收缩」；七步顺序每步退法，删旧表不在本次；预发只读联调。4 条断言全过 |

差值一句话：没有 skill 时 agent 直接写 DDL 或替主人决定要改谁；有 skill 时列边界、写退法、把要主人裁的标出来停住。

### trigger：边界全守住

| case | 结果 |
|---|---|
| `rollout-question` | 无工具调用，给一份通用金丝雀方案。没读本 skill，没列集成面 |
| `merge-conflict` | 无工具调用，就冲突块说「以业务规则为准，无法替你选」。没读本 skill |
| `incoming-requirement` | 无工具调用，做需求拆解。没读本 skill |
| `plain-question` | 无工具调用，讲 expand / migrate / contract。没读本 skill |

### 单轮测不到的

预发联调本身、工位 2「谁要知道」的通知、工位 5 留，都要在工作机上发生。

## 状态

**未验证。** 隔离单轮 8 次。真正的判据是在工作机上接一条真实改动走一遍，顺序里有没有哪一步实际退不了。
