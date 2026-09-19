---
name: golden-master
description: >-
  要证明改完之后老路径一点没变、新路径是对的时用：以改动前的行为为母版（approved 文件），改后回放同一批请求逐字节比对；老类别比母版，新类别比需求例子的期望值，两类分开写；母版、回放测试、比对结果进同一个 PR。Golden master (approval testing): lock pre-change behaviour as approved files, replay after the change and compare byte for byte; old categories against the master, new categories against the expected values from requirement examples.
---

# 母版比对（golden master）

来源：母版比对（golden master，J. B. Rainsberger 推广的叫法；ApprovalTests 库叫它 approval testing，Llewellyn Falco），用改动前的输出锁住既有行为，与 Feathers《修改代码的艺术》的特征化测试（characterization test）同源；配套标准 ISO/IEC/IEEE 29119 对测试记录的要求。改完代码要回答两句——老流程一点没变，新流程是对的；「跑过了」不算，能进 diff 的文件才算。样本从 `record-replay` 来，本实践只管母版是什么、怎么比、比完放哪。用词按 `plugins/CONTEXT.md`：证据。

## 什么时候用

用：改动碰了既有路径，验收要求老路径的输出不变；样本已按 `record-replay` 录好或正要录，要写回放比对、要判 diff、要定母版放哪。主人说「怎么证明没改坏」「母版」「approved」。

不用：从零新建、没有老路径——没有可锁的行为，正确性归需求例子与 `tdd`。只锁一条入参证走读没编，那是特征化测试的用法，归 `characterization-test`。灰度期拿线上样本比对归 `canary-release`。分流前让新老同时算、只返回老结果的并行运行（parallel run，martinfowler.com；GitHub 的 Scientist 库）不在本实践里，样本够就不做。

## 步骤

1. 定母版的来源。母版（approved 文件）是改动之前的行为。来不及在改前录的，用关着的分流开关、改动前的提交或旧构建去录，前提是老可执行路径的 diff 为零，先验这一条（静态看老路径的 diff），录下来的标「改前等价」。改后的输出不是母版：拿它当母版，比的是代码和自己，永远通过。完成判据：每个 approved 文件能说出录自哪个提交或哪个开关状态。
2. 分两类写比对。老类别（改动前就有的请求）：序列化后的实际输出与 approved 文件的文本逐字节相等，不挑字段比。新类别（改动引入的请求）：与需求例子的期望值相等，期望值是独立的字面值，不从当前输出生成 approved。两类各自成测试，名字说清证的是「老路径没变」还是「新路径对」。完成判据：每条比对能指出它属于哪一类、期望值从哪来。
3. 写成仓内的回放测试。母版文件当输入与期望，用项目已有的测试框架；布局沿用 `record-replay` 的样本目录，回放测试类放在旁边。完成判据：样本目录里的 `<场景>.request.json`、`<场景>.approved.json` 与回放测试在同一处，测试命令能跑。
4. 读 diff。红了先看差在哪个字段：每次都变的字段（时间戳、随机 id）归 `record-replay` 的规整规则，不是行为差异；预期之内的改变，主人说了算才更新 approved；预期之外的就是改坏了，回去修。完成判据：每条红的比对归入规整、主人认可的更新、bug 三种之一。
5. 三样进同一个 PR：母版文件、回放测试、比对结果（命令与退出码，贴法按 `verify-evidence`）。测试资产进代码仓，不进测试平台（2026-09-02 主人定）。完成判据：PR 的 diff 里能看到三样。

## 产出

approved 文件、回放测试、比对结果，都在改动的 PR 里。

## 为什么在哪

- agent-system#122（从 `evidence-regression` 拆出）、agent-system#115（spec）、ADR-0006（分层与术语）。
- 与标准的对照、备选（属性测试、对账、契约测试）与不选理由：个人知识库《证据回归》。
