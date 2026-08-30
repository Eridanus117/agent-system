"""CAP command-line interface and project orchestration."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3  # noqa: F401
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

from agent_system.cap.config import (
    CAPABILITY_KINDS,
    CLIENTS,
    DEFAULT_AGENT_STATE_ROOT,
    DEFAULT_ASSEMBLY_BINDING_DIR,
    DEFAULT_AUTH_ROOT,
    DEFAULT_CLI,
    DEFAULT_MACHINE_CONTEXT_MANIFEST,
    DEFAULT_MACHINE_CONTEXT_PIN,
    DEFAULT_OMP_RUNTIME_ID,
    DEFAULT_PROFILE,
    DEFAULT_PROFILE_TOOL,
    DEFAULT_PROJECT,
    DEFAULT_REAL_HOME,
    RUNNABLE_PROFILES,
    SKILL_NAME_PATTERN,
)
from agent_system.cap.support import (
    _base_args,
    _binding_args,
    _passthrough,
    _run_path,
    _workdir,
)
from agent_system.omp.runtime import (  # noqa: F401
    _agent_home_dir,
    _agent_home_env,
    _apply_omp_runtime_migration,
    _cleanup_legacy_omp_runtime,
    _materialize_profile_generation,
    _migrate_omp_runtime,
    _migration_backup_root,
    _migration_plan,
    _MigrationError,
    _omp_command,
    _omp_config_dir_value,
    _omp_runtime_id,
    _project_shared_omp_home,
    _require_shared_runtime_ready,
    _rollback_omp_runtime,
    _run_omp_agent_home,
    _safe_remove_tree,
    _verify_profile_generation,
    _write_receipt,
    _write_shared_mcp_policy,
)
from agent_system.profile import cli as profile_cli


def _omp_effective_preview(args, env):
    (
        generation,
        portable_hash,
        effective_hash,
        skill_names,
    ) = _materialize_profile_generation(args, env)
    manifest = json.loads(
        (generation / ".cap-generation.json").read_text(encoding="utf-8")
    )
    return {
        "runtime_id": _omp_runtime_id(args),
        "global_runtime_root": str(_agent_home_dir(args)),
        "global_generation": str(generation),
        "portable_tree_hash": portable_hash,
        "effective_render_hash": effective_hash,
        "project_source_context": manifest["source_context"],
        "project_source_digest": manifest["source_digest"],
        "skills": skill_names,
        "fixed_flags": ["--no-extensions", "--no-rules"],
    }


def _claude_effective_preview(args, env):
    from agent_system.claude.generation import (
        claude_runtime_dir,
        materialize_claude_generation,
    )
    from agent_system.claude.launch import claude_command, effective_observations

    (
        generation,
        portable_hash,
        effective_hash,
        skill_names,
    ) = materialize_claude_generation(args, env)
    manifest = json.loads(
        (generation / ".cap-generation.json").read_text(encoding="utf-8")
    )
    login_mode = str(manifest["login_mode"])
    argv = claude_command(generation, skill_names, login_mode, [])
    return {
        "runtime_id": getattr(args, "claude_runtime_id", "default"),
        "global_runtime_root": str(claude_runtime_dir(args)),
        "global_generation": str(generation),
        "login_mode": login_mode,
        "portable_tree_hash": portable_hash,
        "effective_render_hash": effective_hash,
        "project_source_context": manifest["source_context"],
        "project_source_digest": manifest["source_digest"],
        "skills": list(skill_names),
        "fixed_flags": [a for a in argv if a.startswith("--")],
        "unsupported": manifest["native_projection"]["unsupported"],
        "effective_observations": effective_observations(login_mode),
    }


def _run_omp(args, env):
    return _run_omp_agent_home(args, env)


def _run_claude(args, env):
    from agent_system.claude.launch import run_claude
    from agent_system.profile.cli import _validate_forwarded_args

    # The fixed gates are only fixed if a forwarded flag cannot reopen them.
    _validate_forwarded_args("claude", _passthrough(args.client_args))
    return_code, _generation, receipt, _payload = run_claude(
        args, env, _passthrough(args.client_args)
    )
    print(str(receipt))
    return return_code


# Clients whose launch goes through an in-process adapter rather than the
# generic profile-engine subprocess. Anything absent falls through to that
# path, which is still how codex and qoder run.
EFFECTIVE_ADAPTERS = {
    "omp": {"preview": _omp_effective_preview, "run": _run_omp},
    "claude": {"preview": _claude_effective_preview, "run": _run_claude},
}

PROFILE_LABELS = {
    "general": "通用工程",
    "agent-assembler": "Agent 装配者",
}

def _decode_frontmatter_scalar(raw: str, path: Path, line: int) -> str:
    value = raw.strip()
    if not value:
        raise ValueError(f"{path}:{line}: 元数据值不能为空")
    if value.startswith('"'):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line}: 无效双引号标量：{exc.msg}") from exc
        if not isinstance(decoded, str):
            raise ValueError(f"{path}:{line}: 元数据必须是字符串")
        return decoded
    if value.startswith("'"):
        if len(value) < 2 or not value.endswith("'"):
            raise ValueError(f"{path}:{line}: 无效单引号标量")
        return value[1:-1].replace("''", "'")
    if value[0] in "|>[{&*!":
        raise ValueError(f"{path}:{line}: 本项目只允许简单字符串 frontmatter")
    return value

def _decode_frontmatter_block(
    marker: str,
    block_lines: list[str],
    path: Path,
    line: int,
) -> str:
    payload = f"value: {marker}\n" + "\n".join(block_lines)
    try:
        decoded = yaml.safe_load(payload)
    except yaml.YAMLError as exc:
        raise ValueError(f"{path}:{line}: 无效块标量") from exc
    value = decoded.get("value") if isinstance(decoded, dict) else None
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{path}:{line}: 元数据值不能为空")
    return value


BLOCK_SCALAR_PATTERN = re.compile(r"[>|][-+]?")


def _read_skill_metadata(path: Path) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}:1: 缺少 YAML frontmatter 起始分隔符")
    try:
        closing = next(index for index, line in enumerate(lines[1:], 1) if line.strip() == "---")
    except StopIteration as exc:
        raise ValueError(f"{path}: 缺少 YAML frontmatter 结束分隔符") from exc

    metadata: dict[str, str] = {}
    index = 1
    while index < closing:
        line = lines[index]
        line_number = index + 1
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            index += 1
            continue
        if line[0].isspace():
            raise ValueError(f"{path}:{line_number}: 本项目不允许嵌套 frontmatter")
        key, separator, raw = line.partition(":")
        if not separator or not re.fullmatch(r"[A-Za-z0-9_-]+", key):
            raise ValueError(f"{path}:{line_number}: 无效 frontmatter 字段")
        if key in metadata:
            raise ValueError(f"{path}:{line_number}: 重复 frontmatter 字段 {key}")

        marker = raw.strip()
        if BLOCK_SCALAR_PATTERN.fullmatch(marker):
            index += 1
            block_lines: list[str] = []
            while index < closing:
                continuation = lines[index]
                if continuation and not continuation[0].isspace():
                    break
                block_lines.append(continuation)
                index += 1
            metadata[key] = _decode_frontmatter_block(
                marker,
                block_lines,
                path,
                line_number,
            )
            continue

        metadata[key] = _decode_frontmatter_scalar(raw, path, line_number)
        index += 1
    return metadata


def _skill_metadata_report(project: Path) -> dict[str, object]:
    skill_root = project / ".cap" / "capabilities" / "skills"
    issues: list[str] = []
    skills: list[dict[str, str]] = []
    skill_dirs: dict[str, Path] = {}
    if not skill_root.is_dir():
        issues.append(f"{skill_root}: Skill 目录不存在")
    else:
        skill_dirs.update(
            (path.name, path) for path in skill_root.iterdir() if path.is_dir()
        )

    try:
        project_model = profile_cli.load_project(project)
    except profile_cli.ProfileError as exc:
        issues.append(f"CAP 项目无效：{exc}")
    else:
        for name, imported in project_model.skill_imports.items():
            if name in skill_dirs:
                issues.append(f"Skill {name} 同时存在于 capability store 和 project import")
                continue
            skill_dirs[name] = imported.source

    for skill_id, skill_dir in sorted(skill_dirs.items()):
        skill_file = skill_dir / "SKILL.md"
        relative = skill_file.relative_to(project).as_posix()
        if skill_dir.is_symlink() or skill_file.is_symlink():
            issues.append(f"{relative}: 不允许 symlink")
            continue
        if not skill_file.is_file():
            issues.append(f"{relative}: 文件不存在")
            continue
        try:
            metadata = _read_skill_metadata(skill_file)
        except (OSError, UnicodeError, ValueError) as exc:
            issues.append(str(exc))
            continue

        name = metadata.get("name", "")
        description = metadata.get("description", "")
        if not 1 <= len(name) <= 64 or not SKILL_NAME_PATTERN.fullmatch(name):
            issues.append(f"{relative}: name 必须是 1–64 字符的小写字母、数字和单连字符 id")
        elif name != skill_id:
            issues.append(f"{relative}: name {name!r} 与目录 {skill_id!r} 不一致")
        if not 1 <= len(description) <= 1024:
            issues.append(f"{relative}: description 必须是 1–1024 个字符")
        skills.append({"id": skill_id, "path": relative, "name": name})

    return {
        "standard_conformance": "ok" if not issues else "invalid",
        "skills": skills,
        "issues": issues,
    }

class _CapArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        if "invalid choice: 'i'" in message or "invalid choice: 'interactive'" in message:
            message = f"{message}\n旧 interactive / i 已移除；请使用裸 cap"
        super().error(message)

def _build_parser() -> argparse.ArgumentParser:
    parser = _CapArgumentParser(
        prog="cap",
        description="裸 cap 进入 TUI 选择 profile 并启动默认 OMP；cap show 查看能力闭包和 CLI 装配。",
        epilog=(
            "TUI 使用：\n"
            "  cap\n"
            "  ↑/↓ 选择 profile，Enter 启动，Esc/q 退出\n"
            "独立查看：\n"
            "  cap show\n"
            "  cap show general\n"
            "  cap show general --cli omp\n"
            "\n"
            "显式自动化：\n"
            "  cap run agent-assembler -- -p \"帮我装配一个 review-agent\"\n"
            "  cap render agent-assembler --cli omp --output /tmp/rendered-cap\n"
            "  cap verify\n"
            "  cap skills-validate\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--project",
        default=str(DEFAULT_PROJECT),
        metavar="目录",
        help="公共 agent-system 项目根目录；默认使用当前 package 项目",
    )
    parser.add_argument(
        "--private-overlay",
        default=None,
        metavar="目录",
        help="显式私有 capability overlay 根目录；未提供时只使用公共 source",
    )
    parser.add_argument(
        "--home",
        default=str(DEFAULT_REAL_HOME),
        metavar="目录",
        help="真实用户 HOME；默认使用当前用户 HOME",
    )
    parser.add_argument(
        "--agent-state-root",
        dest="agent_home_root",
        default=str(DEFAULT_AGENT_STATE_ROOT),
        metavar="目录",
        help="CAP 用户状态根；默认是 $HOME/.agent-system-state",
    )
    parser.add_argument(
        "--profile-tool",
        default=str(DEFAULT_PROFILE_TOOL),
        metavar="文件",
        help="agent-system profile engine 模块路径；默认使用同一 package",
    )
    parser.add_argument(
        "--machine-context-manifest",
        dest="base_manifest",
        default=str(DEFAULT_MACHINE_CONTEXT_MANIFEST),
        metavar="文件",
        help="machine-context manifest 路径",
    )
    parser.add_argument(
        "--machine-context-pin",
        dest="base_pin",
        default=str(DEFAULT_MACHINE_CONTEXT_PIN),
        metavar="文件",
        help="machine-context 审批 pin 路径",
    )
    parser.add_argument(
        "--assembly-binding-dir",
        dest="binding_dir",
        default=str(DEFAULT_ASSEMBLY_BINDING_DIR),
        metavar="目录",
        help="assembly binding 目录",
    )
    parser.add_argument(
        "--auth-root",
        default=str(DEFAULT_AUTH_ROOT),
        metavar="目录",
        help="一次性 runtime 使用的私有认证库",
    )
    parser.add_argument(
        "--omp-runtime-id",
        default=DEFAULT_OMP_RUNTIME_ID,
        metavar="ID",
        help="用户级 OMP runtime id；默认 default",
    )
    parser.add_argument(
        "--claude-runtime-id",
        default="default",
        metavar="ID",
        help="用户级 Claude runtime id；默认 default",
    )
    parser.add_argument(
        "--omp-runtime-root",
        default=None,
        metavar="目录",
        help="显式用户级 OMP runtime 根；默认 $HOME/.agent-system-state/runtimes/omp/<id>",
    )

    subparsers = parser.add_subparsers(
        dest="command",
        metavar="命令",
        title="命令",
        description="裸 cap 进入 TUI 选择 profile 并启动默认 OMP；子命令用于查看、校验和自动化。",
    )

    subparsers.add_parser(
        "skills-validate",
        help="校验 Agent Skills 元数据",
        description="校验项目内 SKILL.md 的必需 frontmatter、名称和描述。",
    )

    migrate = subparsers.add_parser(
        "migrate-omp-runtime",
        help="迁移、回滚或清理 OMP 共享 runtime",
        description="默认输出无 secret dry-run plan；--apply 安装共享 runtime，--rollback 恢复迁移前 runtime，--cleanup 在行为验证后删除旧 CAP 状态。",
    )
    migrate_mode = migrate.add_mutually_exclusive_group()
    migrate_mode.add_argument(
        "--apply",
        action="store_true",
        help="备份旧状态并安装共享 runtime",
    )
    migrate_mode.add_argument(
        "--rollback",
        action="store_true",
        help="从迁移备份恢复旧 runtime 并移除新共享 runtime",
    )
    migrate_mode.add_argument(
        "--cleanup",
        action="store_true",
        help="删除已迁移且完成行为验证的旧 CAP 状态",
    )

    agents = subparsers.add_parser(
        "agents",
        help="查看可用 agent",
        description="查看当前项目声明的全部 agent。",
    )
    agents.set_defaults(profile_tool_command="agents")

    profiles = subparsers.add_parser(
        "profiles",
        aliases=("list",),
        help="查看可用 profile（底层格式名）",
        description="查看当前项目声明的全部 profile。",
    )
    profiles.set_defaults(profile_tool_command="list")

    clients = subparsers.add_parser(
        "clients",
        help="查看客户端 CLI 解析路径",
        description="查看 codex、qoder、omp 在当前 PATH 中解析到哪个可执行文件及其版本输出。",
    )
    clients.set_defaults(profile_tool_command="clients")


    show = subparsers.add_parser(
        "show",
        aliases=("explain",),
        help="查看 profile 的公共闭包或 CLI 装配",
        description="先查看 prompt、skills、MCP、hooks、plugins 与各 CLI hash；可选展开一个 CLI 的真实目标文件树。",
    )
    show.add_argument("profile", nargs="?", default=None, help="profile 名或中文名；省略时在 TTY 中选择")
    show.add_argument("--cli", choices=CLIENTS, help="展开指定客户端的真实装配")
    show.set_defaults(profile_tool_command="explain")

    use = subparsers.add_parser(
        "use",
        aliases=("launch",),
        help="显式使用 profile 启动一个 CLI",
        description="显式指定 profile 和目标 CLI，在当前工作目录中用持久 agent home 启动客户端。",
    )
    use.add_argument("profile", nargs="?", default=DEFAULT_PROFILE, help="profile 名或中文名；默认 general（通用工程）")
    use.add_argument("--cli", default=DEFAULT_CLI, choices=CLIENTS, help="要启动的客户端 CLI；默认 omp")
    use.add_argument(
        "--receipt",
        default=None,
        metavar="文件",
        help="启动收据路径；默认 <project>.runs/<profile>-<cli>-<时间戳>.receipt.json",
    )
    use.add_argument(
        "--workdir",
        default=None,
        metavar="目录",
        help="客户端工作目录；默认当前目录",
    )
    use.add_argument(
        "--fresh",
        action="store_true",
        help="使用一次性临时 runtime；默认 OMP 使用持久 agent home",
    )
    use.set_defaults(profile_tool_command="launch")

    run = subparsers.add_parser(
        "run",
        help="使用 profile 执行一次批处理命令",
        description="选择 profile 和目标 CLI，在当前工作目录中执行一次 batch 命令并记录 state；必须在 -- 后提供客户端命令参数。",
    )
    run.add_argument("profile", nargs="?", default=DEFAULT_PROFILE, help="profile 名或中文名；默认 general（通用工程）")
    run.add_argument("--cli", default=DEFAULT_CLI, choices=CLIENTS, help="要运行的客户端 CLI；默认 omp")
    run.add_argument(
        "--state",
        default=None,
        metavar="目录",
        help="观察 state 目录；默认 <project>.runs/<profile>-<cli>-<时间戳>.state",
    )
    run.add_argument(
        "--workdir",
        default=None,
        metavar="目录",
        help="客户端工作目录；默认当前目录",
    )
    run.add_argument(
        "--fresh",
        action="store_true",
        help="使用一次性临时 runtime；默认 OMP 使用持久 agent home",
    )
    run.set_defaults(profile_tool_command="run")

    render = subparsers.add_parser(
        "render",
        aliases=("materialize",),
        help="渲染 profile，不启动 CLI",
        description="把 profile 渲染到指定空目录，用于检查目标 CLI 会看到的配置。",
    )
    render.add_argument("profile", nargs="?", default=DEFAULT_PROFILE, help="profile 名或中文名；默认 general（通用工程）")
    render.add_argument("--cli", default=DEFAULT_CLI, choices=CLIENTS, help="要渲染的客户端 CLI；默认 omp")
    render.add_argument("--output", required=True, metavar="目录", help="已存在且为空的输出目录")
    render.set_defaults(profile_tool_command="materialize")

    lock = subparsers.add_parser(
        "lock",
        help="刷新 .cap/lock.json",
        description="重新计算 profile 声明、能力文件和三端渲染 hash，并写入 lock。",
    )
    lock.set_defaults(profile_tool_command="lock")

    machine_context_lock = subparsers.add_parser(
        "machine-context-lock",
        help="刷新 machine-context manifest",
        description="观察当前 HOME 并写入 machine-context manifest；不会批准摘要。",
    )
    machine_context_lock.set_defaults(profile_tool_command="machine-context-lock")

    machine_context_approve = subparsers.add_parser(
        "machine-context-approve",
        help="批准 machine-context 摘要",
        description="把当前 machine-context 摘要写入 pin。",
    )
    machine_context_approve.set_defaults(profile_tool_command="machine-context-approve")

    assembly_bind = subparsers.add_parser(
        "assembly-bind",
        help="重建 assembly binding",
        description="把项目 role 绑定到已批准的 machine-context。",
    )
    assembly_bind.add_argument("profile", help="role 名或中文名")
    assembly_bind.set_defaults(profile_tool_command="bind")

    verify = subparsers.add_parser(
        "verify",
        help="校验 lock 和能力闭包",
        description="校验当前声明、能力闭包和 lock 是否一致。",
    )
    verify.set_defaults(profile_tool_command="verify")

    return parser

def _profile_args(args: argparse.Namespace) -> list[str]:
    base = _base_args(args)
    command = args.profile_tool_command
    if command in {"list", "lock"}:
        return [*base, command]
    if command == "machine-context-lock":
        return [
            *base,
            "machine-context-lock",
            "--home",
            str(Path(args.home).expanduser()),
            "--machine-context-manifest",
            str(Path(args.base_manifest).expanduser()),
        ]
    if command == "machine-context-approve":
        return [
            *base,
            "machine-context-approve",
            "--machine-context-manifest",
            str(Path(args.base_manifest).expanduser()),
            "--machine-context-pin",
            str(Path(args.base_pin).expanduser()),
        ]
    if command == "bind":
        return [
            *base,
            "assembly-bind",
            "--profile",
            args.profile,
            *_binding_args(args),
        ]
    if command == "verify":
        return [*base, command, *_binding_args(args)]
    if command == "explain":
        return [*base, "explain", "--profile", args.profile]
    if command == "materialize":
        return [
            *base,
            "materialize",
            "--client",
            args.cli,
            "--profile",
            args.profile,
            "--output",
            args.output,
            *_binding_args(args),
        ]
    if command == "launch":
        receipt = Path(args.receipt).expanduser() if args.receipt else Path(
            _run_path(args, "receipt.json")
        )
        receipt.parent.mkdir(parents=True, exist_ok=True)
        return [
            *base,
            "launch",
            "--client",
            args.cli,
            "--profile",
            args.profile,
            "--auth-root",
            str(Path(args.auth_root).expanduser()),
            "--receipt",
            str(receipt),
            "--workdir",
            str(_workdir(args)),
            *_binding_args(args),
            "--",
            *_passthrough(args.client_args),
        ]
    if command == "run":
        state = args.state or _run_path(args, "state")
        Path(state).mkdir(parents=True, exist_ok=True)
        return [
            *base,
            "run",
            "--client",
            args.cli,
            "--profile",
            args.profile,
            "--auth-root",
            str(Path(args.auth_root).expanduser()),
            "--state",
            state,
            "--workdir",
            str(_workdir(args)),
            *_binding_args(args),
            "--",
            *_passthrough(args.client_args),
        ]
    raise AssertionError(f"unsupported command: {command}")

def _client_inventory() -> dict[str, object]:
    clients: dict[str, object] = {}
    for name in CLIENTS:
        resolved = shutil.which(name)
        version: dict[str, object] = {"exit_code": None, "output": None}
        if resolved:
            try:
                completed = subprocess.run(
                    [resolved, "--version"],
                    capture_output=True,
                    check=False,
                    text=True,
                    timeout=5,
                )
                version = {
                    "exit_code": completed.returncode,
                    "output": (completed.stdout + completed.stderr).strip(),
                }
            except (OSError, subprocess.TimeoutExpired) as error:
                version = {"exit_code": None, "output": str(error)}
        clients[name] = {"path": resolved, "version": version}
    return {"clients": clients}

def _available_profiles(args: argparse.Namespace, env: dict[str, str]) -> list[str]:
    completed = subprocess.run(
        [
            sys.executable,
            str(Path(args.profile_tool).expanduser()),
            "--project",
            str(Path(args.project).expanduser()),
            "list",
        ],
        capture_output=True,
        check=False,
        env=env,
        text=True,
    )
    if completed.returncode != 0:
        print(completed.stderr.strip() or completed.stdout.strip(), file=sys.stderr)
        return []
    try:
        data = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        print(f"无法解析 profile 列表：{error}", file=sys.stderr)
        return []
    profiles = data.get("profiles", [])
    available = {item for item in profiles if isinstance(item, str)}
    return [name for name in RUNNABLE_PROFILES if name in available]

def _choose(
    label: str,
    choices: list[str],
    default: str,
    display_names: dict[str, str] | None = None,
) -> str:
    names = display_names or {}
    print(f"\n选择 {label}：")
    for index, choice in enumerate(choices, start=1):
        display = f"{choice}（{names[choice]}）" if choice in names else choice
        marker = " [默认]" if choice == default else ""
        print(f"  {index}. {display}{marker}")
    while True:
        raw = input(f"{label} [{default}]: ").strip()
        if not raw:
            return default
        if raw.isdigit():
            offset = int(raw) - 1
            if 0 <= offset < len(choices):
                return choices[offset]
        if raw in choices:
            return raw
        for choice, display in names.items():
            if raw == display:
                return choice
        print(f"无效选择：{raw}")

def _require_tty(label: str, explicit_example: str) -> bool:
    if sys.stdin.isatty() and sys.stdout.isatty():
        return True
    print(
        f"{label} 需要交互式 stdin/stdout；非交互调用请使用：{explicit_example}",
        file=sys.stderr,
    )
    return False

def _tui_menu(
    stdscr,
    curses_module,
    title: str,
    choices: list[str],
    default: int,
    descriptions: list[str] | None = None,
) -> int:
    selected = default
    descriptions = descriptions or [""] * len(choices)
    while True:
        stdscr.erase()
        height, width = stdscr.getmaxyx()
        lines = [
            "CAP 配置",
            "↑/↓ 选择   Enter 确认   ←/b 返回   Esc/q 退出",
            "",
            title,
        ]
        for index, (choice, description) in enumerate(
            zip(choices, descriptions), start=1
        ):
            marker = "▶" if index - 1 == selected else " "
            default_marker = " [默认]" if index - 1 == default else ""
            suffix = f"  {description}" if description else ""
            lines.append(
                f"{marker} {index}. {choice}{default_marker}{suffix}"
            )
        lines.append("")
        lines.append("当前默认项会标记为 [默认]")
        for row, line in enumerate(lines[: max(height - 1, 0)]):
            text = line[: max(width - 1, 1)]
            try:
                stdscr.addstr(row, 0, text)
            except curses_module.error:
                pass
        stdscr.refresh()
        key = stdscr.getch()
        if key in (curses_module.KEY_UP, ord("k")):
            selected = (selected - 1) % len(choices)
        elif key in (curses_module.KEY_DOWN, ord("j")):
            selected = (selected + 1) % len(choices)
        elif key in (curses_module.KEY_LEFT, ord("b")):
            return -1
        elif key in (27, ord("q")):
            return -2
        elif key in (curses_module.KEY_ENTER, 10, 13):
            return selected


def _tui_profile(
    stdscr,
    curses_module,
    profiles: list[str],
) -> str | None:
    default = profiles.index(DEFAULT_PROFILE) if DEFAULT_PROFILE in profiles else 0
    result = _tui_menu(
        stdscr,
        curses_module,
        "选择 profile",
        profiles,
        default,
        [PROFILE_LABELS.get(profile, profile) for profile in profiles],
    )
    if result < 0:
        return None
    return profiles[result]


def _tui_use(args: argparse.Namespace, env: dict[str, str]) -> int:
    profiles = _available_profiles(args, env)
    if not profiles:
        print("没有可用 profile。", file=sys.stderr)
        return 2
    try:
        import curses
    except ImportError:
        print("当前 Python 没有 curses；请使用显式 cap use/run 命令。", file=sys.stderr)
        return 2
    try:
        profile = curses.wrapper(
            _tui_profile,
            curses_module=curses,
            profiles=profiles,
        )
    except curses.error as error:
        print(f"CAP TUI 启动失败：{error}", file=sys.stderr)
        return 2
    if profile is None:
        return 0
    args.profile = profile
    args.cli = DEFAULT_CLI
    args.client_args = []
    args.receipt = None
    args.workdir = None
    args.fresh = False
    args.profile_tool_command = "launch"
    return _run_selected(args, env)

def _profile_json(args: argparse.Namespace, env: dict[str, str], stage: str) -> dict[str, object] | None:
    try:
        completed = subprocess.run(
            _profile_args(args),
            capture_output=True,
            check=False,
            env=env,
            text=True,
        )
    except OSError as error:
        print(f"{stage} 失败：{error}", file=sys.stderr)
        return None
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"退出码 {completed.returncode}"
        print(f"{stage} 失败：{detail}", file=sys.stderr)
        return None
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        print(f"{stage} 输出解析失败：{error}", file=sys.stderr)
        return None
    if not isinstance(payload, dict):
        print(f"{stage} 输出解析失败：顶层必须是 JSON object", file=sys.stderr)
        return None
    return payload

def _render_preview(args: argparse.Namespace, env: dict[str, str]) -> dict[str, object] | None:
    try:
        with tempfile.TemporaryDirectory(prefix=f"cap-show-{args.profile}-{args.cli}-") as temporary:
            preview_args = argparse.Namespace(**vars(args))
            preview_args.profile_tool_command = "materialize"
            preview_args.output = temporary
            rendered = _profile_json(preview_args, env, "render")
            if rendered is None:
                return None
            tree_hash = rendered.get("tree_hash")
            if not isinstance(tree_hash, str):
                print("render 输出解析失败：缺少字符串 tree_hash", file=sys.stderr)
                return None
            root = Path(temporary)
            files = sorted(
                path.relative_to(root).as_posix()
                for path in root.rglob("*")
                if path.is_file()
            )
            preview: dict[str, object] = {
                "client": args.cli,
                "files": files,
                "tree_hash": tree_hash,
            }
            adapter = EFFECTIVE_ADAPTERS.get(args.cli)
            if adapter is not None:
                try:
                    preview.update(adapter["preview"](args, env))
                except _MigrationError as error:
                    print(f"effective render 失败：{error}", file=sys.stderr)
                    return None
            return preview
    except OSError as error:
        print(f"目标文件枚举失败：{error}", file=sys.stderr)
        return None

def _show(args: argparse.Namespace, env: dict[str, str]) -> int:
    interactive = args.profile is None
    if interactive:
        profiles = _available_profiles(args, env)
        if not profiles:
            print("没有可用 profile。", file=sys.stderr)
            return 2
        profile_default = DEFAULT_PROFILE if DEFAULT_PROFILE in profiles else profiles[0]
        args.profile = _choose("profile", profiles, profile_default, PROFILE_LABELS)

    explanation = _profile_json(args, env, "explain")
    if explanation is None:
        return 2

    if interactive:
        print(json.dumps(explanation, ensure_ascii=False, indent=2))
        selected = _choose("CLI 装配", ["不展开", *CLIENTS], "不展开")
        if selected == "不展开":
            return 0
        args.cli = selected
        preview = _render_preview(args, env)
        if preview is None:
            return 2
        print(json.dumps({"preview": preview}, ensure_ascii=False, indent=2))
        return 0

    if args.cli:
        preview = _render_preview(args, env)
        if preview is None:
            return 2
        explanation["preview"] = preview
    print(json.dumps(explanation, ensure_ascii=False, indent=2))
    return 0

def _run_selected(args: argparse.Namespace, env: dict[str, str]) -> int:
    # Only launch and run carry a client; every other subcommand goes straight
    # to the profile engine.
    adapter = (
        EFFECTIVE_ADAPTERS.get(getattr(args, "cli", None))
        if args.profile_tool_command in {"launch", "run"}
        else None
    )
    if adapter is not None and not args.fresh:
        try:
            return adapter["run"](args, env)
        except _MigrationError as error:
            print(f"{args.cli} 启动失败：{error}", file=sys.stderr)
            return 2
    completed = subprocess.run(_profile_args(args), env=env, check=False)
    return completed.returncode

def _ensure_capability_store_dirs(project: Path) -> None:
    capabilities = project / ".cap" / "capabilities"
    if not capabilities.is_dir():
        return
    for kind in CAPABILITY_KINDS:
        (capabilities / kind).mkdir(exist_ok=True)

def main(argv: list[str] | None = None) -> int:
    raw_args = list(sys.argv[1:] if argv is None else argv)
    passthrough: list[str] = []
    if "--" in raw_args:
        separator = raw_args.index("--")
        passthrough = raw_args[separator + 1 :]
        raw_args = raw_args[:separator]
    parser = _build_parser()
    args = parser.parse_args(raw_args)
    if hasattr(args, "profile_tool_command") and args.profile_tool_command in {"launch", "run"}:
        args.client_args = passthrough
    if args.command is None and not _require_tty(
        "裸 cap",
        "cap use <profile> --cli <client> [-- <客户端参数>]",
    ):
        return 2
    if (
        getattr(args, "profile_tool_command", None) == "explain"
        and args.profile is None
        and not _require_tty("cap show", "cap show <profile> [--cli <client>]")
    ):
        return 2
    if args.command == "skills-validate":
        report = _skill_metadata_report(Path(args.project).expanduser().resolve())
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["standard_conformance"] == "ok" else 2
    if args.command == "migrate-omp-runtime":
        return _migrate_omp_runtime(args)
    _ensure_capability_store_dirs(Path(args.project).expanduser().resolve())
    if getattr(args, "profile_tool_command", None) == "verify":
        report = _skill_metadata_report(Path(args.project).expanduser().resolve())
        if report["standard_conformance"] != "ok":
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 2
    real_home = Path(args.home).expanduser().resolve(strict=True)
    if not real_home.is_dir():
        parser.error(f"--home 必须是目录: {real_home}")
    args._real_home = str(real_home)
    env = os.environ.copy()
    env["HOME"] = str(real_home)
    if getattr(args, "profile_tool_command", None) == "clients":
        print(json.dumps(_client_inventory(), ensure_ascii=False, indent=2))
        return 0
    if getattr(args, "profile_tool_command", None) == "agents":
        print(json.dumps({"agents": _available_profiles(args, env)}, ensure_ascii=False, indent=2))
        return 0
    if args.command is None:
        return _tui_use(args, env)
    if getattr(args, "profile_tool_command", None) == "explain":
        return _show(args, env)
    if getattr(args, "profile_tool_command", None) == "run" and not args.client_args:
        print(
            "cap run 需要在 -- 后提供客户端 batch 参数；否则目标 CLI 可能进入交互/恢复等待，看起来像卡住。\n"
            "示例：cap run agent-assembler -- -p \"帮我装配一个 review-agent\"\n"
            "如果要交互式启动，请使用裸 cap",
            file=sys.stderr,
        )
        return 2
    return _run_selected(args, env)


if __name__ == "__main__":
    raise SystemExit(main())
