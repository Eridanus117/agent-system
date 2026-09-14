#!/usr/bin/env python3
"""Compare the agent-plugins source tree against the copies installed on this machine's runtimes.

版本化来源自洽（两端 manifest、两份 Marketplace、符合性声明、README 版本总览）由
agent-plugins 仓的 CI 负责，见该仓 `.github/workflows/plugin-checks.yml`。

本工具只回答 CI 无法回答、也无法从任何远端回答的那半个问题：**这台机器此刻的
Plugin 状态。** 它分两层，两层的严重性不同：

**会话读版本缓存 `plugins/cache/<插件>/<版本>/`，不读工作树。** 2026-08-15 对两个
运行端各做了一次直接测试：在工作树里给一个插件的 manifest `description` 植入未提交
标记，然后起一个真实的新会话问它这个 skill 的 description——Claude 与 Codex 报出的
都是缓存里的旧值，标记没有出现。

因此工作树只是 Marketplace 源：装的时候被拷贝进缓存，**装之前改它不改变任何会话的
行为**。`claude plugin details` 的 on-invoke 估算确实随工作树变化，但那是 CLI 检视
命令在算「装了会是多大」，与会话加载是两条不同的代码路径——本工具此前用它推断会话
行为，推错了两轮，见 agent-control#11。

由此：

1. **缓存与应有内容不一致 = 运行端正在按错的正文干活。** 这是唯一会改变行为的事实。
   最危险的一档 `modified`（版本号相同、内容不同）只有整树摘要看得见。
2. **「应有内容」是 `origin/main`，不是工作树当前检出。** 工作树停在特性分支或有未
   提交改动时，缓存与它不同是正常的，此时无法据工作树判断缓存对不对。

边界：以上是 manifest 层的直接实测。`SKILL.md` 正文没有单独测——插件是作为一个整体
装进同一个缓存目录的（含 manifest 与 skills/ 全部文件），正文同源是推断，不是实测。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence


SCHEMA_VERSION = 1
TARGETS = Path(__file__).resolve().parent / "targets.json"
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
OVERVIEW_MARKER = "仓库目前包含"

# 逐 (插件, 运行端) 的判定。顺序即严重性顺序。
STATE_OK = "ok"
STATE_MODIFIED = "modified"  # 版本号相同但内容不同——最危险：版本号骗人
STATE_STALE = "stale"  # 只装着别的版本
STATE_MISSING = "missing"  # 该插件在这个运行端完全没装
STATE_ALIAS = "alias"  # 缓存目录与另一个运行端是同一实体，不构成独立验证
FAILING_STATES = (STATE_MODIFIED, STATE_STALE, STATE_MISSING)


class ReleaseError(RuntimeError):
    """Raised when the machine or the source repository cannot be read without guessing."""


# ---------------------------------------------------------------- 纯函数：摘要与解析


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tree_digest(root: Path) -> str | None:
    """SHA-256 over the whole subtree: relative path, size and bytes of every file.

    路径用 POSIX 分隔符规范化，因此 Windows 与 POSIX 上同一份内容得到同一摘要。
    安装副本是源目录的逐字节全树拷贝，所以整树摘要就是正确的比较单位——不做换行
    规范化，也不豁免任何文件：安装过程若改动了任何一个字节，这里就应该看得见。
    """
    if not root.is_dir():
        return None
    entries: list[tuple[str, Path]] = []
    for path in root.rglob("*"):
        if path.is_file():
            entries.append((path.relative_to(root).as_posix(), path))
    digest = hashlib.sha256()
    for relative, path in sorted(entries):
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(path.stat().st_size).encode("ascii"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(file_digest(path)))
    return digest.hexdigest()


def bump_version(version: str, part: str) -> str:
    match = SEMVER.match(version)
    if not match:
        raise ReleaseError(f"版本号不是三段式 semver：{version!r}")
    major, minor, patch = (int(value) for value in match.groups())
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    if part == "patch":
        return f"{major}.{minor}.{patch + 1}"
    raise ReleaseError(f"未知的递增部位：{part!r}")


def replace_once(text: str, pattern: re.Pattern[str], replacement: str, what: str) -> str:
    """Replace exactly one match, or fail loudly.

    发布时改错地方或漏改地方都是静默事故；这里把「不是恰好一处」变成硬失败。
    """
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        raise ReleaseError(f"{what}：期望恰好一处匹配，实际 {len(matches)} 处")
    match = matches[0]
    return text[: match.start()] + match.expand(replacement) + text[match.end() :]


def resolve_base(spec: dict[str, Any], environ: dict[str, str], home: Path) -> Path:
    base = spec.get("base")
    if base == "home":
        return home / spec["path"]
    if base == "environment":
        variable = spec["variable"]
        value = environ.get(variable)
        if not value:
            raise ReleaseError(f"环境变量 {variable} 未设置，无法定位 {spec['path']}")
        return Path(value) / spec["path"]
    raise ReleaseError(f"未知的路径基准：{base!r}")


def source_root_of(data: dict[str, Any]) -> Path:
    """源仓位置，允许 ~ 开头，免得公开仓的 targets.json 里写死带用户名的绝对路径。"""
    return Path(data["source"]["repository"]).expanduser()


# ---------------------------------------------------------------- 数据结构


@dataclass(frozen=True)
class Runtime:
    id: str
    label: str
    cache: Path
    install: dict[str, Any]
    cache_home: Path | None
    uninstall: list[str] = field(default_factory=list)


@dataclass
class PluginCheck:
    plugin: str
    declared: str
    source_digest: str
    states: dict[str, str] = field(default_factory=dict)
    installed_versions: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class SourceFacts:
    root: Path
    branch: str
    dirty: bool
    ahead: int
    behind: int
    upstream: str | None


@dataclass
class Report:
    source: SourceFacts
    runtimes: list[Runtime]
    plugins: list[PluginCheck]
    aliases: dict[str, str] = field(default_factory=dict)
    lifecycle: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def distinct_caches(self) -> int:
        return len(self.runtimes) - len(self.aliases)

    @property
    def failures(self) -> list[tuple[str, str, str]]:
        out = []
        for check in self.plugins:
            for runtime_id, state in check.states.items():
                if state in FAILING_STATES:
                    out.append((check.plugin, runtime_id, state))
        return out

    @property
    def extra_versions(self) -> list[tuple[str, str, list[str]]]:
        out = []
        for check in self.plugins:
            for runtime_id, versions in check.installed_versions.items():
                surplus = [v for v in versions if v != check.declared]
                if surplus:
                    out.append((check.plugin, runtime_id, sorted(surplus)))
        return out


# ---------------------------------------------------------------- 读取


def load_targets(path: Path = TARGETS) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("version") != SCHEMA_VERSION:
        raise ReleaseError(f"targets.json 版本不受支持：{data.get('version')!r}")
    return data


def load_runtimes(
    data: dict[str, Any],
    environ: dict[str, str] | None = None,
    home: Path | None = None,
) -> list[Runtime]:
    environ = dict(os.environ if environ is None else environ)
    home = Path.home() if home is None else home
    runtimes = []
    for entry in data["runtimes"]:
        cache_home = entry.get("cache_home")
        runtimes.append(
            Runtime(
                id=entry["id"],
                label=entry["label"],
                cache=resolve_base(entry["cache"], environ, home),
                install=entry["install"],
                cache_home=resolve_base(cache_home, environ, home) if cache_home else None,
                uninstall=list(entry.get("uninstall") or []),
            )
        )
    return runtimes


def skill_lifecycle(source_root: Path, data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Read the per-Skill invalidation/recheck declarations from the source repo.

    结构完整性由源仓 CI 把关（`docs/lifecycle.md`）；这里只消费，缺失即当作空表，
    不重复实现校验——两处各判一次会产生两套判据。
    """
    path = source_root / data["source"]["declaration"]
    if not path.is_file():
        return {}
    declaration = json.loads(path.read_text(encoding="utf-8"))
    entries = (declaration.get("skillLifecycle") or {}).get("entries")
    return dict(entries) if isinstance(entries, dict) else {}


