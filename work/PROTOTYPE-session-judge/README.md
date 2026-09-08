# PROTOTYPE：会话裁判（一次性代码，不进 main）

2026-09-08 回答的问题：把会话记录压成时间线、交给一个干净的裁判 AI 按固定判据判，结果对主人有没有用。

结论（主人原话「还挺合理的，抓出来好多问题」）：有用。两个真实 Claude 会话各判五条，一个判准，一个判错两处——两处都定位到喂料不全（时间线缺 agent 发言；判据缺常设授权），不是裁判本身。

用法：`node extract.mjs <会话.jsonl> > timeline.md`，再把 `rubric.md` 与 timeline 拼起来喂 `claude -p --model claude-haiku-4-5-20251001`。时间线含主人私人发言，不入仓。
