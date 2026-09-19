# 完成定义与出口

## 开 PR 前逐条过

- [ ] `claude plugin validate plugins/<插件>` 通过。
- [ ] `node plugins/tests/skills.test.ts` 通过（plugin.json、frontmatter、描述字节、marketplace 版本、目录页一致）。
- [ ] `node plugins/scripts/skills-overview.ts --write` 跑过，目录页已重生成。
- [ ] `profiles/daily/manifest.json` 与 `profiles/all/manifest.json` 各有一条；`.claude-plugin/marketplace.json` 有条目且版本一致。
- [ ] 版本：新建 `0.1.0`；修改 patch 加一。
- [ ] 评测：基线跑过并记在 `evals/README.md`；有 skill 组对对照组跑过，有 skill 组全过、差值总体为正（单条为 0 的在 README 说明）；`aggregate-result.json` 提交进 `evals/results/<日期>-<标签>/`，HTML 不提交；失败且原因不明的运行加 `--keep-temp` 把 `out/trace.jsonl` 另存提交。
- [ ] 结果提交前跑 `node plugins/skill-authoring/skills/skill-authoring/scripts/scrub-eval-results.ts <结果目录>`，把 JSON 里家目录路径中的用户名换成 `<user>`（ADR-0003 的占位约定；公共面门禁拦的是用户名，不是路径本身）。
- [ ] 修改既有 skill：改前改后各一份结果，都提交。
- [ ] 正文过了 writing-rules「写完过一遍」的四条；frontmatter 过了 agent-skills-spec 的清单（两份都从 SKILL.md 直接链到）。
- [ ] 正文与用例里没有本机路径、用户名、机器名。
- [ ] PR 正文按仓的模板四节：做了什么、为什么、怎么验证的（贴评测差值与命令）、怎么回退。

## 上线清单（出口的另一半）

在使用方仓建 issue（现在是 agent-config），标签 `ready-for-agent`，正文写：

```
## 这是什么
<skill 名> 已在 agent-system#<PR> 落地，需要路由与投影跟上。

## 要做的
1. 路由句：在当前路线真源（`flow` 正文；请求分拣那几句在常驻规则）的第 N 阶段加一句「<什么情况> → <skill 名>」（模型可拿的 skill）或「请敲 /<skill 名>」（人敲的 skill）。
2. 可见档：模型可拿的 skill 在 Claude 模板 skillOverrides 设 name-only；人敲的 skill 不用设（frontmatter 已挡）。
3. 合并后：deploy.ts sync；check --scope=skill-descriptions 退出 0；三个客户端各敲一次确认能到。
```

skill-authoring 到这里为止。合并、sync、路由句生效由这条待办驱动。
