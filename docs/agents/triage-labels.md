# Triage 标签

技能内部用五个规范分诊角色说话。本文件把这些角色映射到本仓 issue tracker 里实际用的标签串。

| 技能里的角色（mattpocock/skills） | 本仓的标签串       | 含义                       |
| --------------------------------- | ------------------ | -------------------------- |
| `needs-triage`                    | `needs-triage`     | 负责人需要评估这个 issue   |
| `needs-info`                      | `needs-info`       | 等提出方补充信息           |
| `ready-for-agent`                 | `ready-for-agent`  | 已完整定义，可交无人值守 agent |
| `ready-for-human`                 | `ready-for-human`  | 需要人来实现               |
| `wontfix`                         | `wontfix`          | 不会处理                   |

技能提到某个角色时（例如「打上可交 agent 的分诊标签」），用表中右列对应的标签串。

右列可以改成你实际使用的词汇。

## 本仓事实（2026-09-08 建立时的现状）

- `ready-for-agent` 与 `wontfix` **在此之前就已存在并在用**：issue #56–#62 挂着 `ready-for-agent`。这两个直接复用，不新建重复标签。
- `needs-triage`、`needs-info`、`ready-for-human` 为本次新建。

## 与既有中文标签的关系

本仓另有一套中文标签，形如 `类型/交付`、`类型/摩擦`、`类型/调研`、`领域/知识` 等。

这两套**正交，不互相替代**：

- 中文那套答「**这是什么**」——事项的种类与所属领域。
- 上表五个答「**现在轮到谁**」——分诊状态。

同一个 issue 可以同时挂两套，例如 `类型/交付` + `ready-for-agent`。分诊技能只读写上表五个，不动中文那套。
