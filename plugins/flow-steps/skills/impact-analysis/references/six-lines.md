# 六行的形状

```
问｜<要回答的问题> → 进决定：<哪个决定>
假设｜<为回答它先假定了什么>
草图｜调它的：<一跳>；它调的：<一跳>；绕过它的：<谁>；拿不准的边：<哪几条>
证据｜<抓了哪条请求，看到什么 / 待主人在工作机上跑：命令>
结论｜<数或判断>，置信 <高/中/低>，未验证：<哪条假设>
留｜<那个决定的记录>；目标仓文档加：<新发现>
```

## 例子：命令行笔记工具改 `render` 的输出口，开关放哪

```
问｜有没有绕过 `render` 直接写终端的命令 → 进决定：JSON 开关放 `render` 入口还是每个命令各接
假设｜所有终端输出都走 `render`
草图｜调它的：`list`、`show`（`src/cli.ts`）；它调的：`table()`、`chalk`；绕过它的：`export`（`src/export.ts` 自己 `console.log`）；拿不准的边：`src/plugins/` 下第三方插件（目录没贴）
证据｜待主人跑：`grep -rn "console.log\|process.stdout" src/plugins`
结论｜至少 1 个命令绕过 `render`，置信高；开关放 `render` 入口会漏掉 `export`，要么 `export` 单独接，要么先把它收进 `render`；未验证：插件目录
留｜spec issue 的方案评论；目标仓 CLAUDE.md 加「`export` 不走 `render`」
```
