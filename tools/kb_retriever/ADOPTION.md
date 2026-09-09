# KB 检索器主动问路采用与集成指南

本指南说明 Agent 或其他调用者怎样在需要知识时主动向 KB 检索器问路。调用者显式给出可信的 `stage`、`object` 与现场 `signals`，检索器从 `_archive/knowledge/retrieval-cards.md` 返回一张最短动作卡；调用者再选择是否读取来源、采用候选。检索器不替代来源 K 包、权限检查或产品决定。

当前证据边界必须保持清楚：卡 A–C 已在两个真实任务的三个决策点完成小样回放，卡 D–V 最多完成当前交付验收与现有场景回放。本目录的集成演示证明现有接口可在三个模拟场景接受显式查询并命中预期卡，但没有验证主动问路的自然采用率、误命中成本、独立自然样本准确率、长期召回率或 Agent 实际采用，因此当前仍是“小样回放有效”，不是产品采用或长期依赖。

## 最小调用

在仓库的 `tools/kb_retriever` 目录运行：

```text
python -m kb_retriever "stage=pre-acceptance; object=agent-plugin.installed-copy; signals=验收 Plugin 三端目标版本与版本化缓存，先处理 CRLF/LF，再比较 SHA-256"
```

机器集成优先使用 JSON 输入和输出：

```text
python -m kb_retriever '{"stage":"pre-capacity-decision","object":"codex.token-burn","signals":["ccusage codex daily --json --offline","比较当日 totalTokens 增量与组成","决定继续加派还是降级停止"]}' --json
```

如果卡片文件不在 CLI 的默认向上查找路径，调用方仍需让 `kb_retriever` 包可导入，并显式传入只读卡片路径：

```text
python -m kb_retriever "stage=pre-worktree-delete; object=orca.worktree; signals=dispatched running 任务绑定 worktree 两仓 main 保护对象 零未提交 零未推送" --cards C:\path\to\agent-control\_archive\knowledge\retrieval-cards.md --json
```

仓库根目录提供一个 Python 接线示例：

```text
python tools/kb_retriever/examples/workflow_checkpoints.py
```

一次可复核的实际运行结果保存在 [`examples/DEMO_OUTPUT.md`](./examples/DEMO_OUTPUT.md)。

## 怎样主动查询

Agent 或其他调用者判断当前任务需要本机知识、并且能从当前操作直接确定 `stage` 与 `object` 时，再主动调用。推荐顺序是：

1. 调用者识别当前知识问题，例如“怎样验收装端副本”“怎样依据 Token 燃烧决定容量”或“删除 worktree 前要核对什么”。
2. 调用者显式填写 `stage` 和 `object`，并从本次实际观察填写 `signals`。
3. 检索器先按前两项硬筛，再在候选卡的 `operation` 与 `signals.aliases` 上计算 BM25。
4. 检索器返回候选及卡号、得分、来源与证据边界；调用者选择是否读取来源或采用 `oneLineAction`。
5. 动作执行仍服从当前任务合同、权限和来源 K 包；卡片本身不增加授权。

不要把这条路径挂到检查点、Hook 或后台宿主上自动运行或推送结果。主动问路应贴近当前知识问题；也不要在任务开头对整段聊天或 Issue 正文做一次泛化检索，然后把结果带到所有后续阶段，那会让旧上下文覆盖当前对象。

## 怎样填写查询上下文

### `stage`

`stage` 是工作流阶段键，必须使用卡片登记的精确值，例如 `pre-acceptance`、`pre-capacity-decision` 或 `pre-worktree-delete`。它应来自当前任务的已知阶段，不应由自由文本猜测。

### `object`

`object` 是当前操作对象的精确类别，例如 `agent-plugin.installed-copy`、`codex.token-burn` 或 `orca.worktree`。不要为了获得命中而改写对象，也不要用相邻对象代替当前对象；硬筛没有候选时，应走未命中回退。

### `signals`

`signals` 只放本次能观察到、且会帮助区分动作的事实：命令名、字段、界面文案、错误词形与用户原话都可以。JSON 输入可传字符串或字符串数组，数组会按顺序合并。

信号应尽量短而具体，例如：

```json
{
  "stage": "pre-capacity-decision",
  "object": "codex.token-burn",
  "signals": [
    "ccusage codex daily --json --offline",
    "比较今日 totalTokens 与 cacheReadTokens",
    "据此决定是否继续加派"
  ]
}
```

不要把期望卡号或卡片动作原文塞进 `signals` 来制造命中。自然任务只记录真实事件、top-k、人工确认结果与实际省掉的分支。

## 怎样读取返回

命中时，JSON 的关键字段如下：

| 字段 | 含义 | 集成处置 |
| --- | --- | --- |
| `matched` | 是否返回安全候选 | 只有 `true` 时才考虑读取或采用候选。 |
| `reason` | `matched` 或 `matched-by-structure` | 前者有词法重合；后者表示唯一硬筛候选但词法得分为零。 |
| `candidateCount` | 硬筛后的候选数 | 用于审计，不是质量分。 |
| `card.id` / `card.title` | 命中的卡片身份 | 与日志绑定，便于回到登记和来源包。 |
| `score` | 当前候选集内的 BM25 分数 | 只用于本次排序与诊断，不跨语料版本比较，也不设全局采用阈值。 |
| `matchedTerms` | 实际发生词法重合的 token | 帮助解释命中，不代表语义理解。 |
| `oneLineAction` | 返回的最短候选动作 | 由调用者选择是否采用，不自动进入上下文，也不扩写成新的规则。 |
| `source` / `evidence` | 正式 K 包与证据上限 | 涉及例外、失效条件或高影响动作时回到来源包复核。 |

