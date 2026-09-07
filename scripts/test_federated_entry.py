#!/usr/bin/env python3
"""静态验证联邦式 Session 入口、在线续接与跨 Session 负责人交互合同。"""

from __future__ import annotations

import argparse
import os
import json
import re
import subprocess
import sys
from pathlib import Path

from entry_sync import (
    EntrySyncError,
    compare_contents,
    find_markdown_section,
    generate_target,
    iter_targets,
    load_config,
)


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
MIGRATION_SOURCE_COMMIT = "fcfba814de4ac0e31480fe0d7ac5e715478d5b2c"  # 仅用于原始索引文本比对，不再用于 git show
PROHIBITED_SCRIPT_SUFFIXES = {
    ".ps1",
    ".psm1",
    ".psd1",
    ".bat",
    ".cmd",
    ".sh",
    ".bash",
    ".zsh",
}
RECEIPT_SCHEMA = "agent-control.federated-entry-validation-receipt"
RECEIPT_VERSION = 1
CONTINUATION_SECTION_MAX_CHARACTERS = 1200
CONTINUATION_FORBIDDEN_WORKFLOW_DETAILS = (
    "最多形成",
    "最多同时存在",
    "把观察分为四类",
    "形成可执行子 Issue",
    "准入条件必须同时成立",
    "第六节第 5 步",
    "终止状态",
)
GLOBAL_WAVE_SECTION_MAX_CHARACTERS = 700
CONTINUATION_BACKREFERENCE = "./entrypoints/agent-system.md#在线续接与负责人事项"
GLOBAL_WAVE_BACKREFERENCE = "./entrypoints/agent-system.md#扩大工作范围"
LANGUAGE_BACKREFERENCE = "./entrypoints/agent-system.md#持久实现语言"

passes: list[str] = []
failures: list[str] = []
check_results: list[dict[str, bool | str]] = []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="静态验证联邦式 Session 入口、在线续接与跨 Session 负责人交互合同。"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="只输出机器可读的版本化 JSON 回执。",
    )
    return parser.parse_args()


def add_check_result(condition: bool, description: str) -> None:
    check_results.append({"ok": condition, "description": description})
    (passes if condition else failures).append(description)


def get_repository_text(relative_path: str) -> str:
    path = REPOSITORY_ROOT / relative_path
    exists = path.is_file()
    add_check_result(exists, f"{relative_path} 存在")
    if not exists:
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeError as error:
        add_check_result(False, f"{relative_path} 可读取为 UTF-8；错误：{error}")
    except OSError as error:
        add_check_result(False, f"{relative_path} 可读取；错误：{error}")
    return ""


def git_failure_detail(process: subprocess.CompletedProcess[bytes]) -> str:
    detail = process.stderr.decode("utf-8", errors="replace").strip()
    return detail or f"退出码 {process.returncode}"


def run_git(arguments: list[str]) -> subprocess.CompletedProcess[bytes]:
    command = ["git", "-C", str(REPOSITORY_ROOT), *arguments]
    try:
        return subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError as error:
        return subprocess.CompletedProcess(
            command,
            returncode=127,
            stdout=b"",
            stderr=str(error).encode("utf-8", errors="replace"),
        )


def test_contains_all(text: str, patterns: list[str], description: str) -> None:
    missing = [pattern for pattern in patterns if pattern not in text]
    if missing:
        add_check_result(False, f"{description}；缺少：{'、'.join(missing)}")
    else:
        add_check_result(True, description)


def extract_markdown_section(text: str, heading: str) -> str:
    try:
        return find_markdown_section(text, heading, 2).text.strip()
    except EntrySyncError:
        return ""


def extract_markdown_subsection(text: str, heading: str) -> str:
    try:
        return find_markdown_section(text, heading, 3).text.strip()
    except EntrySyncError:
        return ""


