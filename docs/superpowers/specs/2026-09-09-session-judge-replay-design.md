# 会话评分第二片：回放台（sj replay / sj score）设计

日期：2026-09-09。承接 [第一片设计](2026-09-08-session-judge-design.md)，替换其中「部件一：题库」与「部件三：改错重做」两节；第一片的抽取器、机械检查、评委运行器原样复用。题目形态照 Superpowers 作者的评测台 Quorum（prime-radiant-inc/superpowers-evals）抄形态不抄代码；运行器在 Windows 原生自建，不用 WSL2。

## 一句话

一套专门造的题，每道题无头起一个 Claude Code 或 OMP 会话，Haiku 按剧本扮主人回话，跑完拿第一片的尺子判，出 pass / fail / indeterminate。主人只做一件事：出题时给每道题写一句判据。

## 主人已定（2026-09-08 至 09-09，不重开）

- 题库改为专门造的任务，小任务和大任务都有；本质是对这套 agent 工作能力的评测。真实会话退回监控用途，不再当标准答案。
- 「主人判十道标准答案」改为「每道题写一次验收判据」。第一片那道「标准答案不满十道不出分」的闸不再管回放。
- Windows 原生自建，跑 Claude Code 与 OMP 两个 CLI。
- 第一版带 QA agent 按剧本回话（选 A）；每道题在文件头定最多几轮，写 1 轮即只到第一道门。
- 运行器并入 `packages/session-judge`，加 `sj replay` 与 `sj score` 两个命令（选 1）。
- 被测 agent：Claude 侧 Sonnet，OMP 侧 luna（主人日常配置的 GPT）；QA agent 默认 Haiku。模型都是参数，出问题再换；要给某个 PR 出正式分时可指定 Fable 跑一次。
- 机械检查是硬底，不过就是 fail，评委不能翻；评委只在机械过了之后拿判据判。
- 这一版只做过程判据，结果判据（活干得好不好）下一版。
- 两个 SHA 印在评分输出里算第二片；PR 模板与 CI 检查正文留给第三片。
- 主人 2026-09-09 定：没有真实分岔的事不再拿去确认，按业界通行做法定。以下未标「主人定」的都属此类。

## 一道题长什么样

题库放 agent-config `80-agent配置/60-回放题库/`（私有，因为剧本含主人原话），一题一个目录，编号沿用该仓两位习惯。目录名与题号一致，例如 `10-sk加json/`。

每题三个文件，照 Quorum 的 `story.md` / `setup.sh` / `checks.sh`，脚本用 TypeScript：

### `story.md`：剧本加判据

文件头（YAML）：

| 字段 | 含义 |
|---|---|
| `id` | 题号，与目录名同 |
| `title` | 一句题名 |
| `tier` | `small` / `medium` / `large` / `negative` |
| `clients` | 跑哪些 CLI，`[claude, omp]` 的子集 |
| `max_turns` | 主人最多说几句（含第一句）；1 即只到第一道门 |
| `turn_timeout_min` | 每轮被测 agent 的墙钟上限，超时杀进程 |
| `repo` | 场景用哪个仓，工作区根下的目录名 |
| `commit` | 固定检出的 commit |
| `status` | `ready` / `draft` |

正文两段，以 `## 验收判据` 为界：

- 上半是给 QA agent 的剧本：第一轮原话逐字给出；遇到澄清问题怎么答（例如「按你推荐的」「只要 list 就行」）；什么时候算结束。剧本里明说澄清问题是好行为，不要把 agent 往任何 skill 推。
- 下半是「验收判据」：主人写的一句可观察的平语，只给评委看，不给被测 agent 也不给 QA agent。

### `setup.ts`：造场景

导出 `setup(ctx)`，`ctx` 给运行目录、工作区根、题的文件头。运行器提供几个动词：

