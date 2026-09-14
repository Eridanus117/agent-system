# plugin_release

**会话从版本缓存加载 Skill。工作树只是 Marketplace 源。** 本工具守的是这条线。

## 这条结论是实测出来的，而且推翻了两轮推断

2026-08-15 对两个运行端各做一次直接测试：在工作树里给一个插件的 manifest `description` 植入未提交标记，然后起一个**真实的新会话**问它这个 skill 的 description。

```
工作树（含未提交标记）  PROBE-MARKER-8F2A …
新 Claude 会话报出       仅在用户直接要求 grilling／盘问…   ← 缓存里的旧值
新 Codex 会话报出        仅在用户直接要求 grilling／盘问…   ← 缓存里的旧值
```

在此之前本工具曾据 `claude plugin details` 的 on-invoke 估算随工作树变化，判定「会话读工作树、缓存没人读」，并把告警逻辑整个对调。那是**拿 CLI 检视命令的显示去推断会话行为**——CLI 算的是「装了会是多大」，与会话加载是两条代码路径。来回三轮的完整证据见 [`agent-system#11`](https://github.com/Eridanus117/agent-system/issues/11)。

**边界**：以上是 manifest 层的直接实测。`SKILL.md` 正文没有单独测——插件作为一个整体装进同一个缓存目录（含 manifest 与 `skills/` 全部文件），正文同源是推断，不是实测。

## 由此得到两条判据

1. **缓存与应有内容不一致 = 运行端正在按错的正文干活。** 唯一会改变行为的事实。最危险的一档 `modified`（版本号相同、内容不同）只有整树摘要看得见。
2. **「应有内容」是 `origin/main`，不是工作树当前检出。** 工作树停在特性分支或有未提交改动时，缓存与它不同是正常的，此时判不出缓存对不对——`check --hook` 会如实说「判不出来」，而不是假装没事。

`agent-plugins` 的版本声明分散在六处（两端 `plugin.json`、两份 Marketplace、符合性声明、README 版本总览），它们是否互相自洽由该仓 CI 判定。本工具不重复那一层。

## 用法

```
python tools/plugin_release/plugin_release.py check              # 默认；一致返回 0，漂移返回 1
python tools/plugin_release/plugin_release.py check --json       # 机器可读
python tools/plugin_release/plugin_release.py check --quiet      # 一致时不输出，只给退出码

python tools/plugin_release/plugin_release.py release <插件> [--part patch|minor|major]
python tools/plugin_release/plugin_release.py release <插件> --apply    # 默认演练，加 --apply 才执行
```

`release` 五步，任一步失败即中止：

1. **前置检查**——源仓存在、是 git 仓库、工作树干净（`--allow-dirty` 可放行，但发布会与你的改动混在一起）。
2. **同步六处版本声明**——每一处都必须恰好匹配一处；不是恰好一处就硬失败，因为发布时改错地方和漏改地方都是静默事故。
3. **跑符合性测试**——`targets.json` 里列出的两份，任一不过即停。
4. **安装到三个运行端**。
5. **指纹验收**——装完重新比对整树摘要。安装命令报成功但内容对不上时，不相信安装回执。

`release` 不提交、不开 PR、不合并。它结束时源仓有六处未提交改动，后续归你。

## 判定档位

| 档位 | 含义 | 是否失败 |
| --- | --- | --- |
| `ok` | 声明版本已装且整树逐字节一致 | 否 |
| `modified` | 声明版本已装，但内容不同——版本号在骗人 | 是 |
| `stale` | 只装着别的版本 | 是 |
| `missing` | 该运行端完全没装这个插件 | 是 |
| `alias` | 缓存目录与另一个运行端是同一实体，本次不构成独立验证 | 否 |

另外报告「非当前版本的缓存目录」：只占盘，不影响正确性，因此不判失败。运行端不会自动清理它们（曾累积到 76 个）。

## 一个必须知道的事实

三个运行端的 `agent-plugins` Marketplace 都注册为**本机目录源，直接指向工作树**：

```
Claude      {"source": "directory", "path": "C:\\Users\\<user>\\workspace\\agent-plugins"}
Codex       source_type = "local", source = '\\?\C:\Users\<user>\workspace\agent-plugins'
Orca Codex  同上
```

因此「源」是工作树的**当前检出**，不是 `origin/main`。在 `agent-plugins` 里切到特性分支，运行端下次安装到的就是那个分支的内容。`check` 因此总是先报分支、干净度和相对上游的位置；不在 `main` 或工作树不干净时会额外提醒。

## 三个运行端，两份缓存

实测：Orca 的 Codex home 里 `plugins` 是指向 `~/.codex/plugins` 的 junction。

```
%APPDATA%/orca/codex-runtime-home/home/plugins  ->  C:\Users\<user>\.codex\plugins
```

因此**「Orca 内的 Codex」与「普通 Codex」共用同一份插件缓存**，只有 home（配置、会话、hooks、`AGENTS.md`）是分开的。物理缓存是 **2 份，不是 3**。

把它当第三份独立安装态去比对会得到重复计数——同一次验证数两遍，看起来「三端一致」，实际只验证了两份。工具因此按 `realpath` 归并，别名端记为 `alias`，`release` 也跳过对它的重复安装。

这不影响正确性判定：漂移发生时，主端会如实报出。

## 配置

`targets.json`：源仓位置、六处声明的路径模板、三个运行端的缓存根与安装命令。运行端路径按 `home` 或 `environment`（环境变量）解析，因此不把绝对路径写死在代码里。

Orca 内的 Codex 用 `CODEX_HOME` 指向它自己的运行时 home——已实测该覆盖对 `codex plugin` 生效。

## 边界

- 只读本机文件与源仓；`check` 不写任何东西。
- 不判定版本化来源是否自洽，那是 `agent-plugins` 仓 CI 的事。
- 不提交、不推送、不合并、不改远端。
- 不是常驻进程，没有轮询和调度器；要么你运行它，要么由会话启动钩子运行它。