def declared_versions(source_root: Path, data: dict[str, Any]) -> dict[str, str]:
    spec = data["source"]
    path = source_root / spec["declaration"]
    if not path.is_file():
        raise ReleaseError(f"符合性声明不存在：{path}")
    declaration = json.loads(path.read_text(encoding="utf-8"))
    versions = declaration.get(spec["declaration_key"])
    if not isinstance(versions, dict) or not versions:
        raise ReleaseError(f"{path} 缺少 {spec['declaration_key']}")
    return dict(versions)


def source_plugins(source_root: Path, data: dict[str, Any]) -> dict[str, Path]:
    root = source_root / data["source"]["plugins_path"]
    if not root.is_dir():
        raise ReleaseError(f"源仓插件目录不存在：{root}")
    return {path.name: path for path in sorted(root.iterdir()) if path.is_dir()}


def _git(source_root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=source_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise ReleaseError(f"git {' '.join(args)} 失败：{(result.stderr or '').strip()}")
    return (result.stdout or "").strip()


def source_facts(source_root: Path) -> SourceFacts:
    if not (source_root / ".git").exists():
        raise ReleaseError(f"源仓不是 git 仓库：{source_root}")
    branch = _git(source_root, "rev-parse", "--abbrev-ref", "HEAD")
    dirty = bool(_git(source_root, "status", "--porcelain"))
    upstream: str | None = None
    ahead = behind = 0
    try:
        upstream = _git(source_root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
        counts = _git(source_root, "rev-list", "--left-right", "--count", f"{upstream}...HEAD")
        behind_text, ahead_text = counts.split()
        behind, ahead = int(behind_text), int(ahead_text)
    except ReleaseError:
        upstream = None
    return SourceFacts(source_root, branch, dirty, ahead, behind, upstream)


# ---------------------------------------------------------------- 检测


def cache_aliases(runtimes: Sequence[Runtime]) -> dict[str, str]:
    """Map each runtime whose cache is *the same directory* as an earlier one to that earlier id.

    实测：Orca 的 Codex home 里 `plugins` 是指向 `~/.codex/plugins` 的 junction，因此
    「Orca 内的 Codex」与「普通 Codex」共用同一份插件缓存，只有 home（配置、会话、
    hooks）是分开的。把它当成第三份独立安装态去比对，得到的是重复计数——同一次验证
    数了两遍，看起来是 3/3 一致，实际只有 2 份物理缓存被验证过。
    """
    seen: dict[str, str] = {}
    aliases: dict[str, str] = {}
    for runtime in runtimes:
        try:
            key = str(runtime.cache.resolve()).lower()
        except OSError:
            key = str(runtime.cache).lower()
        if key in seen:
            aliases[runtime.id] = seen[key]
        else:
            seen[key] = runtime.id
    return aliases


def installed_versions(runtime: Runtime, plugin: str) -> list[str]:
    root = runtime.cache / plugin
    if not root.is_dir():
        return []
    return sorted(path.name for path in root.iterdir() if path.is_dir())


def check(data: dict[str, Any], runtimes: Sequence[Runtime]) -> Report:
    source_root = source_root_of(data)
    if not source_root.is_dir():
        raise ReleaseError(f"源仓不存在：{source_root}")
    facts = source_facts(source_root)
    versions = declared_versions(source_root, data)
    plugins = source_plugins(source_root, data)

    undeclared = sorted(set(plugins) - set(versions))
    if undeclared:
        raise ReleaseError(
            "源仓有插件未出现在符合性声明里："
            + "、".join(undeclared)
            + "——这是版本化来源的问题，应由 agent-plugins 的 CI 拦截"
        )

    aliases = cache_aliases(runtimes)

    checks: list[PluginCheck] = []
    for plugin, path in plugins.items():
        declared = versions[plugin]
        digest = tree_digest(path)
        if digest is None:
            raise ReleaseError(f"源插件目录读不到：{path}")
        entry = PluginCheck(plugin=plugin, declared=declared, source_digest=digest)
        for runtime in runtimes:
            if runtime.id in aliases:
                # 缓存目录与另一个运行端是同一实体：再比一次不是第二次验证，是同一次。
                entry.states[runtime.id] = STATE_ALIAS
                entry.installed_versions[runtime.id] = []
                continue
            present = installed_versions(runtime, plugin)
            entry.installed_versions[runtime.id] = present
            if not present:
                entry.states[runtime.id] = STATE_MISSING
            elif declared not in present:
                entry.states[runtime.id] = STATE_STALE
            else:
                installed = tree_digest(runtime.cache / plugin / declared)
                entry.states[runtime.id] = STATE_OK if installed == digest else STATE_MODIFIED
        checks.append(entry)
    return Report(
        source=facts,
        runtimes=list(runtimes),
        plugins=checks,
        aliases=aliases,
        lifecycle=skill_lifecycle(source_root, data),
    )


# ---------------------------------------------------------------- 输出


def _display_width(text: str) -> int:
    """CJK 字符在等宽终端里占两列；表头含中文，按字符数对齐会错位。"""
    return sum(2 if unicodedata.east_asian_width(char) in ("W", "F") else 1 for char in text)


def _pad(text: str, width: int) -> str:
    return text + " " * max(0, width - _display_width(text))


def format_report(report: Report) -> str:
    facts = report.source
    position = "无上游"
    if facts.upstream:
        if facts.ahead or facts.behind:
            position = f"相对 {facts.upstream} 领先 {facts.ahead}、落后 {facts.behind}"
        else:
            position = f"与 {facts.upstream} 一致"
    lines = [
        f"源仓 {facts.root}",
        f"  分支 {facts.branch}｜{'有未提交改动' if facts.dirty else '工作树干净'}｜{position}",
    ]
    if facts.branch != "main" or facts.dirty:
        lines.append(
            "  注意：两个运行端把 Skill 解析到这个工作树本身（不是版本缓存），因此本次读到的就是上面这份检出。"
        )
    lines.append("")

    ids = [runtime.id for runtime in report.runtimes]
    width = max([len(check.plugin) for check in report.plugins] + [_display_width("插件")])
    version_width = max([len(check.declared) for check in report.plugins] + [_display_width("版本")])
    columns = [max(len(runtime_id), 8) for runtime_id in ids]
    lines.append(
        f"{_pad('插件', width)}  {_pad('版本', version_width)}  "
        + "  ".join(_pad(runtime_id, size) for runtime_id, size in zip(ids, columns))
    )
    for check_entry in report.plugins:
        row = f"{_pad(check_entry.plugin, width)}  {_pad(check_entry.declared, version_width)}  "
        row += "  ".join(
            _pad(check_entry.states[runtime_id], size) for runtime_id, size in zip(ids, columns)
        )
        lines.append(row)
    lines.append("")

    failures = report.failures
    if failures:
        lines.append(f"漂移 {len(failures)} 项：")
        for plugin, runtime_id, state in failures:
            explanation = {
                STATE_MODIFIED: "版本号相同但内容不同——版本号在骗人，必须重装",
                STATE_STALE: "只装着别的版本",
                STATE_MISSING: "该运行端完全没装",
            }[state]
            lines.append(f"  {plugin} @ {runtime_id}：{state}——{explanation}")
    else:
        lines.append(
            f"与源仓一致（{len(report.plugins)} 插件 × {report.distinct_caches} 份物理缓存）。"
        )
    if report.aliases:
        lines.append("")
        for alias, primary in report.aliases.items():
            lines.append(
                f"{alias} 与 {primary} 是同一份缓存目录（junction），不是独立安装态："
                f"装一次即两端生效，比两次也只是同一次验证。"
            )

    if report.lifecycle:
        never = sorted(
            name for name, entry in report.lifecycle.items() if not entry.get("lastVerified")
        )
        suspect = sorted(name for name, entry in report.lifecycle.items() if entry.get("suspect"))
        lines.append("")
        lines.append(
            f"生命周期：{len(report.lifecycle)} 个 Skill 已声明失效条件与最少复核步骤；"
            f"其中 {len(never)} 个自制度建立以来从未复核。"
        )
        if suspect:
            lines.append(f"  已标记存疑（不得再作判据）：{'、'.join(suspect)}")
        if never:
            lines.append(f"  从未复核：{'、'.join(never)}")

    extras = report.extra_versions
    if extras:
        total = sum(len(versions) for _, _, versions in extras)
        lines.append("")
        lines.append(f"另有 {total} 个非当前版本的缓存目录（占盘，不影响正确性）：")
        for plugin, runtime_id, versions in extras:
            lines.append(f"  {plugin} @ {runtime_id}：{'、'.join(versions)}")
    return "\n".join(lines)


def format_hook(report: Report, tool_path: Path) -> str | None:
    """Session 启动钩子用的紧凑提醒；没有值得说的事就返回 None。

    告警对象是**缓存**：实测两个运行端的会话都从版本缓存加载，工作树只是 Marketplace
    源。缓存装错了，这个会话就在按错的正文干活。

    但缓存对不对，只有在工作树是 `origin/main` 的干净检出时才判得出来——比对基准是
    「应该装的内容」，而工作树停在特性分支时它不代表那个内容。因此分两种情形：

    - 工作树是干净的 main 检出 → 缓存不一致就报，这是真漂移；
    - 工作树不是 → 不报漂移（判不出来），只用一行说明为什么判不出来。

    这条判断改过三轮，前两轮都是拿 CLI 显示推断会话行为推错的。历史保留在
    agent-control#11 与对应测试的注释里，不抹掉。

    永远不返回非零、也不阻断会话。
    """
    facts = report.source
    comparable = facts.branch == "main" and not facts.dirty and not facts.behind

    grouped: dict[str, list[str]] = {}
    for plugin, runtime_id, state in report.failures:
        grouped.setdefault(plugin, []).append(f"{runtime_id}={state}")

    if not comparable:
        # 判不出来也要说一声：把一份特性分支长期留在生产检出里，会让漂移检测持续失明。
        why = []
        if facts.branch != "main":
            why.append(f"停在分支 `{facts.branch}`")
        if facts.dirty:
            why.append("有未提交改动")
        if facts.behind:
            why.append(f"落后 {facts.upstream} {facts.behind} 个提交")
        return (
            f"[plugin_release] 暂时判不出运行端装的对不对：Plugin 源仓工作树"
            f"{'、'.join(why)}，不代表 origin/main 应有的内容。\n"
            f"会话本身读的是版本缓存，不受工作树影响；但在把工作树恢复成干净的 main "
            f"检出之前，缓存漂移检测是失明的。\n"
            f"源仓 {facts.root}｜现状：python {tool_path} check"
        )

    if not grouped:
        return None
    items = "；".join(f"{plugin} {'、'.join(states)}" for plugin, states in grouped.items())
    return (
        f"[plugin_release] 运行端装的不是 origin/main 的内容：{items}\n"
        f"会话从版本缓存加载 Skill，所以本次会话正在按上面这些插件的错误版本干活。\n"
        f"修复：python {tool_path} sync --apply"
    )


def report_to_json(report: Report) -> dict[str, Any]:
    return {
        "schema": "agent-control.plugin-release-check",
        "version": SCHEMA_VERSION,
        "source": {
            "repository": str(report.source.root),
            "branch": report.source.branch,
            "dirty": report.source.dirty,
            "upstream": report.source.upstream,
            "ahead": report.source.ahead,
            "behind": report.source.behind,
        },
        "runtimes": [runtime.id for runtime in report.runtimes],
        "aliases": report.aliases,
        "lifecycle": {
            "declared": len(report.lifecycle),
            "neverVerified": sorted(
                name for name, entry in report.lifecycle.items() if not entry.get("lastVerified")
            ),
            "suspect": sorted(
                name for name, entry in report.lifecycle.items() if entry.get("suspect")
            ),
        },
        "distinctCaches": report.distinct_caches,
        "plugins": [
            {
                "plugin": check_entry.plugin,
                "declared": check_entry.declared,
                "sourceDigest": check_entry.source_digest,
                "states": check_entry.states,
                "installedVersions": check_entry.installed_versions,
            }
            for check_entry in report.plugins
        ],
        "drift": [
            {"plugin": plugin, "runtime": runtime_id, "state": state}
            for plugin, runtime_id, state in report.failures
        ],
        "ok": not report.failures,
    }


# ---------------------------------------------------------------- 发布


def _sync_version(source_root: Path, plugin: str, old: str, new: str) -> list[str]:
    """Rewrite the six version declarations. Every edit must match exactly once."""
    touched: list[str] = []
    old_escaped = re.escape(old)

    for directory in (".claude-plugin", ".codex-plugin"):
        relative = f"plugins/{plugin}/{directory}/plugin.json"
        path = source_root / relative
        text = path.read_text(encoding="utf-8")
        pattern = re.compile(r'("version"\s*:\s*")' + old_escaped + r'(")')
        path.write_text(
            replace_once(text, pattern, r"\g<1>" + new + r"\g<2>", relative),
            encoding="utf-8",
            newline="",
        )
        touched.append(relative)

    for relative in (".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"):
        path = source_root / relative
        text = path.read_text(encoding="utf-8")
        # 锚定在条目的 name 上，并要求 version 仍是旧值：改错条目或重复替换都会失败。
        pattern = re.compile(
            r'("name"\s*:\s*"' + re.escape(plugin) + r'"(?:(?!"name")[\s\S])*?"version"\s*:\s*")'
            + old_escaped
            + r'(")'
        )
        path.write_text(
            replace_once(text, pattern, r"\g<1>" + new + r"\g<2>", relative),
            encoding="utf-8",
            newline="",
        )
        touched.append(relative)

    relative = "tests/workflow-routing.json"
    path = source_root / relative
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(r'("' + re.escape(plugin) + r'"\s*:\s*")' + old_escaped + r'(")')
    path.write_text(
        replace_once(text, pattern, r"\g<1>" + new + r"\g<2>", relative),
        encoding="utf-8",
        newline="",
    )
    touched.append(relative)

    # README 只改「仓库目前包含…」那一句总览；其余段落是历史叙述，记录某版本当时做了
    # 什么，不随新版本改写。锚定总览标记，因此历史段落里同形态的字符串不会被误改。
    relative = "README.md"
    path = source_root / relative
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"(?P<head>" + re.escape(OVERVIEW_MARKER) + r"[^\n]*?`" + re.escape(plugin) + r"` `)"
        + old_escaped
        + r"(?P<tail>`)"
    )
    path.write_text(
        replace_once(text, pattern, r"\g<head>" + new + r"\g<tail>", f"{relative} 版本总览"),
        encoding="utf-8",
        newline="",
    )
    touched.append(relative)
    return touched


def _run(command: Sequence[str], cwd: Path | None = None, env: dict[str, str] | None = None):
    merged = dict(os.environ)
    if env:
        merged.update(env)
    return subprocess.run(
        list(command),
        cwd=str(cwd) if cwd else None,
        env=merged,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=os.name == "nt",
    )


def _format_command(command: Sequence[str], plugin: str, marketplace: str, runtime: Runtime) -> list[str]:
    return [
        part.format(
            plugin=plugin,
            marketplace=marketplace,
            cache_home=str(runtime.cache_home) if runtime.cache_home else "",
        )
        for part in command
    ]


def release(
    data: dict[str, Any],
    runtimes: Sequence[Runtime],
    plugin: str,
    part: str,
    apply: bool,
    allow_dirty: bool,
    no_bump: bool = False,
    out=sys.stdout,
) -> int:
    source_root = source_root_of(data)
    marketplace = data["source"]["marketplace_name"]
    facts = source_facts(source_root)
    versions = declared_versions(source_root, data)
    if plugin not in versions:
        raise ReleaseError(f"未知插件 {plugin!r}；已声明：{'、'.join(sorted(versions))}")
    old = versions[plugin]
    # --no-bump：上一次发布在第 3 步（符合性测试）中止时，六处声明已经改成新版本了。
    # 直接重跑会再递增一次，把一个已经写进声明的版本跳过去。恢复路径必须不再递增。
    new = old if no_bump else bump_version(old, part)

    print(f"[1/5] 前置检查", file=out)
    if facts.dirty and not allow_dirty:
        raise ReleaseError("源仓工作树不干净；先提交或传 --allow-dirty（发布会与你的改动混在一起）")
    print(f"      源仓 {source_root}｜分支 {facts.branch}｜{'脏' if facts.dirty else '干净'}", file=out)
    if no_bump:
        print(f"      {plugin}  {new}（--no-bump：声明已是目标版本，不再递增）", file=out)
    else:
        print(f"      {plugin}  {old} -> {new}", file=out)
    if not apply:
        print("      演练模式：不写任何文件、不装任何运行端。加 --apply 才真正执行。", file=out)
        return 0

    if no_bump:
        print("[2/5] 跳过：声明已是目标版本", file=out)
    else:
        print(f"[2/5] 同步六处版本声明", file=out)
        for relative in _sync_version(source_root, plugin, old, new):
            print(f"      改 {relative}", file=out)

    print(f"[3/5] 跑符合性测试", file=out)
    for relative in data["source"]["conformance_tests"]:
        result = _run(["node", relative], cwd=source_root)
        status = "通过" if result.returncode == 0 else "失败"
        print(f"      {status} {relative}", file=out)
        if result.returncode != 0:
            print((result.stdout or "") + (result.stderr or ""), file=out)
            raise ReleaseError(f"符合性测试失败：{relative}——版本声明已改，请先修复再重跑")

    aliases = cache_aliases(runtimes)
    print(f"[4/5] 安装到 {len(runtimes) - len(aliases)} 份物理缓存", file=out)
    for runtime in runtimes:
        if runtime.id in aliases:
            print(f"      跳过 {runtime.label}：与 {aliases[runtime.id]} 共用同一缓存，已随之生效", file=out)
            continue
        spec = runtime.install
        env = {
            key: value.format(cache_home=str(runtime.cache_home or ""))
            for key, value in (spec.get("env") or {}).items()
        }
        if spec.get("preinstall"):
            # 失败不中止：首次安装时本来就没有可卸载的东西。
            _run(_format_command(spec["preinstall"], plugin, marketplace, runtime), env=env)
        if spec.get("refresh"):
            refresh = _format_command(spec["refresh"], plugin, marketplace, runtime)
            result = _run(refresh, env=env)
            if result.returncode != 0:
                raise ReleaseError(
                    f"{runtime.id} 刷新 Marketplace 失败：{(result.stderr or result.stdout or '').strip()[:300]}"
                )
        command = _format_command(spec["command"], plugin, marketplace, runtime)
        result = _run(command, env=env)
        if result.returncode != 0:
            raise ReleaseError(
                f"{runtime.id} 安装失败：{(result.stderr or result.stdout or '').strip()[:300]}"
            )
        print(f"      装好 {runtime.label}", file=out)

    print(f"[5/5] 指纹验收", file=out)
    report = check(data, runtimes)
    entry = next(item for item in report.plugins if item.plugin == plugin)
    bad = [
        f"{runtime_id}={state}"
        for runtime_id, state in entry.states.items()
        if state not in (STATE_OK, STATE_ALIAS)
    ]
    if bad:
        raise ReleaseError(f"装完仍不一致：{'、'.join(bad)}——安装报成功但内容对不上，不要相信安装回执")
    print(f"      {plugin} {new} 在 {report.distinct_caches} 份物理缓存上逐字节一致", file=out)
    print("", file=out)
    print(f"发布完成。源仓有未提交改动（六处版本声明），提交与 PR 仍归你。", file=out)
    return 0


def routing_inbound_edges(source_root: Path, data: dict[str, Any], plugin: str) -> list[str]:
    """Skills in OTHER plugins whose declared edges point into this plugin's skills."""
    path = source_root / data["source"]["declaration"]
    declaration = json.loads(path.read_text(encoding="utf-8"))
    skills = declaration.get("skills") or {}
    owned = {name for name, spec in skills.items() if spec.get("plugin") == plugin}
    inbound = []
    for name, spec in skills.items():
        if name in owned:
            continue
        for kind in ("drive", "return", "reference"):
            for target in spec.get(kind) or []:
                if target in owned:
                    inbound.append(f"{name} --{kind}--> {target}")
    return sorted(inbound)


def _remove_from_source(source_root: Path, plugin: str, version: str) -> list[str]:
    """Delete the plugin directory and drop it from all six version declarations."""
    import shutil

    touched: list[str] = []
    target = source_root / "plugins" / plugin
    if target.is_dir():
        shutil.rmtree(target)
        touched.append(f"plugins/{plugin}/（整个目录）")

    for relative in (".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"):
        path = source_root / relative
        document = json.loads(path.read_text(encoding="utf-8"))
        before = len(document["plugins"])
        document["plugins"] = [e for e in document["plugins"] if e.get("name") != plugin]
        if len(document["plugins"]) == before:
            raise ReleaseError(f"{relative}：找不到 {plugin} 的条目，退役中止")
        path.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline=""
        )
        touched.append(relative)

    relative = "tests/workflow-routing.json"
    path = source_root / relative
    document = json.loads(path.read_text(encoding="utf-8"))
    document.get("pluginVersions", {}).pop(plugin, None)
    for name in [
        name
        for name, spec in (document.get("skills") or {}).items()
        if spec.get("plugin") == plugin
    ]:
        document["skills"].pop(name, None)
        (document.get("skillLifecycle") or {}).get("entries", {}).pop(name, None)
    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline=""
    )
    touched.append(relative)

    relative = "README.md"
    path = source_root / relative
    text = path.read_text(encoding="utf-8")
    # 只动总览那一句；历史叙述段落照旧不碰。前后的顿号一并吃掉，避免留下空档。
    pattern = re.compile(
        r"(?P<head>" + re.escape(OVERVIEW_MARKER) + r"[^\n]*?)"
        r"(?:、`" + re.escape(plugin) + r"` `" + re.escape(version) + r"`"
        r"|`" + re.escape(plugin) + r"` `" + re.escape(version) + r"`、)"
    )
    path.write_text(
        replace_once(text, pattern, r"\g<head>", f"{relative} 版本总览"),
        encoding="utf-8",
        newline="",
    )
    touched.append(relative)
    return touched