def test_local_markdown_links(relative_paths: list[str]) -> None:
    link_pattern = re.compile(r"\[[^\]]+\]\((?P<target>[^)]+)\)")
    for relative_path in relative_paths:
        path = REPOSITORY_ROOT / relative_path
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeError as error:
            add_check_result(False, f"{relative_path} 的本地链接可读取为 UTF-8；错误：{error}")
            continue
        except OSError as error:
            add_check_result(False, f"{relative_path} 的本地链接可读取；错误：{error}")
            continue
        for match in link_pattern.finditer(text):
            target = match.group("target").strip("<>")
            if re.match(r"^(https?://|mailto:|#)", target):
                continue
            path_part = target.split("#", 1)[0]
            if not path_part.strip():
                continue
            resolved = (path.parent / path_part).resolve()
            add_check_result(
                resolved.exists(),
                f"{relative_path} 的本地链接存在：{target}",
            )


readme = get_repository_text("README.md")
system_entry = get_repository_text("entrypoints/agent-system.md")
agents_entry = get_repository_text("AGENTS.md")
claude_entry = get_repository_text("CLAUDE.md")
collaboration_authority = get_repository_text("_archive/authority/04-collaboration.md")
thinking_authority = get_repository_text("_archive/authority/03-thinking-methods.md")
ledger_authority = get_repository_text("_archive/authority/10-operating-ledger.md")
authority_map = get_repository_text("_archive/authority/00-map.md")
execution_state_authority = get_repository_text("_archive/authority/11-execution-state.md")
record = get_repository_text(
    "work/records/2026-08-10-federated-session-entry/record.md"
)
raw_current = get_repository_text(
    "work/records/2026-08-10-federated-session-entry/raw/"
    "current-before-migration.md"
)
raw_index = get_repository_text(
    "work/records/2026-08-10-federated-session-entry/raw/index.md"
)

test_contains_all(
    execution_state_authority,
    [
        "一次当前执行只获得其目标、输入、约束、上下文、能力和权限所需的最小充分配置",
        "必须重新判断装配",
        "仓库本地文件不得作为任务队列",
        "活动工作状态必须绑定具有稳定 URI 和可观察版本的外部 WorkItem",
        "自由对话、探索、建议、枚举候选或建立 proposal 不自动形成 Issue",
    ],
    "当前执行与状态权威消费五项获批结论",
)
for forbidden in ("Q-007", "E-004", "Multica", "stage-assembly"):
    add_check_result(
        forbidden not in execution_state_authority,
        f"当前执行与状态权威不把未采纳研究升级为产品政策：{forbidden}",
    )
test_contains_all(
    authority_map,
    ["11-execution-state.md"],
    "权威总图路由到当前执行与状态唯一产品入口",
)

try:
    entry_sync_config = load_config()
except EntrySyncError as error:
    entry_sync_config = None
    add_check_result(False, f"入口同步声明式配置可加载；错误：{error}")
else:
    add_check_result(True, "入口同步声明式配置可加载")
    for entry_target in iter_targets(entry_sync_config, "repository"):
        target_id = entry_target["id"]
        try:
            generated_target = generate_target(
                REPOSITORY_ROOT,
                entry_sync_config,
                entry_target,
                REPOSITORY_ROOT / "build" / "entry-sync",
            )
            current_target = generated_target.current_path.read_bytes().decode("utf-8")
            target_comparison = compare_contents(
                generated_target.content,
                current_target,
                expected_name=f"generated/{target_id}",
                actual_name=str(generated_target.current_path),
            )
        except (EntrySyncError, OSError, UnicodeError) as error:
            add_check_result(
                False,
                f"{target_id} 的声明式投影与单一真源一致；错误：{error}",
            )
        else:
            add_check_result(
                target_comparison.matches,
                (
                    f"{target_id} 的声明式投影与单一真源一致"
                    if target_comparison.matches
                    else (
                        f"{target_id} 的声明式投影与单一真源一致；"
                        f"差异：\n{target_comparison.diff}"
                    )
                ),
            )

    # installed 目标已从声明式配置中移除：用户级入口不再是版本化正文的投影。
    # 守护它们的不变量改由下面的反向断言承担。
    add_check_result(
        not list(iter_targets(entry_sync_config, "installed")),
        "声明式配置不再把用户级入口当作版本化正文的投影",
    )