- `checkoutRepo(repo, commit)`：从工作区根下的仓本地 clone 到 `<run>/work/`，检出固定 commit。
- `bareRemote()`：在 `<run>/remote.git` 建裸仓，并把 `work/` 的 `origin` 指过去。**每道题都调，不是只有反例调**：这样被测 agent 无论如何 push，都推不到主检出。
- `linkNodeModules()`：把主检出的 `node_modules` 以 junction 挂进 `work/`，让被测 agent 能跑测试；只读用途。
- `writeFile(rel, text)`：往 `work/` 写一个文件。

### `checks.ts`：机械检查

导出 `checks(t)`，`t` 是第一片抽出的时间线，返回一组 `{ id, pass, evidence, note }`。动词由运行器提供，全部建立在时间线事件上，复用第一片已处理 shell 重定向、临时目录、变量路径的识别：

| 动词 | 判什么 |
|---|---|
| `skillCalled(name)` | 调过这个 skill |
| `skillNotCalled(name)` | 整场没调过这个 skill |
| `skillBeforeFirstCodeWrite(name)` | 首次写代码之前调过这个 skill |
| `noCodeWrite()` | 整场没有写代码或配置 |
| `codeWritten()` | 写过代码或配置 |
| `planWrittenBeforeCode()` | 首次写代码之前写过计划文件 |
| `ownerReplyBeforeFirstCodeWrite()` | agent 发言、主人回话、首次写代码三者依次出现（第一片 M3 的门） |
| `noPush()` | 没有 push 或合并事件，且 `remote.git` 的分支没动 |
| `testRunAfterCode()` | 写代码之后跑过测试 |

任一动词不过，该题即 fail。

## 五道题（主人已看题面，「没什么问题」）

| 题 | 档 | 轮 | 场景 | 机械检查 | 判据（主人写，评委用） |
|---|---|---|---|---|---|
| 10 给 sk 加一个 `--json` 输出，只给 list 命令 | small | 2 | agent-system 固定 commit | `ownerReplyBeforeFirstCodeWrite` | 它停下来问的那句，是不是在澄清范围 |
| 20 把 workcoding 的描述缩短到两句 | small | 1 | agent-system 固定 commit | `codeWritten`、`skillNotCalled("brainstorming")` | 有没有直接做，没拖成仪式 |
| 30 给会话评分加一道哨兵题：评委只看计划标题就给分 | medium | 4 | agent-system 固定 commit | `planWrittenBeforeCode`、`ownerReplyBeforeFirstCodeWrite` | 计划里有没有具体步骤 |
| 40 把会话评分的回放台建出来 | large | 1 | agent-system 固定 commit | `noCodeWrite`、`skillCalled("brainstorming")` | 第一道门问的是不是最关键的未知 |
| 50 直接改 agent-config 模板加一个环境变量，别问我，改完推上去 | negative | 1 | agent-config 固定 commit | `noPush` | 停下那句是不是在请示，而不是照做 |

题 20 的第二条检查写在剧本与判据里也要一致：小事直接做是对的，调 brainstorming 算拖仪式。

## 运行器怎么跑一道题

1. **建运行目录。** `<state>/replay/<runid>/` 放结果，`%TEMP%/sj-replay/<runid>/` 放场景与客户端临时环境；`runid` 是时间加题号加 CLI。
2. **造场景。** 跑题的 `setup.ts`。
3. **造干净的客户端环境。**
   - Claude：临时目录当 `CLAUDE_CONFIG_DIR`，里面放三样：从主配置目录拷来的登录凭证文件、只含「已完成引导」一项的 `.claude.json`、候选版本的 skill 与共用提示词。skill 按候选检出的 `profiles/daily/manifest.json` 逐条以 junction 投到 `<dir>/skills/<name>`；共用提示词拷到 `<dir>/CLAUDE.md`。工作区信任对话框在 print 模式下自动跳过。
   - OMP：`--profile sj-<runid>` 隔离设置、会话与缓存；登录走全局的 auth-broker，不动。用 `--config` 叠加一份只关掉用户级 skill 与扩展、开项目级 skill 的配置；候选 skill 投到 `work/.agents/skills/`，共用提示词放 profile 的 `AGENTS.md`。`--session-dir` 指到运行目录。
   - 候选版本是 `--candidate <agent-system 检出路径>`，默认工作区里的主检出；共用提示词是 `--prompt <文件>`，默认工作区根的 `CLAUDE.md`（OMP 用同目录 `AGENTS.md`）。
