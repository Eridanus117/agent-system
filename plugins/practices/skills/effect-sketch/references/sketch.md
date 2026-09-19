# 草图的形状

三行加一行来源，边上标事实还是假设：

```
改动点｜<方法或字段>
调它的｜<A>（<文件>）、<B>（<文件>）；绕过它直调 <里层方法> 的：<C>（<文件>）
它调的｜<X>（<文件>）、<Y>（<文件>）
待核实｜<模块或边>：为什么拿不准；怎么核实（grep 什么 / 抓一条什么请求看栈）
假设｜<默认前提，如「所有调用都走改动点」>
```

## 例子：给命令行笔记工具的 `render(view, opts)` 加 JSON 输出

```
改动点｜`src/output.ts` 的 `render(view, opts)`
调它的｜`list` 命令（`src/cli.ts`）、`show` 命令（`src/cli.ts`）；绕过它直接 `console.log` 的：`export` 命令（`src/export.ts`，自己拼字符串）
它调的｜`table()`（`src/output.ts`）、`chalk`（依赖）
待核实｜`src/plugins/` 里第三方插件会不会直接调 `table()`：目录没贴；核实：`grep -rn "table(" src/plugins`
假设｜所有终端输出都经过 `render`（`export` 已证明不是）
```