def retire(
    data: dict[str, Any],
    runtimes: Sequence[Runtime],
    plugin: str,
    apply: bool,
    allow_dirty: bool,
    out=sys.stdout,
) -> int:
    """Retire a plugin: source, marketplaces and every physical cache, then confirm all are clean.

    重点是最后一步。从 Marketplace 移除**不会**卸载任何运行端上已安装的副本——运行端
    从不主动清理旧版本缓存。因此「从仓库删掉」等于留下一份不再被维护、却仍会被加载的
    正文，比不删更危险。不回读确认卸载，就不算退役完成。
    """
    source_root = source_root_of(data)
    marketplace = data["source"]["marketplace_name"]
    facts = source_facts(source_root)
    versions = declared_versions(source_root, data)
    if plugin not in versions:
        raise ReleaseError(f"未知插件 {plugin!r}；已声明：{'、'.join(sorted(versions))}")
    version = versions[plugin]

    print("[1/4] 前置检查", file=out)
    if facts.dirty and not allow_dirty:
        raise ReleaseError("源仓工作树不干净；先提交或传 --allow-dirty")
    inbound = routing_inbound_edges(source_root, data, plugin)
    if inbound:
        raise ReleaseError(
            "仍有其他 Skill 的路由边指向它，先改路由再退役：\n      " + "\n      ".join(inbound)
        )
    print(f"      {plugin} {version}｜无路由入边｜分支 {facts.branch}", file=out)
    print("      提醒：退役是产品取舍，不在预授权谓词内，需负责人批准。", file=out)
    if not apply:
        print("      演练模式：不删任何文件、不卸载任何运行端。加 --apply 才执行。", file=out)
        return 0

    print("[2/4] 从源仓移除", file=out)
    for relative in _remove_from_source(source_root, plugin, version):
        print(f"      删 {relative}", file=out)

    aliases = cache_aliases(runtimes)
    print(f"[3/4] 从 {len(runtimes) - len(aliases)} 份物理缓存卸载", file=out)
    for runtime in runtimes:
        if runtime.id in aliases:
            print(f"      跳过 {runtime.label}：与 {aliases[runtime.id]} 共用同一缓存", file=out)
            continue
        command = runtime.uninstall
        if not command:
            raise ReleaseError(f"{runtime.id} 未声明卸载命令，无法完成退役")
        env = {
            key: value.format(cache_home=str(runtime.cache_home or ""))
            for key, value in (runtime.install.get("env") or {}).items()
        }
        result = _run(_format_command(command, plugin, marketplace, runtime), env=env)
        if result.returncode != 0:
            print(f"      {runtime.label} 卸载命令返回非零，转为核对实际状态", file=out)
        print(f"      已卸载 {runtime.label}", file=out)

    print("[4/4] 回读确认三处都不存在", file=out)
    remaining: list[str] = []
    if (source_root / "plugins" / plugin).exists():
        remaining.append("源仓目录仍在")
    for relative in (".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"):
        document = json.loads((source_root / relative).read_text(encoding="utf-8"))
        if any(entry.get("name") == plugin for entry in document["plugins"]):
            remaining.append(f"{relative} 仍有条目")
    for runtime in runtimes:
        if runtime.id in aliases:
            continue
        left = installed_versions(runtime, plugin)
        if left:
            remaining.append(f"{runtime.id} 仍装着 {'、'.join(left)}")
    if remaining:
        raise ReleaseError(
            "退役未完成，以下位置仍存在：" + "；".join(remaining) + "——留着的正文仍会被加载"
        )
    print(f"      源仓、两份 Marketplace 与全部物理缓存均已无 {plugin}", file=out)
    print("", file=out)
    print("退役完成。源仓有未提交改动，提交与 PR 仍归你。", file=out)
    return 0