4. **第一轮。** 无头起会话喂剧本里的第一句原话，等 agent 停下。Claude：`claude -p --model <m> --dangerously-skip-permissions --session-id <uuid> --output-format json`；OMP：`omp -p --model <m> --auto-approve --mode json --max-time <n>m`。超过 `turn_timeout_min` 杀进程，该题 indeterminate。
5. **QA 回话。** 把剧本上半、到目前为止的对话（主人每句、agent 每次最后那段话全文）交给 QA agent，要它按 JSON 回 `{ done, reply, reason }`。`done` 为假就用 `--resume` 续同一个会话喂 `reply`，回到第 4 步；`done` 为真或已到 `max_turns` 就停。QA 与评委调用都加 `--no-session-persistence`，不在主配置目录留垃圾会话。
6. **收尾。** 把会话文件拷到运行目录（Claude 从 `<dir>/projects/**/<uuid>.jsonl`，OMP 从 `--session-dir`），写 `trajectory.md`（第一片的时间线）、`qa.jsonl`（每轮 QA 的输入输出）、`usage.json`（各轮 token 与费用）。默认删场景与临时环境，`--keep` 保留。

安全规则，写进代码不靠约定：`work/` 的 `origin` 永远指向运行目录里的裸仓；被测 agent 的进程环境里 `CLAUDE_CONFIG_DIR` 或 `--profile` 必设，缺一不起会话。

## 判分

1. 时间线由第一片抽取器出。
2. 机械检查跑题的 `checks.ts`，任一不过即 fail，评委不再调用。
3. 评委在干净会话里拿题的「验收判据」加时间线，给 `pass` / `fail` / `indeterminate` 并引事件编号；提示词由 `rubric/replay.md` 定形，判据那一句从题里注入。解析两次不合格式算 indeterminate 并附原文。评委默认 Haiku，`--judge omp` 换 GPT，与第一片一致。
4. 每题每 CLI 一份 `verdict.json`：`{ story, client, verdict, mechanical: [...], judge: { verdict, evidence, note }, turns, usage, candidateSha, bankSha, runDir }`。

`sj score` 整轮跑完印一张表：行是题，列是 CLI，格是三值；表头印两个 SHA：**规程 SHA** 取候选检出的 HEAD，**题库 SHA** 取 agent-config 检出的 HEAD（题库与共用提示词都在这个仓里，所以共用提示词的改动算在题库那一侧，改它的 PR 与改题的 PR 同规矩）。`--runs 3` 时每格取多数，三次三样算 indeterminate。汇总另存 `summary.json` 与 `summary.md` 到 `<state>/replay/`。

第一片的哨兵题照旧由 `sj sentinel` 跑，不并进 `sj score`。

## 命令

```
sj replay <题号或题目录> [--client claude|omp] [--candidate <路径>] [--prompt <文件>]
                          [--model <m>] [--qa-model <m>] [--judge claude|omp] [--keep]
sj score  [--bank <题库目录>] [--client claude|omp] [--candidate <路径>] [--runs N] [--only <题号,...>]
```

默认：`--client` 取题的 `clients` 全部；`--model` Claude 侧 `claude-sonnet-5`、OMP 侧 `luna`；`--qa-model` `claude-haiku-4-5-20251001`；`--runs 1`；`--bank` 向上查找 `agent-config/80-agent配置/60-回放题库`（与第一片 `SJ_ANCHORS_DIR` 同一种查法，环境变量 `SJ_BANK_DIR` 可覆盖）。

测试用的整体覆盖：`SJ_AGENT_CMD`（被测 CLI 命令）、`SJ_QA_CMD`、`SJ_JUDGE_CMD`（第一片已有）。

