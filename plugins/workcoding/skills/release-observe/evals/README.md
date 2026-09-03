# release-observe 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 release-observe 特有的部分。

## 用例构成

6 个 case：2 个 `behavior`（应触发）+ 4 个 `trigger`（不应触发）。

两个 behavior case：有配置中心与分流开关的常规灰度；没有开关系统的小工具（测预演发现 5 的降级：环境变量当开关、退化为开/关两档，待裁定）。

**4 个不应触发的 case 就是路由边界的可执行版本**：

| case | 该归谁 |
|---|---|
| `integration-question` | `integration`（接入顺序与联调） |
| `golden-master-question` | `evidence-regression`（仓内母版回放） |
| `plain-question` | 直接答（讲四个黄金信号） |
| `slo-design-request` | 6.4.12 长期形态，备选里已排除 |

## 与被测 SKILL.md 的对应

| 铁律 / 工位 | 测它的断言 |
|---|---|
| 铁律 1 回滚即关开关 | `rollback-is-toggle-off` |
| 铁律 2 一句一观测、老路径四个信号 | `one-observation-per-sentence` |
| 铁律 3 每档主人裁定、agent 不开开关 | `owner-decides-no-toggle` |
| 工位 1 三档各写放谁停多久 | `three-tiers-with-who-and-how-long`、`degrades-to-two-tiers` |
| 工位 4 演示用需求翻译的例子 | `smoke-with-example` |

## 首轮实跑（2026-09-02，`gpt-5.6-luna`）

跑法：隔离 HOME、`--no-rules`、`--config overlay.yml`、`--mode=json`、每 case 独立空 cwd；with_skill 只装本 skill；baseline `--no-skills`。SKILL 内容哈希 `5a70fba81606`。跑前跑后四个仓与全部 worktree 无新增；cwd 无文件。

### behavior：两模式对照

| case | baseline | with_skill |
|---|---|---|
| `rollout-plan-with-toggle` | 读了一次 cwd，输出长文：发布原则、配置中心优先级（黑名单 > 白名单 > 百分比）、发布前闸门表、财务闸门、阶段 0 起的多阶段——**没有「每档主人裁定」，把「指标正常即进下一档」当规则** | 只读本 skill，输出规定形态：改动/分流条件/开关，三档各写放谁停多久（白名单模板 1032 半天 → 5% 一天 → 全量），回滚关 `remote_fee_by_province` 不回滚代码并写明前提，两条需求句各一个观测点加老路径四个信号，演示用模板 1032 新疆期望 26，「主人裁定前不开开关、不改比例、不发公告」。5 条断言全过 |
| `no-toggle-system` | 无工具调用，给制品版本、环境变量、单次灰度、全量、回滚的完整方案——写得对，但**没有说这是降级**，也没有等主人 | 只读本 skill，仍按三档写但明确「如果环境变量是进程级配置，不能诚实实现百分比灰度」，最后建议「关闭 → 单次开启验证 → 全量开启，不伪装成百分比灰度」；回滚是清除 `REMOTE_FEE`；一条需求句三个观测点加老路径四个信号；每档主人裁定。5 条断言中 `degrades-to-two-tiers` 部分通过：说了退化但没把它标成「待裁定」 |

差值一句话：没有 skill 时 agent 写一份自动推进的发布流程；有 skill 时每档停下等主人，且不假装有不存在的放量能力。

### trigger

| case | 结果 |
|---|---|
| `integration-question` | 试读未装的 `skill://integration`，**又读了本 skill**，但输出是接入顺序与联调步骤，没有放量三档。读了没按它行动——边界守住一半 |
| `golden-master-question` | 无工具调用，给录制回放方案。没读本 skill |
| `plain-question` | 无工具调用，直接列四个信号 |
| `slo-design-request` | 无工具调用，给 SLO 与错误预算方案。没读本 skill，没改写成三档 |

### 单轮测不到的

线上演示、每档观测结果、主人裁定后的开关操作，都要在工作机上发生。

## 状态

**未验证。** 隔离单轮 8 次。真正的判据是在工作机上把一条真实改动放出去，每档有没有真的停下等主人。