def behaviour_changes(source_root: Path, before: str, after: str) -> list[str]:
    """What actually changes for the runtimes between two commits of the production checkout.

    运行端实时读工作树，因此这不是「将会安装什么」，而是**这次拉取之后新 Session
    立刻读到的差异**。只看 plugins/ 下的内容：仓库其他改动不进 Agent 上下文。
    """
    if before == after:
        return []
    raw = _git(source_root, "diff", "--name-status", before, after, "--", "plugins")
    changes: list[str] = []
    versions: dict[str, tuple[str, str]] = {}
    for line in raw.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        status, path = parts[0], parts[-1]
        pieces = path.split("/")
        if len(pieces) < 2:
            continue
        plugin = pieces[1]
        if path.endswith("plugin.json") and plugin not in versions:
            def read_at(ref: str) -> str:
                try:
                    return json.loads(_git(source_root, "show", f"{ref}:{path}")).get("version", "?")
                except ReleaseError:
                    return "（无）"
            versions[plugin] = (read_at(before), read_at(after))
        elif path.endswith(".md"):
            changes.append(f"{status}  {path}")
    lines = [f"{p}  {old} → {new}" for p, (old, new) in sorted(versions.items()) if old != new]
    return lines + sorted(changes)


def sync(
    data: dict[str, Any],
    runtimes: Sequence[Runtime],
    apply: bool,
    out=sys.stdout,
) -> int:
    """Bring the production checkout to origin/main, report what that changes, refresh bookkeeping.

    「源码即生产」下这才是真正的发布动作：运行端实时读这份工作树，`git pull` 落地的
    那一刻新 Session 就读到新正文。安装只是让 `plugin list` 的版本账目不说谎。
    """
    source_root = source_root_of(data)
    marketplace = data["source"]["marketplace_name"]
    facts = source_facts(source_root)

    print("[1/4] 生产检出前置", file=out)
    if facts.branch != "main":
        raise ReleaseError(
            f"生产检出停在 `{facts.branch}`，不是 main。开发请用 "
            f"agent-plugins-work/<分支> 的 worktree；生产检出只做快进。"
        )
    if facts.dirty:
        raise ReleaseError("生产检出有未提交改动——它是运行端实时读的那份，不接受就地编辑")
    print(f"      {source_root}｜main｜干净", file=out)

    before = _git(source_root, "rev-parse", "HEAD")
    if not apply:
        _git(source_root, "fetch", "origin", "main")
        target = _git(source_root, "rev-parse", "origin/main")
        print(f"[2/4] 演练：{before[:7]} → {target[:7]}", file=out)
        for line in behaviour_changes(source_root, before, target) or ["（无 plugins/ 变化）"]:
            print(f"      {line}", file=out)
        print("      加 --apply 才真正拉取。", file=out)
        return 0

    _git(source_root, "fetch", "origin", "main")
    _git(source_root, "merge", "--ff-only", "origin/main")
    after = _git(source_root, "rev-parse", "HEAD")
    print(f"[2/4] git pull --ff-only   {before[:7]} → {after[:7]}", file=out)
    changes = behaviour_changes(source_root, before, after)
    if changes:
        print("      本次生效的行为变化：", file=out)
        for line in changes:
            print(f"        {line}", file=out)
    else:
        print("      plugins/ 无变化，本次不改变任何 Session 的行为。", file=out)

    aliases = cache_aliases(runtimes)
    print(f"[3/4] 刷新缓存账目（{len(runtimes) - len(aliases)} 份物理缓存）", file=out)
    versions = declared_versions(source_root, data)
    for runtime in runtimes:
        if runtime.id in aliases:
            continue
        spec = runtime.install
        env = {
            key: value.format(cache_home=str(runtime.cache_home or ""))
            for key, value in (spec.get("env") or {}).items()
        }
        if spec.get("refresh"):
            _run(_format_command(spec["refresh"], marketplace, marketplace, runtime), env=env)
        for plugin in sorted(versions):
            if spec.get("preinstall"):
                _run(_format_command(spec["preinstall"], plugin, marketplace, runtime), env=env)
            _run(_format_command(spec["command"], plugin, marketplace, runtime), env=env)
        print(f"      {runtime.label} 已刷新", file=out)

    print("[4/4] 指纹验收", file=out)
    report = check(data, runtimes)
    if report.failures:
        bad = "；".join(f"{p}@{r}={s}" for p, r, s in report.failures)
        raise ReleaseError(f"缓存账目仍不一致：{bad}——行为已按新正文生效，但账目在说谎")
    print(f"      {len(report.plugins)} 插件 × {report.distinct_caches} 份物理缓存逐字节一致", file=out)
    return 0


