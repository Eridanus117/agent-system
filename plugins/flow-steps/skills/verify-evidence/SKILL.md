---
name: verify-evidence
description: >-
  要说「做成了」「通过了」时用：每条声称配一条刚跑过的命令、退出码和关键输出行，贴进对话再进 PR 正文；没跑过的标「未验证」。Turn claims into evidence: each claim gets a freshly run command, its exit code and key output lines, pasted into the conversation and the PR body; anything not run is marked unverified.
---

# 验证取证

第 6 段验证的步；小改动的「贴证据」也用它。`implement` 与 `tdd` 决定什么时候跑（定期跑、最后跑全套），这里只管什么算证据、怎么贴。用词按 `plugins/CONTEXT.md`：证据。

## 什么时候用

用：要说「做成了」「过了」「没问题」之前；写 PR「怎么验证的」之前；主人问「你怎么知道」时。

不用：还在改代码的途中——那时跑测试归 `implement`。

## 步骤

1. 列声称：把要说的每条结论写成一行（测试过了、类型过了、性能达标……）。
2. 一条声称配一条命令：写出能证明它的完整命令。命令要刚跑的、跑全的；缓存、记忆里的上次结果、「看着没问题」都不算。
3. 跑并读：看退出码、数失败数、读错误原文。跑不了就写「未验证」加该跑的命令，不写「应该没问题」。
4. 贴：命令、退出码、关键输出行（通过数与失败数、错误原文、性能数字）三样都要；整屏日志不贴，需要时留路径。
5. 进 PR：同样三样整理进「怎么验证的」；停靠记录「做成了」只写能复核的结果。

验收标准：每条声称都能指到它的命令、退出码和关键行；没有证据的都标了「未验证」。

## 产出

对话里的证据块；PR「怎么验证的」一节。

## 出口

证据齐了交 `code-review`；有失败的回第 5 段修。

## 为什么在哪

- desk#140、agent-system#113。
- 原版 Superpowers `verification-before-completion` 的铁律「没有新鲜证据就没有完成」保留，补上「贴出来」——本工作区的证据要进对话和 PR。