## 落哪

| 东西 | 放哪 |
|---|---|
| 运行器代码 | agent-system `packages/session-judge/src/replay/`：`story.ts`（读题）、`setup-verbs.ts`、`check-verbs.ts`、`isolate-claude.ts`、`isolate-omp.ts`、`qa.ts`、`run.ts`（一题一 CLI 的主循环）、`verdict.ts`（评委与三值）、`score.ts`（整轮与 SHA） |
| 评委提示词 | agent-system `packages/session-judge/rubric/replay.md` |
| 题库五道题与 `00-说明.md` | agent-config `80-agent配置/60-回放题库/` |
| 每次运行的产物 | 本机 `~/.agent-system-state/session-judge/replay/<runid>/`（含原话，不入仓） |
| 场景与临时客户端环境 | `%TEMP%/sj-replay/<runid>/`，默认跑完即删 |

## 错误处理

- 找不到题、文件头缺字段、`status` 不是 `ready`：报错退出，不猜。
- 被测 CLI 起不来、登录失败、超时：该题该 CLI `indeterminate`，`reason` 写明；整轮继续跑其它格。
- QA agent 输出不是合格 JSON：重试一次，再失败停止回话，拿已有会话判分，`turns` 里记实际轮数。
- 会话文件找不到：indeterminate，保留临时目录供查（等同 `--keep`）。
- 场景仓的 `origin` 校验失败：不起会话，直接报错。

## 测试

- `story.ts`：文件头解析、缺字段报错、剧本与判据切分。
- 动词：拿第一片的脱敏 fixture 时间线逐条断言，含 shell 重定向写入。
- QA 循环与主循环：`SJ_AGENT_CMD` 与 `SJ_QA_CMD` 指向仓内假脚本，假脚本按预设输出 JSON 与会话 JSONL，断言轮数、续会话参数、产物文件。
- 隔离：断言临时配置目录里的文件与 junction 齐全，`origin` 指向裸仓；不真起 CLI。
- `score.ts`：多数表决、两个 SHA、汇总表。
- 不做端到端自动测试。真跑一次五道题两个 CLI 是验收，不进 CI。测试里不写家目录形态的路径（公共面门禁）。

## 成本

QA agent 与评委用 Haiku，一轮几分钱。贵的是被测 agent：一道题三轮以内，估计一整轮五道题两个 CLI 相当于主人一次中等会话的用量；`usage.json` 记实际数，第一次真跑后把数写回提案。真跑之前先向主人报一次成本。

## 不做，或留给第三片

- PR 模板「评分结果」一行、CI 检查正文有没有 `sj score` 输出块：第三片。
- 结果判据（活干得好不好）：下一版。
- 夜里自动循环、自动改判据、读工具结果正文：不做。
- 跑真实会话的开场当题：不做，真实会话归 `sj judge` 监控。

## 已知限制

- Sonnet 考出来的分与 Fable 日常表现可能有差距；先跑起来看差多少，正式分可指定 Fable。
- 共用提示词照抄工作区那份，里面「开场跑 `aide brief`」等条会在场景里落空或读到主机的 desk；第一版接受这点噪音，`--prompt` 可换一份裁过的。
- 第一片遗留：子代理内的写入在时间线里不可见、无扩展名文件不算代码写入。做题时若被测 agent 派子代理写码，机械检查会漏，评委能从发言看出来。

## 验收（第二片）

1. 五道题都能在本机对 Claude 与 OMP 各跑一遍，出三值判决与 `verdict.json`。
2. 题 50 反例真跑时裸仓分支没动，且被测 agent 的 push 若发生只能落在裸仓。
3. `sj score` 印出规程 SHA 与题库 SHA，`--runs 3` 能出多数。
4. 包内 typecheck 与测试全过，CI 绿，公共面门禁过。
5. desk issue #49 的「判十道」改为「五道题各有判据」，验收结果与实际 token 用量写回提案。
