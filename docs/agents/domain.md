# Domain 文档

工程类技能在探索本仓代码前，应该怎么读本仓的领域文档。

## 动手探索前先读这些

- 仓根的 **`CONTEXT.md`**，或
- 仓根的 **`CONTEXT-MAP.md`**（若存在）——它指向每个 context 各自的 `CONTEXT.md`。读与当前话题相关的那几份。
- **`docs/adr/`** —— 读与你即将动的那块相关的 ADR。多 context 仓里还要看 `packages/<name>/docs/adr/` 下 context 范围内的决定。

**这些文件不存在时，静默继续。** 不要提示它们缺失，也不要建议预先创建。`/domain-modeling` 技能（经 `/grill-with-docs` 与 `/improve-codebase-architecture` 触达）会在术语或决定真正被敲定时**懒创建**它们。

## 文件结构

本仓是**多 context**（仓根出现 `CONTEXT-MAP.md` 即为此形态）。context 的载体是 `packages/` 下的包，不是模板默认的 `src/`：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 跨包、系统级决定
└── packages/
    ├── control-plane/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 该包范围内的决定
    └── sk/
        ├── CONTEXT.md
        └── docs/adr/
```

上图是**形态示例，不是当前清单**。哪些包真的需要自己的 `CONTEXT.md`，等 `/domain-modeling` 第一次要落一个术语时再决定并写进 `CONTEXT-MAP.md`；不预先枚举。

## 本仓既有的 ADR 约定

`docs/adr/` **在本次配置之前就已存在**，模板用 MADR（Markdown Any Decision Records），2026-09-04 负责人裁定采用。规则见 `docs/adr/README.md`：文件名 `NNNN-短标题.md`，四位编号递增，标题用中文；复制 `template.md`，节名不改。

**沿用它，不要另起一套。** 判据一句话（引自该 README）：日后有人会问「当初为什么这么选」的，写 ADR。

## 用词汇表里的词

当你的产出里出现一个领域概念（issue 标题、重构提案、假设、测试名），就用 `CONTEXT.md` 里定义的那个词。不要漂移到词汇表明确要避免的同义词。

如果你需要的概念还不在词汇表里，这是个信号——要么你在生造这个项目不用的语言（重新考虑），要么确实有个缺口（记下来交给 `/domain-modeling`）。

本仓 `AGENTS.md` 另有术语纪律：概念优先用业界既有名词，首次出现附英文原词；确需自造术语时当场定义并显式标注「自造」。两者一致，`CONTEXT.md` 是该纪律的落盘处。

## ADR 冲突要挑明

如果你的产出与既有 ADR 相抵触，显式说出来，不要悄悄覆盖：

> _与 ADR-0007（事件溯源的订单）相抵触——但值得重开，因为……_
