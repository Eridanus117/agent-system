"""OMP runtime, generation, migration, and launch implementation."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import tomllib
import yaml

from agent_system.adapter.common import (
    AdapterError,
    _assert_managed_path,
    _deep_overlay,
    _digest_bytes,
    _digest_json,
    _reject_unsafe_tree,
    _replace_generation_placeholder,
    _safe_remove_tree,
    _tree_digest,  # noqa: F401
    _validate_private_runtime,
    generation_source_context,
    materialize_generation,
    render_portable_tree,
    verify_generation,
)
from agent_system.cap.config import (
    AMBIENT_CONFIG_ENV,
    DEFAULT_OMP_RUNTIME_ID,
    DEFAULT_REAL_HOME,
    OMP_AMBIENT_AUTH_ENV,
    OMP_AMBIENT_MCP_DENYLIST,
    RUNNABLE_PROFILES,
    SKILL_NAME_PATTERN,
    _is_ambient_credential_name,
)
from agent_system.cap.support import (
    _base_args,
    _binding_args,
    _passthrough,
    _run_path,
    _workdir,
)


def _agent_home_root(args: argparse.Namespace) -> Path:
    return Path(args.agent_home_root).expanduser().absolute()

def _runtime_real_home(args: argparse.Namespace) -> Path:
    return Path(
        getattr(args, "_real_home", getattr(args, "home", DEFAULT_REAL_HOME))
    ).expanduser().absolute()

def _omp_runtime_id(args: argparse.Namespace) -> str:
    value = str(getattr(args, "omp_runtime_id", DEFAULT_OMP_RUNTIME_ID))
    if not SKILL_NAME_PATTERN.fullmatch(value):
        raise _MigrationError(
            "OMP runtime id must be a lowercase kebab-case identifier"
        )
    return value

def _agent_home_dir(args: argparse.Namespace) -> Path:
    parent = (
        _runtime_real_home(args)
        / ".agent-system-state"
        / "runtimes"
        / "omp"
    )
    expected = parent / _omp_runtime_id(args)
    explicit_root = getattr(args, "omp_runtime_root", None)
    if explicit_root:
        candidate = Path(explicit_root).expanduser().absolute()
        if candidate != expected:
            raise _MigrationError(
                "explicit OMP runtime root must equal the approved HOME/id path"
            )
    return expected

def _project_shared_omp_home(args: argparse.Namespace) -> Path:
    return _agent_home_root(args) / "shared" / "omp"

def _legacy_omp_homes(args: argparse.Namespace) -> dict[str, Path]:
    root = _agent_home_root(args)
    return {
        profile: root / profile / "omp"
        for profile in RUNNABLE_PROFILES
    }

def _global_render_root(args: argparse.Namespace) -> Path:
    return (
        _runtime_real_home(args)
        / ".agent-system-state"
        / "renders"
        / "omp"
    )

def _profile_render_parent(args: argparse.Namespace) -> Path:
    return _global_render_root(args)

def _migration_backup_root(args: argparse.Namespace) -> Path:
    return (
        _agent_home_root(args)
        / "migrations"
        / "backup"
        / "global-omp-runtime"
    )

def _shared_runtime_marker(args: argparse.Namespace) -> Path:
    return _agent_home_dir(args) / ".cap-shared-runtime.json"

# The historical name is kept so existing raises, excepts and importers keep
# working; the type itself is now shared with every other adapter.
_MigrationError = AdapterError

_SHARED_PREFERENCE_SOURCE_VERSION = 1
_SHARED_PREFERENCE_FIELDS = frozenset(
    {
        "advisor",
        "colorBlindMode",
        "composer",
        "cycleOrder",
        "defaultThinkingLevel",
        "disabledProviders",
        "display",
        "enabledModels",
        "extendedContext",
        "modelProviderOrder",
        "modelRoles",
        "modelTags",
        "statusLine",
        "symbolPreset",
        "textVerbosity",
        "theme",
        "thinkingBudgets",
        "tier",
    }
)

_SHARED_PROVIDER_ENDPOINT_ENV = frozenset(
    {
        "ANTHROPIC_BASE_URL",
        "AZURE_OPENAI_BASE_URL",
        "GEMINI_BASE_URL",
        "KIMI_CODE_BASE_URL",
        "LM_STUDIO_BASE_URL",
        "OLLAMA_BASE_URL",
        "OPENAI_BASE_URL",
        "OPENROUTER_BASE_URL",
    }
)

@dataclass(frozen=True)
class _RuntimeSummary:
    label: str
    root: Path
    exists: bool
    auth_count: int
    auth_digest: str
    settings_digest: str
    schema_digest: str
    config: dict[str, object]
    sessions: Mapping[str, str]

def _strip_legacy_broker(config: dict[str, object]) -> dict[str, object]:
    copied = json.loads(json.dumps(config))
    auth = copied.get("auth")
    if isinstance(auth, dict):
        auth.pop("broker", None)
        if not auth:
            copied.pop("auth", None)
    copied.setdefault("memory", {})
    memory = copied["memory"]
    if not isinstance(memory, dict):
        raise _MigrationError("OMP setting memory must be an object")
    memory["backend"] = "off"
    return copied

def _read_runtime_config(root: Path, label: str) -> dict[str, object]:
    path = root / "config.yml"
    if not path.is_file():
        return {"memory": {"backend": "off"}}
    try:
        parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        raise _MigrationError(f"{label} config.yml is invalid") from error
    if parsed is None:
        parsed = {}
    if not isinstance(parsed, dict):
        raise _MigrationError(f"{label} config.yml must be an object")
    return _strip_legacy_broker(parsed)

def _merge_runtime_config(
    left: Mapping[str, object], right: Mapping[str, object], prefix: str = ""
) -> dict[str, object]:
    merged: dict[str, object] = {}
    for key in sorted(set(left) | set(right)):
        key_path = f"{prefix}.{key}" if prefix else key
        if key not in left:
            merged[key] = right[key]
            continue
        if key not in right:
            merged[key] = left[key]
            continue
        left_value = left[key]
        right_value = right[key]
        if isinstance(left_value, dict) and isinstance(right_value, dict):
            merged[key] = _merge_runtime_config(
                left_value, right_value, key_path
            )
        elif left_value == right_value:
            merged[key] = left_value
        else:
            raise _MigrationError(
                f"OMP settings conflict at {key_path}"
            )
    return merged

def _sqlite_value_digest(value: object) -> object:
    if isinstance(value, bytes):
        return {"bytes": _digest_bytes(value)}
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)

def _sqlite_rows_digest(
    connection: sqlite3.Connection, query: str
) -> str:
    rows = [
        [_sqlite_value_digest(value) for value in row]
        for row in connection.execute(query).fetchall()
    ]
    return _digest_json(rows)

def _database_summary(
    path: Path, label: str
) -> tuple[int, str, str, str]:
    if not path.is_file():
        return 0, _digest_json([]), _digest_json([]), _digest_json([])
    try:
        writer = sqlite3.connect(path, timeout=0.05)
        try:
            writer.execute("BEGIN IMMEDIATE")
            writer.rollback()
        finally:
            writer.close()
        connection = sqlite3.connect(
            f"file:{path}?mode=ro", uri=True, timeout=0.05
        )
        try:
            if connection.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise _MigrationError(f"{label} agent.db failed quick_check")
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            required = {
                "auth_credentials",
                "auth_schema_version",
                "schema_version",
                "settings",
            }
            if not required.issubset(tables):
                raise _MigrationError(f"{label} agent.db schema is incomplete")
            auth_rows = connection.execute(
                "SELECT provider, credential_type, identity_key "
                "FROM auth_credentials "
                "WHERE disabled_cause IS NULL "
                "ORDER BY provider, credential_type, identity_key"
            ).fetchall()
            auth_projection = [
                [
                    provider,
                    credential_type,
                    _digest_bytes((identity_key or "").encode("utf-8")),
                ]
                for provider, credential_type, identity_key in auth_rows
            ]
            settings_digest = _sqlite_rows_digest(
                connection, "SELECT * FROM settings ORDER BY rowid"
            )
            schema_digest = _digest_json(
                {
                    "auth": connection.execute(
                        "SELECT * FROM auth_schema_version ORDER BY rowid"
                    ).fetchall(),
                    "agent": connection.execute(
                        "SELECT * FROM schema_version ORDER BY rowid"
                    ).fetchall(),
                }
            )
            return (
                len(auth_rows),
                _digest_json(auth_projection),
                settings_digest,
                schema_digest,
            )
        finally:
            connection.close()
    except _MigrationError:
        raise
    except sqlite3.Error as error:
        raise _MigrationError(
            f"{label} agent.db is busy or unreadable"
        ) from error

def _session_inventory(root: Path, label: str) -> dict[str, str]:
    sessions = root / "sessions"
    if not sessions.exists():
        return {}
    inventory: dict[str, str] = {}
    for path in sorted(sessions.rglob("*")):
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise _MigrationError(f"{label} sessions contain a symlink")
        if stat.S_ISDIR(info.st_mode):
            continue
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise _MigrationError(
                f"{label} sessions contain an unsafe file"
            )
        relative = path.relative_to(sessions).as_posix()
        inventory[relative] = _digest_bytes(path.read_bytes())
    return inventory

def _runtime_summary(
    label: str, root: Path, *, private_root: Path
) -> _RuntimeSummary:
    if not root.exists():
        return _RuntimeSummary(
            label,
            root,
            False,
            0,
            _digest_json([]),
            _digest_json([]),
            _digest_json([]),
            {"memory": {"backend": "off"}},
            {},
        )
    _validate_private_runtime(root, label, private_root=private_root)
    _reject_unsafe_tree(root, label)
    auth_count, auth_digest, db_settings, schema_digest = (
        _database_summary(root / "agent.db", label)
    )
    config = _read_runtime_config(root, label)
    settings_digest = _digest_json(
        {"database": db_settings, "yaml": config}
    )
    return _RuntimeSummary(
        label,
        root,
        True,
        auth_count,
        auth_digest,
        settings_digest,
        schema_digest,
        config,
        _session_inventory(root, label),
    )

def _choose_canonical(
    summaries: Mapping[str, _RuntimeSummary],
) -> str | None:
    existing = [
        profile for profile, summary in summaries.items() if summary.exists
    ]
    if not existing:
        return None
    if len(existing) == 1:
        return existing[0]
    general = summaries["general"]
    helper = summaries["agent-assembler"]
    if general.schema_digest != helper.schema_digest:
        raise _MigrationError("legacy OMP database schemas differ")
    if general.auth_count and helper.auth_count:
        if general.auth_digest != helper.auth_digest:
            raise _MigrationError("legacy OMP authentication identities differ")
        return "general"
    if helper.auth_count:
        return "agent-assembler"
    return "general"

def _merge_session_inventory(
    summaries: Mapping[str, _RuntimeSummary],
) -> dict[str, tuple[str, str]]:
    merged: dict[str, tuple[str, str]] = {}
    for label, summary in summaries.items():
        if not summary.exists:
            continue
        for relative, digest in summary.sessions.items():
            existing = merged.get(relative)
            if existing and existing[1] != digest:
                raise _MigrationError(
                    f"OMP Session conflict at {relative}"
                )
            merged[relative] = (label, digest)
    return merged

def _is_initialized_empty_global(
    summary: _RuntimeSummary,
    marker: Mapping[str, object] | None,
) -> bool:
    if not summary.exists or marker is None:
        return False
    allowed_names = {
        ".cap-shared-runtime.json",
        "config.yml",
        "mcp.json",
        "sessions",
    }
    if {
        path.name for path in summary.root.iterdir()
    } - allowed_names:
        return False
    return (
        marker.get("version") == 2
        and marker.get("canonical") is None
        and marker.get("migration_complete") is True
        and marker.get("session_files", 0) == 0
        and summary.auth_count == 0
        and not summary.sessions
        and summary.config == {"memory": {"backend": "off"}}
    )

def _migration_plan(
    args: argparse.Namespace,
) -> tuple[
    dict[str, object],
    dict[str, _RuntimeSummary],
    str | None,
    dict[str, object],
    dict[str, tuple[str, str]],
]:
    project_root = _agent_home_root(args)
    if project_root.exists():
        _assert_managed_path(
            project_root.parent, project_root, "agent home root"
        )
    source = _runtime_summary(
        "project-shared",
        _project_shared_omp_home(args),
        private_root=_agent_home_root(args),
    )
    target_root = _agent_home_dir(args)
    target = _runtime_summary(
        "global", target_root, private_root=_runtime_real_home(args)
    )
    marker_payload: dict[str, object] | None = None
    if target.exists:
        marker = _shared_runtime_marker(args)
        if not marker.is_file():
            raise _MigrationError(
                "global OMP runtime exists without a migration marker"
            )
        try:
            marker_payload = json.loads(
                marker.read_text(encoding="utf-8")
            )
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise _MigrationError(
                "global OMP migration marker is invalid"
            ) from error
        if (
            marker_payload.get("version") != 2
            or marker_payload.get("runtime_id") != _omp_runtime_id(args)
        ):
            raise _MigrationError(
                "global OMP migration marker does not match runtime id"
            )
    summaries = {"project-shared": source, "global": target}
    if target.exists and not source.exists:
        public = {
            "status": "already-global",
            "runtime_id": _omp_runtime_id(args),
            "source": {"exists": False},
            "target": {
                "exists": True,
                "auth_entries": target.auth_count,
                "auth_digest": target.auth_digest,
                "settings_digest": target.settings_digest,
                "schema_digest": target.schema_digest,
                "session_files": len(target.sessions),
            },
            "session_files": len(target.sessions),
            "writes_planned": False,
        }
        return public, summaries, "global", target.config, {}
    if source.exists and target.exists:
        target_has_database = (target.root / "agent.db").is_file()
        if target_has_database:
            if source.schema_digest != target.schema_digest:
                raise _MigrationError(
                    "project and global OMP database schemas differ"
                )
            if (
                source.auth_count
                and target.auth_count
                and source.auth_digest != target.auth_digest
            ):
                raise _MigrationError(
                    "project and global OMP authentication identities differ"
                )
            canonical = (
                "global" if target.auth_count else "project-shared"
            )
        elif _is_initialized_empty_global(target, marker_payload):
            canonical = "project-shared"
        else:
            raise _MigrationError(
                "global OMP runtime is incomplete without agent.db"
            )
        config = _merge_runtime_config(target.config, source.config)
    elif source.exists:
        canonical = "project-shared"
        config = source.config
    else:
        canonical = None
        config = {"memory": {"backend": "off"}}
    config = _strip_legacy_broker(config)
    sessions = _merge_session_inventory(summaries)
    public = {
        "status": "ready",
        "runtime_id": _omp_runtime_id(args),
        "source": {
            "exists": source.exists,
            "auth_entries": source.auth_count,
            "auth_digest": source.auth_digest,
            "settings_digest": source.settings_digest,
            "schema_digest": source.schema_digest,
            "session_files": len(source.sessions),
        },
        "target": {
            "exists": target.exists,
            "auth_entries": target.auth_count,
            "auth_digest": target.auth_digest,
            "settings_digest": target.settings_digest,
            "schema_digest": target.schema_digest,
            "session_files": len(target.sessions),
        },
        "canonical": canonical,
        "merged_settings_digest": _digest_json(config),
        "session_files": len(sessions),
        "writes_planned": True,
    }
    return public, summaries, canonical, config, sessions

_MIGRATION_SKIP_NAMES = {
    ".cap-rendered",
    "config.yml",
    "config.yml.lock",
    "home",
    "mcp.json",
    "sessions",
    "skills",
    "system-prompt.md",
    "terminal-sessions",
}

def _sqlite_backup(source: Path, target: Path) -> None:
    source_connection = sqlite3.connect(
        f"file:{source}?mode=ro", uri=True, timeout=0.1
    )
    target_connection = sqlite3.connect(target)
    try:
        source_connection.backup(target_connection)
    finally:
        target_connection.close()
        source_connection.close()
    target.chmod(0o600)

def _copy_runtime_payload(source: Path, target: Path) -> None:
    target.mkdir(mode=0o700)
    for entry in sorted(source.iterdir(), key=lambda item: item.name):
        if (
            entry.name in _MIGRATION_SKIP_NAMES
            or entry.name.endswith("-wal")
            or entry.name.endswith("-shm")
            or entry.name.endswith(".lock")
        ):
            continue
        destination = target / entry.name
        if entry.is_dir():
            shutil.copytree(entry, destination)
        elif entry.suffix == ".db":
            _sqlite_backup(entry, destination)
        elif entry.is_file():
            shutil.copy2(entry, destination)
        else:
            raise _MigrationError("legacy OMP runtime contains unsafe state")

def _write_runtime_config(
    target: Path, config: Mapping[str, object]
) -> None:
    path = target / "config.yml"
    path.write_text(
        yaml.safe_dump(
            dict(config),
            allow_unicode=True,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    path.chmod(0o600)

def _write_shared_mcp_policy(target: Path) -> None:
    policy = {
        "mcpServers": {},
        "disabledServers": list(OMP_AMBIENT_MCP_DENYLIST),
    }
    path = target / "mcp.json"
    path.write_text(
        json.dumps(policy, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    path.chmod(0o600)

def _validate_shared_mcp_policy(target: Path) -> None:
    path = target / "mcp.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise _MigrationError(
            "shared OMP MCP denylist is missing or invalid"
        ) from error
    expected = {
        "mcpServers": {},
        "disabledServers": list(OMP_AMBIENT_MCP_DENYLIST),
    }
    if payload != expected:
        raise _MigrationError("shared OMP MCP denylist drifted")

def _copy_merged_sessions(
    summaries: Mapping[str, _RuntimeSummary],
    sessions: Mapping[str, tuple[str, str]],
    target: Path,
) -> None:
    session_root = target / "sessions"
    session_root.mkdir(mode=0o700)
    for relative, (profile, expected_digest) in sorted(sessions.items()):
        source = summaries[profile].root / "sessions" / relative
        if _digest_bytes(source.read_bytes()) != expected_digest:
            raise _MigrationError(
                "legacy OMP Session changed during migration"
            )
        destination = session_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        shutil.copy2(source, destination)

def _backup_legacy_runtime(
    summaries: Mapping[str, _RuntimeSummary], backup: Path
) -> None:
    backup.mkdir(parents=True, mode=0o700)
    for profile, summary in summaries.items():
        if not summary.exists:
            continue
        destination = backup / profile
        _copy_runtime_payload(summary.root, destination)
        _write_runtime_config(destination, summary.config)
        _copy_merged_sessions(
            summaries,
            {
                relative: (profile, digest)
                for relative, digest in summary.sessions.items()
            },
            destination,
        )

def _apply_omp_runtime_migration(
    args: argparse.Namespace,
    public: dict[str, object],
    summaries: Mapping[str, _RuntimeSummary],
    canonical: str | None,
    config: Mapping[str, object],
    sessions: Mapping[str, tuple[str, str]],
) -> dict[str, object]:
    if public["status"] == "already-global":
        _write_shared_mcp_policy(_agent_home_dir(args))
        return {**public, "mcp_policy_refreshed": True}
    project_root = _agent_home_root(args)
    project_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    project_root.chmod(0o700)
    backup = _migration_backup_root(args)
    if backup.exists():
        raise _MigrationError("OMP migration backup already exists")
    target = _agent_home_dir(args)
    target_parent = target.parent
    target_parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    for private in (
        _runtime_real_home(args) / ".agent-system-state",
        target_parent,
    ):
        private.mkdir(parents=True, exist_ok=True, mode=0o700)
        private.chmod(0o700)
        _validate_private_runtime(
            private,
            "global CAP state directory",
            private_root=_runtime_real_home(args),
        )
    stage = target_parent / f".omp-stage-{os.getpid()}-{time.time_ns()}"
    old_target = target_parent / f".omp-old-{os.getpid()}-{time.time_ns()}"
    target_was_moved = False
    try:
        _backup_legacy_runtime(summaries, backup)
        if canonical is None:
            stage.mkdir(mode=0o700)
        else:
            _copy_runtime_payload(summaries[canonical].root, stage)
        _write_runtime_config(stage, config)
        _write_shared_mcp_policy(stage)
        _copy_merged_sessions(summaries, sessions, stage)
        marker = {
            "version": 2,
            "runtime_id": _omp_runtime_id(args),
            "canonical": canonical,
            "session_files": len(sessions),
            "settings_digest": _digest_json(config),
            "source_digest": _digest_json(
                {
                    label: {
                        "auth": summary.auth_digest,
                        "settings": summary.settings_digest,
                        "schema": summary.schema_digest,
                    }
                    for label, summary in summaries.items()
                    if summary.exists
                }
            ),
            "migration_complete": True,
        }
        (stage / ".cap-shared-runtime.json").write_text(
            json.dumps(marker, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        _runtime_summary(
            "staged global runtime",
            stage,
            private_root=_runtime_real_home(args),
        )
        if target.exists():
            os.rename(target, old_target)
            target_was_moved = True
        try:
            os.rename(stage, target)
        except BaseException:
            if target_was_moved:
                os.rename(old_target, target)
                target_was_moved = False
            raise
        if old_target.exists():
            shutil.rmtree(old_target)
            target_was_moved = False
    except BaseException:
        if stage.exists():
            shutil.rmtree(stage)
        if target_was_moved and old_target.exists() and not target.exists():
            os.rename(old_target, target)
        if backup.exists() and not target.exists():
            shutil.rmtree(backup)
        raise
    return {
        **public,
        "status": "migrated-global",
        "writes_planned": False,
        "backup_created": True,
    }

def _restore_runtime_from_backup(
    root: Path,
    destination: Path,
    backup: Path,
    label: str,
) -> None:
    if not backup.exists():
        return
    _reject_unsafe_tree(backup, f"{label} migration backup")
    if destination.exists() or destination.is_symlink():
        _safe_remove_tree(root, destination, label)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copytree(backup, destination)
    destination.chmod(0o700)


def _rollback_omp_runtime(args: argparse.Namespace) -> dict[str, object]:
    marker = _shared_runtime_marker(args)
    if not marker.is_file():
        raise _MigrationError("global OMP runtime is not available for rollback")
    try:
        payload = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise _MigrationError("global OMP marker is invalid") from error
    if (
        payload.get("version") != 2
        or payload.get("runtime_id") != _omp_runtime_id(args)
    ):
        raise _MigrationError("global OMP marker does not match runtime id")

    root = _agent_home_root(args)
    backup = _migration_backup_root(args)
    if not backup.is_dir():
        raise _MigrationError("OMP migration backup is missing")
    _assert_managed_path(root, backup, "migration backup")
    _reject_unsafe_tree(backup, "migration backup")

    project_runtime = _project_shared_omp_home(args)
    global_runtime = _agent_home_dir(args)
    project_backup = backup / "project-shared"
    global_backup = backup / "global"

    if project_runtime.exists() or project_runtime.is_symlink():
        _assert_managed_path(root, project_runtime, "project OMP runtime")
        _reject_unsafe_tree(project_runtime, "project OMP runtime")
    if global_runtime.exists() or global_runtime.is_symlink():
        _assert_managed_path(
            _runtime_real_home(args) / ".agent-system-state",
            global_runtime,
            "global OMP runtime",
        )
        _reject_unsafe_tree(global_runtime, "global OMP runtime")

    if project_backup.is_dir():
        _restore_runtime_from_backup(
            root, project_runtime, project_backup, "project OMP runtime"
        )
    if global_backup.is_dir():
        _restore_runtime_from_backup(
            _runtime_real_home(args) / ".agent-system-state",
            global_runtime,
            global_backup,
            "global OMP runtime",
        )
    elif global_runtime.exists() or global_runtime.is_symlink():
        _safe_remove_tree(
            _runtime_real_home(args) / ".agent-system-state",
            global_runtime,
            "global OMP runtime",
        )

    restored = [
        label
        for label, path in (
            ("project-shared-runtime", project_backup),
            ("global-runtime", global_backup),
        )
        if path.is_dir()
    ]
    _safe_remove_tree(root, backup, "migration backup")
    return {
        "status": "rolled-back",
        "runtime_id": _omp_runtime_id(args),
        "restored": restored,
    }


def _cleanup_legacy_omp_runtime(args: argparse.Namespace) -> dict[str, object]:
    marker = _shared_runtime_marker(args)
    if not marker.is_file():
        raise _MigrationError(
            "global OMP runtime is not verified for cleanup"
        )
    try:
        payload = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise _MigrationError("global OMP marker is invalid") from error
    if (
        payload.get("version") != 2
        or payload.get("runtime_id") != _omp_runtime_id(args)
    ):
        raise _MigrationError("global OMP marker does not match runtime id")
    root = _agent_home_root(args)
    # The global render CAS and the persistent runtime survive cleanup: they are
    # current state, not migration leftovers. `renders/` used to be a per-project
    # cache, but after the v3 move to `$HOME/.agent-system-state` it is the
    # parent of `renders/omp`, so removing it would take every generation for
    # every project and runtime-id with it.
    protected = (_global_render_root(args), _agent_home_dir(args))
    removed: list[str] = []
    for label, path in (
        ("project-shared-runtime", _project_shared_omp_home(args)),
        ("migration-backup", _migration_backup_root(args)),
    ):
        if _safe_remove_tree(root, path, label, protected=protected):
            removed.append(label)
    return {
        "status": "cleaned-project-state",
        "runtime_id": _omp_runtime_id(args),
        "removed": removed,
    }

def _migrate_omp_runtime(args: argparse.Namespace) -> int:
    try:
        if getattr(args, "rollback", False):
            payload = _rollback_omp_runtime(args)
        elif args.cleanup:
            payload = _cleanup_legacy_omp_runtime(args)
        else:
            public, summaries, canonical, config, sessions = (
                _migration_plan(args)
            )
            payload = (
                _apply_omp_runtime_migration(
                    args,
                    public,
                    summaries,
                    canonical,
                    config,
                    sessions,
                )
                if args.apply
                else public
            )
    except (_MigrationError, OSError) as error:
        print(f"OMP runtime 迁移失败：{error}", file=sys.stderr)
        return 2
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0

def _require_shared_runtime_ready(args: argparse.Namespace) -> None:
    shared = _agent_home_dir(args)
    marker = _shared_runtime_marker(args)
    if not shared.is_dir() or not marker.is_file():
        if _project_shared_omp_home(args).exists():
            raise _MigrationError(
                "project OMP runtime requires `cap migrate-omp-runtime --apply`"
            )
        raise _MigrationError(
            "global OMP runtime requires `cap migrate-omp-runtime --apply`"
        )
    _assert_managed_path(
        _runtime_real_home(args), shared, "global OMP runtime"
    )
    _validate_private_runtime(
        shared, "global OMP runtime", private_root=_runtime_real_home(args)
    )
    try:
        payload = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise _MigrationError(
            "global OMP migration marker is invalid"
        ) from error
    if (
        payload.get("version") != 2
        or payload.get("runtime_id") != _omp_runtime_id(args)
        or payload.get("migration_complete") is not True
    ):
        raise _MigrationError(
            "global OMP migration is incomplete or mismatched"
        )
    _validate_shared_mcp_policy(shared)

def _read_omp_runtime_policy(args: argparse.Namespace) -> dict[str, object]:
    """Read the project-owned semantic OMP policy, preserving unknown fields."""

    path = Path(args.project).expanduser().resolve() / ".cap" / "runtime" / "omp.toml"
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as error:
        raise _MigrationError(f"invalid OMP runtime policy: {path}") from error
    if data.get("version") != 1 or data.get("client") != "omp":
        raise _MigrationError("OMP runtime policy must target version 1 client omp")
    policy = data.get("policy")
    if not isinstance(policy, dict):
        raise _MigrationError("OMP runtime policy.policy must be a table")
    preference_source = policy.get("shared_preference_source", "omp-user")
    if preference_source != "omp-user":
        raise _MigrationError(
            "OMP policy shared_preference_source must be omp-user"
        )
    memory_backend = policy.get("memory_backend", "off")
    if memory_backend != "off":
        raise _MigrationError("OMP policy memory_backend must be off")
    project_mcp = policy.get("enable_project_mcp", False)
    if type(project_mcp) is not bool:
        raise _MigrationError("OMP policy enable_project_mcp must be boolean")
    return {
        **policy,
        "shared_preference_source": preference_source,
        "memory_backend": memory_backend,
        "enable_project_mcp": project_mcp,
    }
def _shared_omp_preference_path(args: argparse.Namespace) -> Path:
    """Return the sole user-owned OMP preference file CAP may project."""

    configured = getattr(args, "omp_preference_root", None)
    root = (
        Path(configured).expanduser().absolute()
        if configured
        else _runtime_real_home(args) / ".omp" / "agent"
    )
    return root / "config.yml"


def _json_value(value: object, context: str) -> object:
    """Reject values that cannot safely enter the canonical preference digest."""

    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list):
        return [_json_value(item, f"{context}[]") for item in value]
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        return {
            key: _json_value(item, f"{context}.{key}")
            for key, item in sorted(value.items())
        }
    raise _MigrationError(f"{context} must contain only JSON values")


def _read_shared_omp_config(args: argparse.Namespace) -> dict[str, object]:
    """Read the explicitly selected normal-OMP configuration file."""

    path = _shared_omp_preference_path(args)
    if not path.is_file():
        return {}
    try:
        parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        raise _MigrationError(f"shared OMP preference is invalid: {path}") from error
    if parsed is None:
        return {}
    if not isinstance(parsed, dict) or not all(
        isinstance(key, str) for key in parsed
    ):
        raise _MigrationError("shared OMP preference must be an object")
    return parsed


def _read_global_omp_preference(args: argparse.Namespace) -> dict[str, object]:
    """Read the explicit user preference source through a capability-safe allowlist."""

    parsed = _read_shared_omp_config(args)
    return {
        key: _json_value(value, f"shared OMP preference.{key}")
        for key, value in sorted(parsed.items())
        if key in _SHARED_PREFERENCE_FIELDS
    }


def _shared_omp_auth(args: argparse.Namespace) -> tuple[dict[str, str], dict[str, object]]:
    """Resolve only a configured local auth-broker, never ambient credentials."""

    auth = _read_shared_omp_config(args).get("auth")
    if auth is None:
        return {}, {"configured": False}
    if not isinstance(auth, dict):
        raise _MigrationError("shared OMP auth must be an object")
    broker = auth.get("broker")
    if broker is None:
        return {}, {"configured": False}
    if not isinstance(broker, dict):
        raise _MigrationError("shared OMP auth.broker must be an object")
    url = broker.get("url")
    if not isinstance(url, str) or not url:
        raise _MigrationError("shared OMP auth.broker.url must be a non-empty string")
    parsed_url = urlparse(url)
    is_loopback_http = (
        parsed_url.scheme == "http"
        and parsed_url.hostname in {"127.0.0.1", "::1", "localhost"}
    )
    if not (parsed_url.scheme == "https" or is_loopback_http):
        raise _MigrationError(
            "shared OMP auth broker must use https or loopback http"
        )
    token = broker.get("token")
    if token is None:
        token_path = _shared_omp_preference_path(args).parent / "auth-broker.token"
        try:
            token = token_path.read_text(encoding="utf-8").strip()
        except OSError as error:
            raise _MigrationError(
                "shared OMP auth broker token is missing"
            ) from error
    if not isinstance(token, str) or not token:
        raise _MigrationError("shared OMP auth broker token must be non-empty")
    return (
        {
            "OMP_AUTH_BROKER_URL": url,
            "OMP_AUTH_BROKER_TOKEN": token,
        },
        {
            "configured": True,
            "mode": "broker",
            "source_digest": _digest_json({"url": url}),
        },
    )


def _shared_provider_endpoints(
    base_env: Mapping[str, str],
) -> tuple[dict[str, str], dict[str, object]]:
    """Pass only approved, credential-free provider endpoint variables through."""

    endpoints: dict[str, str] = {}
    for name in sorted(_SHARED_PROVIDER_ENDPOINT_ENV):
        value = base_env.get(name)
        if not value:
            continue
        parsed_url = urlparse(value)
        is_loopback_http = (
            parsed_url.scheme == "http"
            and parsed_url.hostname in {"127.0.0.1", "::1", "localhost"}
        )
        if (
            not (parsed_url.scheme == "https" or is_loopback_http)
            or parsed_url.username is not None
            or parsed_url.password is not None
            or parsed_url.query
            or parsed_url.fragment
        ):
            raise _MigrationError(
                f"shared provider endpoint {name} must be credential-free https "
                "or loopback http"
            )
        endpoints[name] = value
    return endpoints, {
        "names": sorted(endpoints),
        "digest": _digest_json(endpoints),
    }


def _effective_config_template(
    portable_config: Mapping[str, object],
    skill_names: list[str],
    policy: Mapping[str, object],
    global_preference: Mapping[str, object],
) -> dict[str, object]:
    """Merge user appearance/model preferences without reopening capability gates."""

    memory_backend = policy.get("memory_backend", "off")
    project_mcp = policy.get("enable_project_mcp", False)
    if memory_backend != "off" or project_mcp is not False:
        raise _MigrationError("OMP policy rejected unsafe global preference")
    return _deep_overlay(
        _deep_overlay(portable_config, global_preference),
        {
            "memory": {"backend": memory_backend},
            "mcp": {"enableProjectConfig": project_mcp},
            "skills": {
                "customDirectories": [
                    "<PROFILE_GENERATION>/skills"
                ],
                "includeSkills": skill_names,
                "enableCodexUser": False,
                "enableClaudeUser": False,
                "enableClaudeProject": False,
                "enablePiUser": False,
                "enablePiProject": False,
                "enableAgentsUser": False,
                "enableAgentsProject": False,
            },
        },
    )

def _read_portable_config(rendered: Path) -> dict[str, object]:
    path = rendered / "config.yml"
    if not path.is_file():
        return {}
    try:
        parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        raise _MigrationError(
            "portable OMP config is invalid"
        ) from error
    if parsed is None:
        return {}
    if not isinstance(parsed, dict):
        raise _MigrationError(
            "portable OMP config must be an object"
        )
    return parsed

def _generation_source_context(
    args: argparse.Namespace, portable_hash: str
) -> tuple[dict[str, object], str]:
    return generation_source_context(
        profile=args.profile,
        client="omp",
        project=Path(args.project),
        binding_dir=Path(args.binding_dir),
        portable_hash=portable_hash,
    )

def _verify_profile_generation(
    generation: Path,
    profile: str,
    portable_hash: str,
    effective_hash: str,
    source_context: Mapping[str, object],
    source_digest: str,
    runtime_policy: Mapping[str, object],
) -> dict[str, object]:
    return verify_generation(
        generation,
        {
            "version": 2,
            "profile": profile,
            "portable_tree_hash": portable_hash,
            "effective_render_hash": effective_hash,
            "source_context": dict(source_context),
            "runtime_policy": dict(runtime_policy),
            "source_digest": source_digest,
        },
    )

def _materialize_profile_generation(
    args: argparse.Namespace,
    env: dict[str, str],
) -> tuple[Path, str, str, list[str], dict[str, str]]:
    with tempfile.TemporaryDirectory(
        prefix=f"cap-render-{args.profile}-omp-"
    ) as temporary:
        rendered = Path(temporary)
        portable_hash, rendered_skills = render_portable_tree(
            command=[
                *_base_args(args),
                "materialize",
                "--client",
                "omp",
                "--profile",
                args.profile,
                "--output",
                temporary,
                *_binding_args(args),
            ],
            env=env,
            output=rendered,
            client="OMP",
        )
        skill_names = list(rendered_skills)
        policy = _read_omp_runtime_policy(args)
        global_preference = _read_global_omp_preference(args)
        shared_auth, shared_auth_state = _shared_omp_auth(args)
        shared_endpoints, shared_endpoint_state = _shared_provider_endpoints(env)
        shared_launch_env = {**shared_endpoints, **shared_auth}
        config_template = _effective_config_template(
            _read_portable_config(rendered),
            skill_names,
            policy,
            global_preference,
        )
        fixed_launch = {
            "extension": "explicit",
            "no_extensions": True,
            "no_rules": True,
            "skills": skill_names,
            "runtime_policy": {
                "project": policy,
                "shared_preference": {
                    "version": _SHARED_PREFERENCE_SOURCE_VERSION,
                    "fields": sorted(global_preference),
                    "digest": _digest_json(global_preference),
                },
                "shared_auth": shared_auth_state,
                "shared_provider_endpoints": shared_endpoint_state,
                "effective": {
                    "memory_backend": policy["memory_backend"],
                    "enable_project_mcp": policy["enable_project_mcp"],
                },
            },
        }
        source_context, source_digest = _generation_source_context(
            args, portable_hash
        )
        effective_hash = _digest_json(
            {
                "version": 2,
                "source_context": source_context,
                "source_digest": source_digest,
                "config": config_template,
                "launch": fixed_launch,
            }
        )
        generation = (
            _profile_render_parent(args)
            / effective_hash.removeprefix("sha256:")
        )

        def verify(target: Path) -> object:
            return _verify_profile_generation(
                target,
                args.profile,
                portable_hash,
                effective_hash,
                source_context,
                source_digest,
                fixed_launch["runtime_policy"],
            )

        def write_payload(stage: Path) -> None:
            actual_config = _replace_generation_placeholder(
                config_template, generation
            )
            config_path = stage / "config.yml"
            config_path.write_text(
                yaml.safe_dump(
                    actual_config,
                    allow_unicode=True,
                    sort_keys=True,
                ),
                encoding="utf-8",
            )
            config_path.chmod(0o600)
            extension = stage / "extension"
            extension.mkdir(mode=0o700)
            mcp_source = stage / "mcp.json"
            if mcp_source.is_file():
                shutil.copy2(mcp_source, extension / ".mcp.json")

        materialize_generation(
            parent=generation.parent,
            generation=generation,
            source_tree=rendered,
            state_root=_runtime_real_home(args) / ".agent-system-state",
            private_root=_runtime_real_home(args),
            write_payload=write_payload,
            manifest_base={
                "version": 2,
                "profile": args.profile,
                "portable_tree_hash": portable_hash,
                "effective_render_hash": effective_hash,
                "source_context": source_context,
                "source_digest": source_digest,
                "skills": skill_names,
                "runtime_policy": fixed_launch["runtime_policy"],
            },
            verify=verify,
        )
        return generation, portable_hash, effective_hash, skill_names, shared_launch_env

def _omp_command(
    generation: Path,
    skill_names: list[str],
    forwarded: list[str],
) -> list[str]:
    executable = shutil.which("omp") or "omp"
    prompt = (
        (generation / "system-prompt.md")
        .read_text(encoding="utf-8")
        .strip()
        + "\n"
    )
    skill_args = (
        ["--skills", ",".join(skill_names)]
        if skill_names
        else ["--no-skills"]
    )
    return [
        executable,
        "--config",
        str(generation / "config.yml"),
        "--append-system-prompt",
        prompt,
        "--extension",
        str(generation / "extension"),
        "--no-extensions",
        *skill_args,
        "--no-rules",
        *forwarded,
    ]

def _omp_config_dir_value(agent_home: Path, real_home: Path) -> str:
    """Return the PI_CONFIG_DIR value omp's own contract accepts.

    omp resolves PI_CONFIG_DIR as a directory *name* under the user home
    (`getBaseConfigRoot()` joins `os.homedir()` with it) and only passes
    PI_CODING_AGENT_DIR through `path.resolve()`. Handing over an absolute
    path therefore yields `<home>/<absolute path>` and the run fails before it
    starts. Upstream confirmed this split is deliberate, so cap converts the
    managed runtime root into the home-relative name it is by construction.

    See can1357/oh-my-pi#9067 and
    work/records/2026-08-20-omp-windows-agent-dir/finding.md.
    """

    try:
        return agent_home.relative_to(real_home).as_posix()
    except ValueError as error:
        raise _MigrationError(
            "omp runtime root must live under the real home so that "
            f"PI_CONFIG_DIR can name it: {agent_home}"
        ) from error


def _agent_home_env(
    base_env: dict[str, str],
    agent_home: Path,
    generation: Path,
    real_home: Path,
    shared_auth: Mapping[str, str] | None = None,
) -> dict[str, str]:
    env = base_env.copy()
    for name in AMBIENT_CONFIG_ENV:
        env.pop(name, None)
    for name in OMP_AMBIENT_AUTH_ENV | {
        candidate
        for candidate in env
        if _is_ambient_credential_name(candidate)
    }:
        env[name] = ""
    env.pop("OMP_AUTH_BROKER_URL", None)
    env.pop("OMP_AUTH_BROKER_TOKEN", None)
    env["AWS_EC2_METADATA_DISABLED"] = "true"
    env["PI_AUTH_NO_BORROW"] = "1"
    env.update(
        {
            "HOME": str(real_home),
            "OMP_PROFILE": "default",
            "PI_CODING_AGENT_DIR": str(agent_home),
            "PI_CONFIG_DIR": _omp_config_dir_value(agent_home, real_home),
            "PI_CONFIG_FILES": str(
                generation / "config.yml"
            ),
            "PI_PROFILE": "default",
        }
    )
    env.update(shared_auth or {})
    return env

def _write_receipt(
    args: argparse.Namespace,
    receipt: Path,
    return_code: int,
    portable_hash: str,
    effective_hash: str,
    agent_home: Path,
    generation: Path,
) -> None:
    binding_path = (
        Path(args.binding_dir).expanduser()
        / f"{args.profile}.binding.json"
    )
    binding = json.loads(binding_path.read_text(encoding="utf-8"))
    manifest = json.loads(
        (generation / ".cap-generation.json").read_text(encoding="utf-8")
    )
    payload = {
        "version": 4,
        "client": args.cli,
        "profile": args.profile,
        "runtime_id": _omp_runtime_id(args),
        "global_runtime_root": str(agent_home),
        "global_generation": str(generation),
        "project_root": str(Path(args.project).expanduser().absolute()),
        "project_source_context": manifest["source_context"],
        "project_source_digest": manifest["source_digest"],
        "runtime_policy": manifest.get("runtime_policy", {}),
        "base_digest": binding.get(
            "base_digest", binding.get("machine_context_digest")
        ),
        "layer_digest": binding.get("layer_digest"),
        "effective_digest": binding.get("effective_digest"),
        "portable_tree_hash": portable_hash,
        "effective_render_hash": effective_hash,
        "workdir": str(_workdir(args)),
        "exit_code": return_code,
        "forwarded_argument_count": len(args.client_args),
    }
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

def _client_stdin(args: argparse.Namespace) -> int | None:
    """Return the stdin handle for one client launch.

    `run` is the batch entry point: omp blocks in its readPipedInput phase
    until stdin reaches EOF, so inheriting a pipe that never closes hangs the
    launch instead of running the forwarded prompt. `use` is interactive and
    must keep the real stdin.
    """

    if getattr(args, "profile_tool_command", None) == "run":
        return subprocess.DEVNULL
    return None


def _run_omp_agent_home(
    args: argparse.Namespace, env: dict[str, str]
) -> int:
    try:
        _require_shared_runtime_ready(args)
        (
            generation,
            portable_hash,
            effective_hash,
            skill_names,
            shared_auth,
        ) = _materialize_profile_generation(args, env)
    except _MigrationError as error:
        print(f"持久 OMP 启动失败：{error}", file=sys.stderr)
        return 2
    agent_home = _agent_home_dir(args)
    receipt = (
        Path(args.receipt).expanduser()
        if getattr(args, "receipt", None)
        else Path(_run_path(args, "receipt.json"))
    )
    workdir = _workdir(args)
    real_home = Path(
        getattr(
            args,
            "_real_home",
            os.environ.get("HOME") or Path.home(),
        )
    )
    completed = subprocess.run(
        _omp_command(
            generation,
            skill_names,
            _passthrough(args.client_args),
        ),
        cwd=str(workdir),
        env=_agent_home_env(
            env, agent_home, generation, real_home, shared_auth
        ),
        stdin=_client_stdin(args),
        check=False,
    )
    verified = subprocess.run(
        [
            *_base_args(args),
            "verify",
            *_binding_args(args),
        ],
        capture_output=True,
        check=False,
        env=env,
        text=True,
    )
    if verified.returncode != 0:
        print(
            verified.stderr.strip() or verified.stdout.strip(),
            file=sys.stderr,
        )
        return verified.returncode
    _write_receipt(
        args,
        receipt,
        completed.returncode,
        portable_hash,
        effective_hash,
        agent_home,
        generation,
    )
    return (
        completed.returncode
        if completed.returncode >= 0
        else 128 + abs(completed.returncode)
    )

