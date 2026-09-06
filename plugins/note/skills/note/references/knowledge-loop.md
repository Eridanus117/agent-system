# 知识闭环命令

目标库 `AGENTS.md` 管内容规则；本页只补实际 CLI 的读写边界，不负责安装或配置迁移。

## 入口与作用域

- Agent 从当前进程解析 `rhizome`、`memex`、`memex-sync` 的实际可执行文件，并按需读其子命令 `--help`。已安装清单不等于当前入口；源码 dispatcher 或临时脚本跑通不等于正常 CLI 可用。缺入口就明确反馈，不另造包装器或兼容副本。
- 从当前工作区入口和有效 `kb-sources.toml`（含本机覆盖）取得逻辑 source 名与物理源根。`KB_SOURCES` 是两工具共有的显式 registry 定位；已有设置不改写。源根可以是 Git 仓的子目录，不用外层 Git 仓名或磁盘目录名替代登记 identity。
- 下文 `<source>`、`<源根>`、`<compiled目录>`、`<笔记路径>` 都由 Agent 从有效配置和实际文件解析并替换，不让用户填写。确认 Memex lexical 正在读本次编译的 compiled 目录；只核对必要配置，不输出凭据。

## 先检索并读正文

```text
memex query "现实问题或关键同义词" --lane lexical --format json
```

明确使用离线 lexical，不调用默认 hybrid 的 `memex recall`。需要缩小范围时加 `--repo <source>`；跨库结果保留来源标记。输出 `hits[].object_key` 是 identity，`repo` 是 source 名，`path` 是相对源根的正文路径；按登记解析到文件，用普通读取工具读正文后再回答或合并。

没有命中、源未索引或命令失败时，读目标库 `index.md` 并在其正文范围做同义词文件检索。索引可能不新鲜，不能据空结果直接新建。

## 写后校验与本地索引

按目标库规则保存正文及人工索引，执行目标库现有检查；Rhizome 单篇检查入口是：

```text
rhizome check "<笔记路径>" --json
```

在已确认写入所有权的目标源和 compiled 目录上执行：

```text
memex-sync compile --repo "<source>=<源根>" --out "<compiled目录>"
```

- **`compile` 默认真实落盘并清理该源的陈旧 compiled 产物**；仅预览要显式加 `--dry-run`。它不接受也不需要 `--apply`，不是向量同步。
- 显式 `--repo` 只处理目标源；不裸跑全 registry 编译，不自动加 `--force` 绕过清理守卫。`--out` 必须是后续正常查询所读的同一目录；临时 `--out` 的成功只证明隔离实验。
- 任一非零退出码或完整性告警都显式报告；即便部分正文已编译、查询也有命中，不能说完整同步成功。记录命令、退出码和错误，保留 Markdown 与人工索引，并用文件读取证明正文仍在。没有索引写权时同样报告未同步，不越权补配置。
- 基础闭环不运行 `sync --apply`、semantic 或 hybrid，不因索引问题自动启动服务、安装工具或调用计费模型。

编译后重跑同一正常入口的 lexical 查询，用用户下次会问的措辞核对预期 identity／路径，再读回正文；报告正文结论与来源。校验、编译、查询、正文回读各自报告结果，任一环未完成就保留其明确状态。
