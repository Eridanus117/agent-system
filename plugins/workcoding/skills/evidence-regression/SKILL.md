---
name: evidence-regression
description: 要证明老流程一点没变、新流程是对的时候用：改代码前用 Arthas 或日志把一批真实出入参录成仓内母版文件，改后回放逐字节比对，可选影子流量；证据是仓里的文件不是一句「跑过了」。这是 Golden Master / Approval Testing。触发语「怎么证明没改坏」「回归」「出入参采集」。由 workcoding 路由进入。
---

# 证据回归

代码写完后要回答两句：老流程一点没变，新流程是对的。agent 说「跑过了」不算证据，能进 diff 的文件才算。这是 workCoding 四段里「证」段的规程，实践是 Golden Master（又叫 Approval Testing，Feathers 一脉，Java 有 ApprovalTests 库），配套标准 ISO 29119 的测试记录要求。测试资产一律进代码仓，不进测试平台（2026-09-02 主人裁定）。

## 规程，五步

| 步 | 做什么 | 槽位里的实践 |
|---|---|---|
| 1 选样本 | 从需求翻译的例子加真实流量里挑一批请求，覆盖新路径的每条 EARS 句和老路径的每个主要分支；每条标业务场景名 | 例子复用；等价类 |
| 2 采集母版 | 在改代码**之前**，用 Arthas 或日志把这批请求的出入参原样录下来，存成仓内文件（一请求一文件，JSON），这就是母版。含时间戳、随机 id 的字段先规整掉 | 录制回放；Golden Master |
| 3 回放比对 | 改完后，同一批请求喂新代码：老类别请求的输出必须与母版逐字节一致；新类别请求的输出与需求翻译第 3 步的期望值一致。写成单测，母版文件是测试的输入与期望 | ApprovalTests；特征化测试 |
| 4 影子流量（可选） | 分流前，在预发让新老路径同时算、只返回老结果，异步比对差异。有副作用的路径不做 | 并行运行 Parallel Run；Scientist |
| 5 留 | 母版文件、回放测试、比对结果一起进同一个 PR；灰度期再按 `发布与观测.md` 第 3 步用 SLS 样本比对 | 测试资产入仓 |

## 产物样例

```
samples/freight/首重续重-新疆-vip.request.json      ← 请求
samples/freight/首重续重-新疆-vip.approved.json     ← 母版（改代码前录的）
FreightGoldenMasterTest.java：对 samples/ 逐个回放，老类别 assertEquals(approved, actual)
                                新类别 assertEquals(expectedFrom需求翻译, actual)
```

## 备选与不选理由

见 `实践备选库.md` 槽位二：属性测试适合规则密集处补充；对账适合结算；契约测试已排除。