`matched-by-structure` 不是错误：它表示调用者已经显式给出唯一的 `stage`／`object`，但信号没有词法重合。调用者可以查看这张结构命中卡，同时应保留 `reason` 和零分记录；若调用者不能确认结构键来自当前任务事实，则不要据此行动，改走人工回退。

## 自然旁路样本怎样记录

不建设常驻监控。只有真实工作中的 Agent 或调用者已经主动问路时，才顺手记录一行样本；没有主动查询就不采样，也不为扩充数据制造任务。为避免把检索结果反向写成金标，顺序固定为：

1. 从当前任务状态与来源 K 包预先写下 `stage`、`object`、原始 `signals`、词面／改述分型，以及「该命中哪张卡」与判断依据；`signals` 不得包含期望卡号或复制卡片动作原文。
2. 再运行检索，记录实际 top-1、正分 top-3、分数、`reason`、候选数与次名差；次名差定义为同一硬筛桶内 top-1 分数减 top-2 分数，桶内不足两卡时记为不可测，不填零。
3. 记录 `top1Correct`。改述样本另记 `paraphraseTop3Miss`：期望卡不在同桶正分 top-3 中即为漏检；结构键兜底命中但期望卡词法得分为零仍算改述漏检。
4. 命中 `invalidates`、人工否决卡片、实际采用与否、回退到哪个 K 包及后续纠正，分别记录；检索正确不等于动作已采用，动作采用也不等于产品采用。

最小字段是：样本 ID、采集时刻、任务／检查点来源、`stage`、`object`、原始 `signals`、词面／改述分型、预登记期望卡与来源依据、实际 top-1／top-3／分数、候选数、次名差、top-1 是否正确、改述是否漏检、失效条件、采用／回退结果和复核者。单次任务可以把这行留在自身证据或 PR 验证记录中；只有形成新的有界评估批时才汇总，不建立另一套长期事件系统。

本仓的固定现有场景回放位于 [`examples/natural_bypass_samples.json`](./examples/natural_bypass_samples.json)，评估器是 [`examples/evaluate_natural_bypass.py`](./examples/evaluate_natural_bypass.py)，本批结果与证据边界见 [`examples/NATURAL_BYPASS_EVIDENCE.md`](./examples/NATURAL_BYPASS_EVIDENCE.md)。这些样本用于验证采集字段和当前卡片排序，不冒充独立在线自然样本。

## 命中与未命中的处置

主动查询命中后：

- 先查看 `oneLineAction`，由调用者选择是否采用；涉及完整解释、例外或高影响动作时，再按 `source` 主动读取对应 K 包，不自动把卡片或来源塞进上下文。
- 在可追溯日志中保留查询场景、卡号、得分、`reason`、来源和人工是否采用；这份日志是以后评估误命中与召回的证据面。
- 一旦现场命中卡片的 `invalidates` 条件，不直接采用候选，按 `source` 主动读取对应 K 包并执行最少复核。
- 卡片动作与任务合同、当前权威或最新明确指令冲突时，以后者为准，并把该卡作为待复核投影处理。

未命中或调用失败时：

- `no-hard-filter-candidate`：保留原工作流，转回 `_archive/knowledge/README.md` 人工选择当前 K 包；不要跳过硬筛做全库裸 BM25。
- `no-lexical-overlap`：多个结构候选均无词法重合，不采用候选并人工判定；不要任取第一张卡。
- `no-ranked-candidate`：把它视为检索器或输入异常，保留现场并停止采用候选。
- CLI 返回码 `2`：输入、卡片或文件读取失败；记录错误并走同一人工回退，不要通过改写卡片语义来绕过失败。

自然任务中的未命中可登记为覆盖缺口，但新增别名或动作以前，来源 K 包仍需先通过知识价值门与可信门。检索投影不能成为过程材料进入当前知识的旁路。

## Python 主动查询形状

显式调用方可以加载卡片并构造 `KnowledgeRetriever`，在需要知识时主动创建兼容名称 `TriggerContext` 并调用 `search`。本仓示例沿用这个查询形状，且没有修改解析、打分或检索生产代码：

```python
cards = parse_retrieval_cards(cards_path)
retriever = KnowledgeRetriever(cards)

outcome = retriever.search(
    TriggerContext(stage=stage, object=object_name, signals=observed_signals)
)
if outcome.match is None:
    route_to_manual_knowledge_index(outcome.reason)
else:
    return_query_candidate(outcome.match.card, outcome.reason)
```

`return_query_candidate(...)` 只表示把查询结果返回给显式调用者，不表示推送到 Agent 上下文。调用方还应把“结构键由谁填写”“失效条件怎样人工确认”“采用结果写到哪里”写入自己的合同；本指南不提供 Hook、后台服务、检查点自动调用或自动写入路径。

## 从演示走向采用

当前推荐的下一阶段不是扩大语料或立即增加语义层，而是观察自然任务中 Agent 是否会主动问路，并在确实发生主动查询时记录：查询上下文、命中与未命中、人工确认、实际采用、覆盖缺口和省掉的决策分支。只有这些样本能回答检索器是否减少了发现成本，同时没有引入不可接受的误命中。

出现经人工确认的改述型 top-3 漏检后，再按 [K14（公共知识检索不以篇数启动向量层）](../../_archive/knowledge/public-knowledge-retrieval-activation.md) 评估语义对照；卡片数量本身不是升级理由。产品采用与长期依赖仍分别需要负责人决定。

本集成工作的来源是关联 [#148（BM25 检索器）](https://github.com/Eridanus117/agent-control/issues/148)与关联 [#150（高频检索卡语料）](https://github.com/Eridanus117/agent-control/issues/150)。