# 用户级入口的反向断言，两个 Provider 都要守。
#
# 原先这里断言用户级入口是版本化正文的指针 —— 那等于让本仓正文对这台机器上
# 每一个会话生效，包括与本仓无关的项目。入口下沉到仓库级之后，要守的不变量
# 正好相反：用户级只放与任务无关的锚点，本仓正文不得进全局面。
#
# Claude 的 @import 会把正文内联展开，Codex 的指针只是一句"去读它" —— 常驻的
# token 量差很多，但作用域问题同类，所以两边用同一条断言。
#
# 按平台限定而非按文件存在性跳过：存在性判断会把本机上真实的漂移掩盖成"不适用"。
INSTALLED_ENTRIES = [
    ("Claude", Path.home() / ".claude" / "CLAUDE.md"),
    ("Codex", Path.home() / ".codex" / "AGENTS.md"),
]
if os.name == "nt":
    for provider_name, installed_path in INSTALLED_ENTRIES:
        if not installed_path.is_file():
            add_check_result(
                True,
                f"用户级 {provider_name} 入口不是本仓安装前提：{installed_path}",
            )
            continue
        installed_text = installed_path.read_text(encoding="utf-8", errors="replace")
        leaks = [
            marker
            for marker in ("entrypoints/agent-system.md", "entrypoints\agent-system.md")
            if marker in installed_text
        ]
        add_check_result(
            not leaks,
            f"现有用户级 {provider_name} 入口不把版本化正文拉进全局面"
            if not leaks
            else f"现有用户级 {provider_name} 入口不把版本化正文拉进全局面；发现引用："
            + "、".join(leaks),
        )
else:
    add_check_result(
        True,
        "用户级入口检查在非 Windows 环境不适用（本机专属，需在 Windows 上运行）",
    )

routing_patterns = [
    "公开、自足",
    "迁移索引/待分诊",
    "没有明确 Issue",
    "不能自行激活",
    "实施",
    "验证",
    "PR",
    "自足证据评论",
]

test_contains_all(
    readme,
    routing_patterns,
    "README 覆盖明确激活、迁移索引和无 Issue 三种模式",
)
test_contains_all(
    system_entry,
    routing_patterns,
    "版本化系统入口覆盖明确激活、迁移索引和无 Issue 三种模式",
)
test_contains_all(
    agents_entry,
    [
        "迁移索引/待分诊",
        "只读核验",
        "没有明确 Issue",
        "不能自行激活",
        "直接实施、验证",
        "PR 或自足证据评论",
    ],
    "Codex 仓库入口与公开激活和直接交付边界一致",
)
readme_continuation_section = extract_markdown_section(
    readme, "在线续接与负责人事项"
)
system_continuation_section = extract_markdown_section(
    system_entry, "在线续接与负责人事项"
)
agents_continuation_section = extract_markdown_section(
    agents_entry, "在线续接与负责人事项"
)
for entry_name, continuation_section in [
    ("仓库 README", readme_continuation_section),
    ("版本化系统入口", system_continuation_section),
]:
    add_check_result(
        len(continuation_section) <= CONTINUATION_SECTION_MAX_CHARACTERS,
        (
            f"{entry_name}：在线续接章节保持短（实际 {len(continuation_section)} 字符，"
            f"上限 {CONTINUATION_SECTION_MAX_CHARACTERS} 字符）"
        ),
    )
    copied_workflow_details = [
        detail
        for detail in CONTINUATION_FORBIDDEN_WORKFLOW_DETAILS
        if detail in continuation_section
    ]
    add_check_result(
        not copied_workflow_details,
        (
            f"{entry_name}：在线续接章节不复制 Skill 内部限流／生命周期细节"
            if not copied_workflow_details
            else (
                f"{entry_name}：在线续接章节不复制 Skill 内部限流／生命周期细节；"
                f"发现：{'、'.join(copied_workflow_details)}"
            )
        ),
    )

