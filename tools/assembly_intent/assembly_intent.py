#!/usr/bin/env python3
"""从既有权威推导本仓装配意图，并用真实的 `configs supply` 校验其一致性。

本仓**不存在**装配声明文件，本模块也不新增一个。装配意图从仓内一处已有、
且因别的理由存在的权威推导出来：

`entrypoints/agent-system.md`——仓库规则本体。凡是散文里写「加载可用的
``<名>`` Skill」的地方，都是规则**强制**该 Skill 当场可用；每个这样的名字
推出一个组 `plugins/<名>`（本仓 plugin 目录与其 Skill 同名的既有命名）。
（此前还有第二处权威 `_bmad/_config/skill-manifest.csv`，已随 2026-09-01
bmad 整组退库一并移除。）

推导出组集合以后，本模块**调用真实的 `configs supply` 子进程**去解析它们，再断言
每一个被点名／被清单声明的 Skill 确实落在 `supply` 的产出里。检查侧刻意不实现
`<根>/<组>/skills/<skill>/` 这条目录约定——「组是什么」只有 `supply-fs.ts` 一个
实现，把它抄第二遍正是 AD-22 反复警告的分叉源。

三条不可让步的性质：

* **只读。** 不写 SQLite、不 `establish`、不改仓内任何文件。`configs supply`
  自身也是只读命令。
* **提取数为 0 即失败。** 从散文里正则提取是脆的：措辞一改就落空，而落空的失败
  模式是「静默推导出空集、门照样绿」。所以有一条反向断言——提取不到任何 Skill
  名时本检查**必须**红，而不是报告「没发现不一致」。
* **不吞错。** `supply` 非零退出时，它的 stderr 原样透传，并附上推导出的组及其
  来源，好让人一眼看出是哪个 Skill 把哪个组带进来的。
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, Sequence


SCHEMA_VERSION = 1

#: 入口散文里点名一个 Skill 的唯一模式。改这里之前先想清楚：它是这道门与规则
#: 之间唯一的耦合点，而反向断言（提取数为 0 即失败）正是为它的脆性兜底。
NAMED_SKILL_PATTERN = re.compile(r"加载可用的\s*`([^`\n]+)`\s*Skill")

#: 捕获到的名字必须长得像个 Skill 名。捕到别的东西说明模式命中了不该命中的散文，
#: 那属于提取故障，要当场红，不能悄悄推出一个荒唐的组。
SKILL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

ENTRYPOINT_RELATIVE_PATH = "entrypoints/agent-system.md"
CLI_RELATIVE_PATH = "packages/control-plane/src/cli/index.ts"

#: 入口点名的 Skill 所在的组前缀。
PLUGIN_GROUP_PREFIX = "plugins/"

#: 只是喂给 `configs supply --config-name` 的一个标签：本命令不写任何东西，
#: 这个名字不会落库，只出现在候选 JSON 里。
DEFAULT_CONFIG_NAME = "agent-system-self-development"

DEFAULT_TIMEOUT_SECONDS = 180.0


class AssemblyIntentError(RuntimeError):
    """推导或校验无法在不猜测的前提下完成。"""


@dataclass(frozen=True)
class Expectation:
    """一条「某个 Skill 必须被某个组供给」的期望，连同它是从哪条权威推来的。"""

    skill: str
    group: str
    source: str

    def describe(self) -> str:
        return f"`{self.skill}`（期望来自组 `{self.group}`，来源 {self.source}）"


@dataclass(frozen=True)
class AssemblyIntent:
    """推导结果：组集合 + 每个组的来源 + 逐 Skill 的期望。"""

    repository_root: Path
    groups: tuple[str, ...]
    group_sources: dict[str, str]
    expectations: tuple[Expectation, ...]
    entrypoint_named_skills: tuple[str, ...]
    entrypoint_hits: int

    def describe_groups(self) -> str:
        return "\n".join(
            f"  {group} <- {self.group_sources[group]}" for group in self.groups
        )


@dataclass(frozen=True)
class SupplyOutcome:
    """一次 `configs supply` 调用的原始结果。"""

    returncode: int
    stdout: str
    stderr: str
    command: str


class SupplyRunner(Protocol):
    """`configs supply` 的调用面。测试用假实现替换，生产用下面的子进程实现。"""

    def run(self, config_name: str, groups: Sequence[str]) -> SupplyOutcome: ...


def repository_root_from_here() -> Path:
    """本文件位于 `<仓库根>/tools/assembly_intent/assembly_intent.py`。"""
    return Path(__file__).resolve().parents[2]


def resolve_bun_command(override: str | None = None) -> list[str]:
    configured = override or os.environ.get("ASSEMBLY_INTENT_BUN_COMMAND")
    if configured and configured.strip():
        command = shlex.split(configured)
        if not command:
            raise AssemblyIntentError("配置的 Bun 命令为空")
        return command
    return ["bun"]


class CliSupplyRunner:
    """真实的 `configs supply` 子进程。

    供给根固定为仓库根：`supply-root.ts` 的部署场景表规定「自我开发本仓时
    `CONTROL_PLANE_SUPPLY_ROOT` 指向仓库根」，于是组写成 `plugins/<名>`、
    `sourceRef` 产出仓库根相对形态。本检查绝不自己解析根，也绝不自己拼
    `sourceRef`。
    """

    def __init__(
        self,
        repository_root: Path,
        *,
        supply_root: Path | None = None,
        bun_command: Sequence[str] | None = None,
        cli_path: Path | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.repository_root = repository_root
        # 供给根默认就是仓库根；只有测试的夹具库会把它指到别处（此时 CLI 仍取自
        # 真实仓库，因为夹具里没有 `packages/`）。
        self.supply_root = supply_root or repository_root
        self.bun_command = list(bun_command or ["bun"])
        self.cli_path = cli_path or (repository_root / CLI_RELATIVE_PATH)
        self.timeout_seconds = timeout_seconds

    def _argv(self, config_name: str, groups: Sequence[str]) -> list[str]:
        argv = [*self.bun_command, str(self.cli_path), "supply", "--config-name", config_name]
        for group in groups:
            argv.extend(["--group", group])
        return argv

    def run(self, config_name: str, groups: Sequence[str]) -> SupplyOutcome:
        if not self.cli_path.is_file():
            raise AssemblyIntentError(
                f"configs supply 不可用：找不到 CLI 入口 {self.cli_path}"
            )
        argv = self._argv(config_name, groups)
        printable = " ".join(shlex.quote(part) for part in argv)
        environment = dict(os.environ)
        # 供给根＝仓库根。只在这里设置一次，`supply` 自己再往下传（AD-22）。
        environment["CONTROL_PLANE_SUPPLY_ROOT"] = str(self.supply_root)
        try:
            completed = subprocess.run(
                argv,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.timeout_seconds,
                cwd=str(self.repository_root),
                env=environment,
            )
        except FileNotFoundError as error:
            raise AssemblyIntentError(
                f"configs supply 不可用：找不到可执行文件 {self.bun_command[0]}；"
                f"命令为 {printable}"
            ) from error
        except subprocess.TimeoutExpired as error:
            raise AssemblyIntentError(
                f"configs supply 超时（{self.timeout_seconds:g}s）：{printable}"
            ) from error
        return SupplyOutcome(
            returncode=completed.returncode,
            stdout=completed.stdout or "",
            stderr=completed.stderr or "",
            command=printable,
        )


def read_text(path: Path, label: str) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise AssemblyIntentError(f"{label} 缺失：{path}") from error
    except OSError as error:
        raise AssemblyIntentError(f"{label} 读取失败：{path}：{error}") from error


def extract_named_skills(text: str) -> list[tuple[str, int]]:
    """按出现顺序返回 `(Skill 名, 行号)`；重复的名字保留每一次命中。"""
    hits: list[tuple[str, int]] = []
    for match in NAMED_SKILL_PATTERN.finditer(text):
        name = match.group(1).strip()
        line_number = text.count("\n", 0, match.start()) + 1
        if not SKILL_NAME_PATTERN.match(name):
            raise AssemblyIntentError(
                f"入口第 {line_number} 行的「加载可用的」后面捕获到的不是一个 Skill 名："
                f"{name!r}；提取模式与散文已经不匹配，不能据此推导装配意图"
            )
        hits.append((name, line_number))
    return hits



def derive_intent(repository_root: Path) -> AssemblyIntent:
    """从既有权威推导装配意图。不读、也不写任何装配声明文件。"""
    entrypoint_path = repository_root / ENTRYPOINT_RELATIVE_PATH
    entrypoint_text = read_text(entrypoint_path, "仓库入口规则")
    hits = extract_named_skills(entrypoint_text)

    # 反向断言：措辞漂移会让提取静默落空，而空集下「没发现不一致」正好是绿的。
    # 这条不消除正则提取的脆性，只保证脆性可见。
    if not hits:
        raise AssemblyIntentError(
            f"提取数为 0：{ENTRYPOINT_RELATIVE_PATH} 里一个「加载可用的 `<名>` Skill」都没匹配到。"
            "要么规则措辞被改写、要么规则真的不再强制任何 Skill；两种情况都必须由人裁定，"
            "不能当成「一致」放过"
        )

    named_lines: dict[str, list[int]] = {}
    for name, line_number in hits:
        named_lines.setdefault(name, []).append(line_number)

    group_sources: dict[str, str] = {}
    expectations: list[Expectation] = []

    for name in sorted(named_lines):
        group = f"{PLUGIN_GROUP_PREFIX}{name}"
        lines = ",".join(str(line) for line in named_lines[name])
        source = f"{ENTRYPOINT_RELATIVE_PATH}:{lines}"
        group_sources[group] = f"{source} 点名的 Skill `{name}`"
        expectations.append(Expectation(skill=name, group=group, source=source))

    groups = tuple(sorted(group_sources))
    return AssemblyIntent(
        repository_root=repository_root,
        groups=groups,
        group_sources=group_sources,
        expectations=tuple(expectations),
        entrypoint_named_skills=tuple(sorted(named_lines)),
        entrypoint_hits=len(hits),
    )


def _fact_value(fact: Any) -> str | None:
    """取一个 known Fact 或直接字符串值；Unknown 或形状不对时返回 None。"""
    if isinstance(fact, str):
        return fact
    if isinstance(fact, dict) and fact.get("kind") == "known":
        value = fact.get("value")
        if isinstance(value, str):
            return value
    return None


def parse_supply_candidate(stdout: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as error:
        detail = stdout.strip()[:240] or "无输出"
        raise AssemblyIntentError(f"configs supply 的 stdout 不是 JSON：{detail}") from error
    if not isinstance(payload, dict):
        raise AssemblyIntentError("configs supply 的 stdout 不是一个候选对象")
    skills = payload.get("skills")
    if not isinstance(skills, list):
        raise AssemblyIntentError("configs supply 的候选里没有 `skills` 列表")
    parsed: list[dict[str, Any]] = []
    for entry in skills:
        if not isinstance(entry, dict):
            raise AssemblyIntentError("configs supply 的 `skills` 里有非对象条目")
        name = entry.get("name")
        if not isinstance(name, str) or not name:
            raise AssemblyIntentError("configs supply 的某个 skill 条目没有 `name`")
        parsed.append({"name": name, "sourceRef": _fact_value(entry.get("sourceRef"))})
    return parsed


def attribute_to_groups(
    supplied: Sequence[dict[str, Any]], groups: Sequence[str]
) -> tuple[dict[str, int], int]:
    """按 `sourceRef` 的组前缀统计每组供了几个 Skill。

    这只是把 `supply` 已经产出的 `sourceRef` 按声明过的组前缀归堆，用于报告；
    不是在检查侧重新判定「一个 Skill 属于哪个组」。归不进任何声明组的条目单独
    计数并如实报出，不静默丢弃。
    """
    counts = {group: 0 for group in groups}
    unattributed = 0
    # 组名可以是多段路径，`plugins/x` 与 `plugins` 可能同时被声明，取最长前缀。
    ordered = sorted(groups, key=len, reverse=True)
    for entry in supplied:
        source_ref = entry.get("sourceRef")
        matched: str | None = None
        if isinstance(source_ref, str):
            for group in ordered:
                if source_ref.startswith(f"{group}/"):
                    matched = group
                    break
        if matched is None:
            unattributed += 1
        else:
            counts[matched] += 1
    return counts, unattributed


def check_assembly_intent(
    repository_root: Path,
    runner: SupplyRunner,
    *,
    config_name: str = DEFAULT_CONFIG_NAME,
) -> dict[str, Any]:
    intent = derive_intent(repository_root)
    outcome = runner.run(config_name, intent.groups)

    if outcome.returncode != 0:
        # 组解析失败、供给根缺失、CLI 报错——全部走这里。透传 supply 的类型化
        # 原因，并附推导出的组及其来源，好让人看出是哪个 Skill 把哪个组带进来的。
        raise AssemblyIntentError(
            f"configs supply 以退出码 {outcome.returncode} 失败；本检查不把它当成「一致」。\n"
            f"命令：{outcome.command}\n"
            f"推导出的组及其来源：\n{intent.describe_groups()}\n"
            f"--- configs supply stderr ---\n{outcome.stderr.strip() or '（空）'}"
        )

    supplied = parse_supply_candidate(outcome.stdout)
    supplied_names = {entry["name"] for entry in supplied}

    missing = [
        expectation
        for expectation in intent.expectations
        if expectation.skill not in supplied_names
    ]
    if missing:
        lines = "\n".join(f"  - {expectation.describe()}" for expectation in missing)
        raise AssemblyIntentError(
            "规则与能力不同真：以下被点名／被清单声明的 Skill 没有出现在 "
            f"configs supply 的产出里：\n{lines}\n命令：{outcome.command}"
        )

    counts, unattributed = attribute_to_groups(supplied, intent.groups)
    return {
        "schema_version": SCHEMA_VERSION,
        "repository_root": str(repository_root),
        "config_name": config_name,
        "command": outcome.command,
        "sources": {
            "entrypoint": {
                "path": ENTRYPOINT_RELATIVE_PATH,
                "match_count": intent.entrypoint_hits,
                "named_skills": list(intent.entrypoint_named_skills),
            },
        },
        "groups": [
            {
                "group": group,
                "source": intent.group_sources[group],
                "supplied_skill_count": counts[group],
            }
            for group in intent.groups
        ],
        "supplied_skill_count": len(supplied),
        "unattributed_skill_count": unattributed,
        "verified_expectation_count": len(intent.expectations),
    }


def render_text(report: dict[str, Any]) -> str:
    entrypoint = report["sources"]["entrypoint"]
    lines = [
        f"Repository: {report['repository_root']}",
        (
            f"Entrypoint: {entrypoint['path']} -- "
            f"{entrypoint['match_count']} 处「加载可用的」命中，"
            f"{len(entrypoint['named_skills'])} 个不重复 Skill "
            f"({', '.join(entrypoint['named_skills'])})"
        ),
        f"Derived groups ({len(report['groups'])}):",
    ]
    for row in report["groups"]:
        lines.append(
            f"  {row['group']}  [{row['supplied_skill_count']} skills]  <- {row['source']}"
        )
    unattributed_note = (
        f"（其中 {report['unattributed_skill_count']} 个未归入任何声明组）"
        if report["unattributed_skill_count"]
        else ""
    )
    lines.extend(
        [
            f"configs supply: {report['command']}",
            f"Supplied skills: {report['supplied_skill_count']}{unattributed_note}",
            f"Verified expectations: {report['verified_expectation_count']}",
            "OK: 装配意图与 configs supply 的真实产出一致。",
        ]
    )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="从既有权威推导本仓装配意图，并用真实的 configs supply 校验一致性。"
    )
    parser.add_argument("--repository-root", help="仓库根（默认从本文件位置推出）")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument(
        "--config-name",
        default=DEFAULT_CONFIG_NAME,
        help="传给 configs supply 的候选名（只是标签，不落库）",
    )
    parser.add_argument(
        "--bun-command",
        help="覆盖 Bun 命令（默认读 ASSEMBLY_INTENT_BUN_COMMAND，否则 `bun`）",
    )
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        except (AttributeError, OSError):
            pass
    args = build_parser().parse_args(argv)
    root = (
        Path(args.repository_root).resolve()
        if args.repository_root
        else repository_root_from_here()
    )
    try:
        runner = CliSupplyRunner(
            root,
            bun_command=resolve_bun_command(args.bun_command),
            timeout_seconds=args.timeout_seconds,
        )
        report = check_assembly_intent(root, runner, config_name=args.config_name)
    except AssemblyIntentError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(render_text(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
