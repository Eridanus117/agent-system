# session-judge

会话评分工具：基于规则与评委对 agent session 的机械检查和评价。

## 命令

```
sj extract <会话文件>            出时间线
sj judge <会话文件> [--judge claude|omp]   机械检查 + 评委，落状态文件
sj anchor <会话文件> [--from <json>]       主人判标准答案
sj agreement                      评委与标准答案的一致率（不足 10 道拒绝）
sj sentinel                       跑哨兵题，评委全给满分即报警
sj list [--latest N]              列最近会话
```

## 边界

- 不读取工具执行结果；只基于 session 记录进行评价。
- 状态不入版本仓；评价结果保存在临时或非 git 位置。
- 评委（LLM）只是顾问；最终判标准答案仍由主人决定。