test_contains_all(
    system_continuation_section,
    [
        "公开父 Issue 的缺口时，只记录 proposal",
        "只有负责人明确激活后",
        "不自动启动，也不扫描队列找活",
        "新建 Session 与恢复空闲 Session",
        "不得沿用旧聊天记忆",
        "Project 只作观察面",
        "不是默认审批入口",
        "缺少 L3 离线唤醒",
    ],
    "版本化系统入口保留显式激活、恢复与离线边界",
)
# README 是给人看的入口，分节回指是有用的导航，保留。
# AGENTS 是给 Agent 看的入口，顶部已经把版本化正文声明为开工前必读，分节再指
# 一次是纯冗余 —— 而且指向的是一份 CLAUDE.md 已经 @import 全文的文档。它不只
# 浪费，还在教模型养成"去大文档里找"的习惯。所以这里断言的是**一节都没有**，
# 比原先的"只保留最短回指"更严：既挡正文复制，也挡回指长回来。
test_contains_all(
    readme_continuation_section,
    [CONTINUATION_BACKREFERENCE],
    "README 的在线续接章节回指唯一版本化正文",
)
add_check_result(
    bool(system_continuation_section) and not agents_continuation_section.strip(),
    "AGENTS 不再单列在线续接章节，版本化入口独占正文",
)
readme_global_wave_section = extract_markdown_subsection(
    readme, "扩大工作范围"
)
system_global_wave_section = extract_markdown_subsection(
    system_entry, "扩大工作范围"
)
agents_global_wave_section = extract_markdown_subsection(
    agents_entry, "扩大工作范围"
)
for entry_name, global_wave_section in [
    ("仓库 README", readme_global_wave_section),
    ("版本化系统入口", system_global_wave_section),
    ("Codex／Claude 仓库入口", agents_global_wave_section),
]:
    add_check_result(
        len(global_wave_section) <= GLOBAL_WAVE_SECTION_MAX_CHARACTERS,
        (
            f"{entry_name}：扩大工作范围章节保持短（实际 {len(global_wave_section)} 字符，"
            f"上限 {GLOBAL_WAVE_SECTION_MAX_CHARACTERS} 字符）"
        ),
    )
add_check_result(
    bool(system_global_wave_section),
    "版本化系统入口包含扩大工作范围正文",
)
test_contains_all(
    system_global_wave_section,
    [
        "只有负责人明确要求扩大并发面、选择下一项工作或启动另一项任务时",
        "枚举公开候选",
        "迁移索引默认排除",
        "写入所有权仍限于原合同",
        "不创建 Issue、不派发、不修改 Project、不启动新模型执行",
    ],
    "版本化系统入口保留扩大范围的触发、所有权与禁用边界",
)
global_wave_contradictions = [
    phrase
    for phrase in ["即使只问当前 PR 进度", "可以顺便扫描全局", "直接派发"]
    if phrase in system_global_wave_section
]
add_check_result(
    not global_wave_contradictions,
    "版本化系统入口的扩大工作范围正文不含反向放宽"
    if not global_wave_contradictions
    else "版本化系统入口的扩大工作范围正文不含反向放宽；发现："
    + "、".join(global_wave_contradictions),
)
test_contains_all(
    readme_global_wave_section,
    [GLOBAL_WAVE_BACKREFERENCE],
    "README 的扩大工作范围章节回指唯一版本化正文",
)
add_check_result(
    bool(system_global_wave_section) and not agents_global_wave_section.strip(),
    "AGENTS 不再单列扩大工作范围章节，版本化入口独占正文",
)
claude_entry_lines = [line.strip() for line in claude_entry.strip().splitlines() if line.strip()]
add_check_result(
    claude_entry_lines == ["@AGENTS.md"],
    "Claude 真实仓库入口继续导入同一 AGENTS.md"
    if claude_entry_lines == ["@AGENTS.md"]
    else "Claude 真实仓库入口继续导入同一 AGENTS.md；实际："
    + "、".join(claude_entry_lines or ["(空)"]),
)

