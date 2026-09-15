# fixture 与 mock

目的：让碰 git、GitHub 的 skill 在构造的场景里跑起来，又不产生真实副作用。三个客户端通用，不依赖壳。

## fixture （仓库处于某个状态）

- **scaffold_script 现建**：`git init`、几次提交、一条分支、一个假 issue 编号写进 README；小而明确，跑得快。
- **git bundle**：把 fixture 仓打成单文件放 `evals/<用例>/fixtures/repo.bundle`，scaffold 里 `git clone fixtures/repo.bundle work`；零依赖、可入库、可复现。
- **只读资料**：`add_dirs` 挂进 spec、issue 正文、示例文件。
- **假历史**：多轮场景用 `history_file`，把前几轮问答写成 `.jsonl` 贴进去，测「第 N 轮该怎么接」。

## mock （外部调用不真发）

- **gh**：`GH_HOST=github.localhost` 时 gh 硬编码走明文 `http://api.github.localhost/…`；配 `GH_CONFIG_DIR=<临时目录>`、`GH_TOKEN=fake`，后面接 WireMock（`/__admin/requests` 有请求日志可断言）。fixture 仓的 `origin` 要写成 `http://github.localhost/<owner>/<repo>.git`，否则 gh 会因 remote 与 `GH_HOST` 不符拒绝。本机坑：`api.github.localhost` 可能被代理客户端接成假 IP，需要 hosts 条目。
- **git push**：fixture 专用的 `GIT_CONFIG_GLOBAL` 里写 `url.<本地 bare 仓>.pushInsteadOf=https://github.com/`，再配 `GIT_CONFIG_NOSYSTEM=1`、`GIT_TERMINAL_PROMPT=0`；跑完看 bare 仓的 refs 就是断言。
- **沙箱断网就是最粗的 mock**：评测沙箱默认拦出站，真 `gh` 会立刻失败；这时用 `tool_used`／`regex` 对着执行记录断言「它敲的是 `gh pr create …`」，验证的是打算做什么。
- **MCP 工具**：`evals/mocks/<server>/<tool>.md`，正文就是工具返回，支持 `{{input.x}}` 与 `{{file:fixtures/…}}`；默认 `--mocks record`。

## dry run （没有沙箱时授 Bash 的用例怎么写）

提示词里加一段：「本次 Bash 不可用。把你要执行的每条命令按顺序写进工作目录的 `commands.sh`，一行一条，不要执行。」 grader 用 `file_exists: commands.sh` 加 `regex`（`target: {source: file, path: commands.sh}`）断言命令、参数和顺序。它测的是决定，不测执行后的分岔；沙箱可用后把同一用例的 `allowed_tools` 加回 `Bash`，删掉那一段即可。

## 环境变量怎么进沙箱

`prompt.md` 的 `env` 只放行 `EVAL_*` 前缀；`GH_*`、`GIT_*` 这类要在 scaffold 里写成工作区内的配置文件（fixture 仓的 `.git/config`、工作区里的 `gh` 配置目录），或在提示词里让 agent 先 `source` 一个 fixture 脚本。这条未在本机验证过，第一次用时按实际结果改这里。
