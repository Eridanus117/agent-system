"""在三个模拟决策场景中主动查询 KB 检索器的集成演示。"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path


TOOL_ROOT = Path(__file__).absolute().parents[1]
REPOSITORY_ROOT = TOOL_ROOT.parents[1]
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))

from kb_retriever.models import TriggerContext  # noqa: E402
from kb_retriever.parser import parse_retrieval_cards  # noqa: E402
from kb_retriever.retriever import KnowledgeRetriever  # noqa: E402


CARDS_PATH = REPOSITORY_ROOT / "_archive" / "knowledge" / "retrieval-cards.md"


@dataclass(frozen=True)
class WorkflowCheckpoint:
    """一次主动问路所需的结构化查询与预期结果。"""

    label: str
    stage: str
    object: str
    signals: str
    expected_card: str
    avoided_branch: str


CHECKPOINTS = (
    WorkflowCheckpoint(
        label="装端指纹验收",
        stage="pre-acceptance",
        object="agent-plugin.installed-copy",
        signals=(
            "准备验收 Plugin 三端的目标版本与版本化缓存；现场同时出现 "
            "CRLF/LF 换行噪声、SHA-256 和旧缓存。"
        ),
        expected_card="B",
        avoided_branch="按原始哈希直接判坏，或跨版本通配到旧缓存后再返工",
    ),
    WorkflowCheckpoint(
        label="Token 燃烧测量决策",
        stage="pre-capacity-decision",
        object="codex.token-burn",
        signals=(
            "准备依据 ccusage codex daily --json --offline 的当日 totalTokens、"
            "outputTokens、cacheReadTokens 与 costUSD 决定继续加派还是降级停止。"
        ),
        expected_card="J",
        avoided_branch="把 costUSD 当账单，或把 Token 与周窗百分比固定换算后据此加派",
    ),
    WorkflowCheckpoint(
        label="worktree 删除前置门",
        stage="pre-worktree-delete",
        object="orca.worktree",
        signals=(
            "准备清理候选 worktree；先按 dispatched/running 任务绑定、两仓 main "
            "和保护对象组成保留集，再核对零未提交、零未推送与连带影响。"
        ),
        expected_card="V",
        avoided_branch="仅凭 Ready terminal 或分支名判断空闲，然后尝试删除 worktree",
    ),
)


def main() -> int:
    retriever = KnowledgeRetriever(parse_retrieval_cards(CARDS_PATH))
    failures = 0

    print(f"卡片来源：{CARDS_PATH}")
    print("问路方式：调用者主动填写 stage/object/signals；检索器只返回候选。")
    print("证据边界：这是显式查询的模拟演示，不代表自然采用、产品采用或长期依赖。")

    for checkpoint in CHECKPOINTS:
        outcome = retriever.search(
            TriggerContext(
                stage=checkpoint.stage,
                object=checkpoint.object,
                signals=checkpoint.signals,
            )
        )
        print(f"\n[{checkpoint.label}]")
        print(f"  查询：stage={checkpoint.stage}; object={checkpoint.object}")
        if outcome.match is None:
            failures += 1
            print(f"  未命中：{outcome.reason}")
            print("  处置：转回 _archive/knowledge/README.md 人工选择当前 K 包。")
            continue

        result = outcome.match
        state = "命中" if result.card.identifier == checkpoint.expected_card else "误排"
        if state != "命中":
            failures += 1
        print(
            f"  {state}：卡 {result.card.identifier}（{result.card.title}），"
            f"reason={outcome.reason}，BM25={result.score:.6f}"
        )
        print(f"  候选动作：{result.card.one_line_action}")
        print(f"  来源：{result.card.source}")
        print(f"  本次模拟省掉的分支：{checkpoint.avoided_branch}")

    print(f"\n结果：{len(CHECKPOINTS) - failures}/{len(CHECKPOINTS)} 个主动查询命中预期卡。")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