effective_entries = [
    ("普通／Orca Codex", f"{system_entry}\n{agents_entry}\n{readme}"),
    ("Claude", f"{system_entry}\n{agents_entry}\n{readme}"),
]
scenario_contracts = [
    (
        "明确激活公开 Issue",
        ["负责人明确激活", "公开、自足", "授权范围"],
    ),
    (
        "迁移索引只读分诊",
        ["迁移索引/待分诊", "只分诊", "只读核验", "不从旧正文"],
    ),
    (
        "无 Issue 保持最小范围",
        ["没有明确 Issue", "最小范围", "proposal", "不能自行激活"],
    ),
]
for entry_name, entry_text in effective_entries:
    for scenario_name, patterns in scenario_contracts:
        test_contains_all(
            entry_text,
            patterns,
            f"{entry_name} 静态走读：{scenario_name}",
        )

test_contains_all(
    system_entry,
    [
        "负责人当前指令",
        "公开自足合同",
        "写入所有权",
        "Issue 不能覆盖更高层权限边界",
    ],
    "入口不会把 Issue 升格到当前指令和权限边界之上",
)
test_contains_all(
    system_entry,
    ["只冻结依赖被推翻假设", "有独立合同和所有权的安全工作继续"],
    "纠偏采用局部冻结而不是整体停工",
)
github_safety_patterns = [
    "合同明示负责人账号对应的 `User`",
    "Bot、GitHub App、其他账号",
    "远端当前 head",
    "授权必须明确覆盖",
    "lease 拒绝",
    "排他写入所有权",
    "可重读远端",
    "写前、写后重读",
]
test_contains_all(
    system_entry,
    github_safety_patterns,
    "版本化系统入口保留授权主体、PR head 与 Issue 正文重写安全边界",
)
test_contains_all(
    collaboration_authority,
    github_safety_patterns,
    "协作权威保留授权主体、PR head 与 Issue 正文重写安全边界",
)

language_rule_patterns = [
    "本仓新增或实质修改的持久程序、CLI、自动化和验证脚本",
    "Go",
    "Python",
    "TypeScript",
    "Rust",
    "不得新增 PowerShell、Batch 或 Shell 产品脚本",
    "一次性命令",
]
project_scope_patterns = [
    "只约束在 `agent-system` 仓库内",
    "不是这台电脑或其他仓库的用户级全局提示词",
    "不授权批量重写",
    "不自动扩大到其他仓库或用户级配置",
]
test_contains_all(system_entry, language_rule_patterns, "版本化入口包含项目级脚本语言规则")
test_contains_all(
    system_entry,
    project_scope_patterns,
    "版本化系统入口明确项目级作用域与非批量重写边界",
)
test_contains_all(
    readme,
    [
        "本仓新增或实质修改的持久程序、CLI、自动化和验证脚本",
        "Go",
        "Python",
        "TypeScript",
        "Rust",
        "PowerShell、Batch 或 Shell",
        "本仓贡献约束",
        "不自动扩大到其他仓库或用户级配置",
    ],
    "仓库 README 明确项目级语言与作用域边界",
)
system_language_section = extract_markdown_section(system_entry, "持久实现语言")
agents_language_section = extract_markdown_section(agents_entry, "持久实现语言")
test_contains_all(
    system_language_section,
    language_rule_patterns
    + ["不授权批量重写", "不自动扩大到其他仓库或用户级配置"],
    "项目级语言章节包含非批量重写边界",
)
add_check_result(
    bool(system_language_section) and not agents_language_section.strip(),
    "AGENTS 不再单列持久实现语言章节，版本化入口独占正文",
)

# 顶部那一行是上面三条的前提：分节回指全部撤掉之后，Agent 靠它知道要读全文。
# 少了它，AGENTS 就从"冗余"变成"缺失"。
add_check_result(
    "entrypoints/agent-system.md" in agents_entry.split("##", 1)[0],
    "AGENTS 顶部把版本化正文声明为开工前必读",
)