# ---------------------------------------------------------------- 入口


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="plugin_release",
        description="核对并执行 agent-plugins 的运行端发布。",
    )
    sub = parser.add_subparsers(dest="command")

    check_parser = sub.add_parser("check", help="三端安装态与源仓是否一致（默认）")
    check_parser.add_argument("--json", action="store_true", help="输出机器可读结果")
    check_parser.add_argument("--quiet", action="store_true", help="一致时不输出，只用退出码")
    check_parser.add_argument(
        "--hook",
        action="store_true",
        help="Session 启动钩子模式：只在源仓处于 main 且干净时提醒；永远返回 0，不阻断会话",
    )

    release_parser = sub.add_parser("release", help="递增版本、同步声明、三端安装并验收")
    release_parser.add_argument("plugin")
    release_parser.add_argument("--part", choices=("patch", "minor", "major"), default="patch")
    release_parser.add_argument("--apply", action="store_true", help="真正执行；默认只演练")
    release_parser.add_argument("--allow-dirty", action="store_true")
    release_parser.add_argument(
        "--no-bump",
        action="store_true",
        help="不递增：上次发布在符合性测试处中止、六处声明已是目标版本时的恢复路径",
    )

    sync_parser = sub.add_parser(
        "sync", help="把生产检出快进到 origin/main，报告本次生效的行为变化，并刷新缓存账目"
    )
    sync_parser.add_argument("--apply", action="store_true", help="真正拉取；默认只演练")

    retire_parser = sub.add_parser("retire", help="退役：源仓、两份 Marketplace、每份物理缓存，并回读确认")
    retire_parser.add_argument("plugin")
    retire_parser.add_argument("--apply", action="store_true", help="真正执行；默认只演练")
    retire_parser.add_argument("--allow-dirty", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else sys.argv[1:])
    command = args.command or "check"
    try:
        data = load_targets()
        runtimes = load_runtimes(data)
        if command == "sync":
            return sync(data, runtimes, args.apply)
        if command == "retire":
            return retire(data, runtimes, args.plugin, args.apply, args.allow_dirty)
        if command == "release":
            return release(
                data, runtimes, args.plugin, args.part, args.apply, args.allow_dirty, args.no_bump
            )
        report = check(data, runtimes)
        if getattr(args, "hook", False):
            message = format_hook(report, Path(__file__).resolve())
            if message:
                print(message)
            return 0
        if args.json:
            print(json.dumps(report_to_json(report), ensure_ascii=False, indent=2))
        elif not (args.quiet and not report.failures):
            print(format_report(report))
        return 1 if report.failures else 0
    except ReleaseError as error:
        # 钩子模式下环境问题不该阻断会话：报到 stderr，退出码保持 0。
        print(f"错误：{error}", file=sys.stderr)
        return 0 if getattr(args, "hook", False) else 2


if __name__ == "__main__":
    raise SystemExit(main())