# 通用兜底。上面三条是逐章节写的，只盖了在线续接、扩大并行波次、持久实现语言 ——
# 而撤掉的回指有五节，父目标验收和经营总账维护那两节可以悄悄长回来而不被发现
# （反向测试实证：加回 ## 父目标验收，检查数从 121 涨到 122，一条都没响）。
# 这里改成按形状断言：带 # 锚点的分节回指一个都不许有。顶部那条不带锚点，指向
# 整份正文，不受影响。
agents_anchored_backrefs = re.findall(
    r"entrypoints/agent-system\.md#[^)\s]+", agents_entry
)
add_check_result(
    not agents_anchored_backrefs,
    "AGENTS 不含指向版本化正文的分节回指"
    if not agents_anchored_backrefs
    else "AGENTS 不含指向版本化正文的分节回指；发现 "
    + f"{len(agents_anchored_backrefs)} 处：" + "、".join(agents_anchored_backrefs),
)
test_contains_all(
    authority_map,
    ["[`entrypoints/agent-system.md`](../../entrypoints/agent-system.md)", "项目级 Agent 规则", "本总图不复制"],
    "权威总图回指项目级规则的唯一版本化正文",
)
add_check_result(
    system_entry.find("## 持久实现语言")
    < system_entry.find("当任务落在本仓"),
    "持久实现语言规则位于项目任务路由之前",
)
test_contains_all(
    readme,
    ["持久实现语言", "Go", "Python", "TypeScript", "Rust", "一次性命令"],
    "仓库入口可发现脚本语言规则",
)

runtime_pointer_path = REPOSITORY_ROOT / "work/current.md"
add_check_result(
    not runtime_pointer_path.exists(),
    "仓库不存在活动恢复指针 work/current.md"
    if not runtime_pointer_path.exists()
    else "仓库仍存在活动恢复指针 work/current.md",
)

active_entry_texts = {
    "README.md": readme,
    "AGENTS.md": agents_entry,
    "entrypoints/agent-system.md": system_entry,
    "_archive/authority/00-map.md": authority_map,
    "_archive/authority/10-operating-ledger.md": ledger_authority,
}
forbidden_runtime_pointer_terms = ["work/current.md", "run_65a73145f0e2", "observedAt 水位"]
for relative_path, text in active_entry_texts.items():
    present = [term for term in forbidden_runtime_pointer_terms if term in text]
    add_check_result(
        not present,
        f"{relative_path} 不从仓内运行态指针恢复工作"
        if not present
        else f"{relative_path} 仍引用仓内运行态指针：{'、'.join(present)}",
    )

test_contains_all(
    record,
    [
        "原始主线",
        "资源观测与并发实验",
        "负责人纠正及被替代判断",
        "方案演变",
        "迁移完整性映射",
        "授权与不做事项的来由",
        "持久脚本语言的全局纠正",
        "合并前发现的作用域缩窄",
        "所有仓库、Provider、Session 和 worktree",
    ],
    "可读研发记录覆盖迁移前因果历史和最新语言纠正",
)
test_contains_all(
    raw_index,
    [
        "S01｜迁移前",
        MIGRATION_SOURCE_COMMIT,
        "run_8f829c43983e",
        "task_7453a1e6b730",
        "ctx_4bfaa4a38dbe",
        "msg_6f7a25bce52d",
        "task_2b4478780c1a",
        "ctx_5266427014cb",
    ],
    "原始索引保留 Git、GitHub 与 Orca 来源链",
)

# 迁移基线校验已删除：该检查依赖原仓提交 fcfba814（clean-slate 迁仓后按设计不存在），
# 且其一次性目的（校验迁移前后 current 逐字一致）在原仓已完成。按入口「制度自清洁」
# 第 6 条，已证实错误的路径连同专属兼容说明一起删，不加例外或 fallback。

test_contains_all(
    collaboration_authority,
    [
        "联邦式 Session 入口的后续确认",
        "负责人明确激活公开、自足的 Issue",
        "源码存在或历史上曾安装不等于当前生效",
        "不保留永久协调者身份",
    ],
    "协作权威记录显式激活的联邦式模型与能力边界",
)
test_contains_all(
    authority_map,
    [
        "[`04-collaboration.md`](./04-collaboration.md)",
        "多 Agent／多 Session 协作产品模型",
    ],
    "权威总图把联邦式协作边界路由到协作权威",
)
test_contains_all(
    thinking_authority,
    ["最小实验与最小完整交付的后续澄清", "负责人注意力", "不能为了最小 diff"],
    "思考方法权威区分最小实验与最小完整交付",
)
test_contains_all(
    ledger_authority,
    [
        "全局枚举只由负责人明确触发",
        "排除未重新激活的迁移索引",
        "只返回 proposal",
        "不创建 Issue、不派发、不实施",
    ],
    "经营总账权威保留显式触发的候选路由",
)
unassembled_workflow_terms = [
    "github-collaboration",
    "issue-workflow",
    "issue-delivery",
    "pr-integration",
    "objective-to-issues",
    "operating-ledger-maintenance",
    "issue-contract-compaction",
]
for surface_name, surface_text in [
    ("README", readme),
    ("AGENTS", agents_entry),
    ("版本化系统入口", system_entry),
    ("协作权威", collaboration_authority),
    ("经营总账权威", ledger_authority),
]:
    direct_callers = [term for term in unassembled_workflow_terms if term in surface_text]
    add_check_result(
        not direct_callers,
        (
            f"{surface_name} 不直接调用未装配 GitHub 工作流资产"
            if not direct_callers
            else f"{surface_name} 不直接调用未装配 GitHub 工作流资产；发现："
            + "、".join(direct_callers)
        ),
    )
add_check_result(
    not (REPOSITORY_ROOT / "tools" / "issue_create").exists(),
    "依赖已退役 objective-to-issues 的 issue_create 工具已删除",
)

git_files = run_git(
    [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
    ],
)
git_files_description = "可以枚举仓库持久与待提交文件"
add_check_result(
    git_files.returncode == 0,
    git_files_description
    if git_files.returncode == 0
    else f"{git_files_description}；Git 错误：{git_failure_detail(git_files)}",
)
if git_files.returncode == 0:
    try:
        repository_files = [
            item
            for item in git_files.stdout.decode("utf-8").split("\0")
            if item
        ]
    except UnicodeError as error:
        add_check_result(False, f"Git 文件列表可读取为 UTF-8；错误：{error}")
    else:
        # vendor/ 是按负责人 2026-08-25 裁决逐字节跟踪的第三方 Skill 内容（「clone 即可用」
        # 高于「不提交第三方内容」，见提交 2cf0e44）。上游自带的脚本不是本仓沉淀的产品脚本，
        # 不受 entrypoints/agent-system.md「持久实现语言」一条约束，这里不计入。
        prohibited_scripts = sorted(
            item
            for item in repository_files
            if Path(item).suffix.lower() in PROHIBITED_SCRIPT_SUFFIXES
            and not item.startswith("vendor/")
        )
        add_check_result(
            not prohibited_scripts,
            "仓库未沉淀 PowerShell、Batch 或 Shell 脚本"
            if not prohibited_scripts
            else f"仓库存在禁用脚本：{'、'.join(prohibited_scripts)}",
        )

test_local_markdown_links(
    [
        "README.md",
        "AGENTS.md",
        "work/records/2026-08-10-federated-session-entry/record.md",
        "work/records/2026-08-10-federated-session-entry/raw/index.md",
        "_archive/authority/00-map.md",
        "_archive/authority/02-long-horizon-work.md",
        "_archive/authority/03-thinking-methods.md",
        "_archive/authority/04-collaboration.md",
        "_archive/authority/08-mvp-implementation-direction.md",
        "_archive/authority/10-operating-ledger.md",
        "_archive/authority/11-execution-state.md",
    ]
)

args = parse_args()

if args.json:
    print(
        json.dumps(
            {
                "schema": RECEIPT_SCHEMA,
                "version": RECEIPT_VERSION,
                "ok": not failures,
                "counts": {
                    "passed": len(passes),
                    "failed": len(failures),
                    "total": len(check_results),
                },
                "checks": check_results,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
else:
    print(f"通过：{len(passes)}")
    for passed_check in passes:
        print(f"  [PASS] {passed_check}")

    if failures:
        print(f"失败：{len(failures)}")
        for failed_check in failures:
            print(f"  [FAIL] {failed_check}")
    else:
        print("联邦式 Session 入口静态合同验证通过。")

if failures:
    sys.exit(1)
