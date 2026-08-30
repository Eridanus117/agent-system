"""Claude runtime policy and the CAP-side effective configuration.

This module owns CAP semantics only. Every field below is named by CAP and is
stable across Claude versions; translating them into Claude's native files is
the projection step's job, and that is the only place Claude's own key names may
appear. Keeping the two apart means a Claude release that renames a native key
costs one projection change and an adapter version bump, not a rewrite of the
project declarations.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
from pathlib import Path

import tomllib

from agent_system.adapter.common import AdapterError

CLIENT = "claude"

# Verified against Claude Code 2.1.236 (`claude --help`). There is no "default"
# mode; the adapter change package records the observation.
PERMISSION_MODES = frozenset(
    {"acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan"}
)

# `bypassPermissions` disables every permission check. A project policy must not
# be able to select it, and neither may a role override or a user preference.
FORBIDDEN_PERMISSION_MODES = frozenset({"bypassPermissions"})

LOGIN_MODES = frozenset({"subscription", "bare"})

# Capability classes the adapter does not project yet. Declaring one for Claude
# fails closed rather than rendering a tree that silently lacks it.
UNSUPPORTED_CAPABILITIES = ("hooks", "plugins")

# The only user-level preference keys the adapter will read back out of the
# runtime namespace. Everything else there is authentication or session state
# and must never influence a render.
GLOBAL_PREFERENCE_KEYS = frozenset({"permission_mode"})


class ClaudeError(AdapterError):
    """Report a fail-closed Claude adapter error."""


def _project_root(args: argparse.Namespace) -> Path:
    return Path(args.project).expanduser().resolve()


def claude_runtime_policy_path(args: argparse.Namespace) -> Path:
    return _project_root(args) / ".cap" / "runtime" / "claude.toml"


def read_claude_runtime_policy(args: argparse.Namespace) -> dict[str, object]:
    """Read the project-owned semantic Claude policy, preserving unknown fields.

    Unknown fields stay in the returned mapping so they reach the runtime-policy
    evidence and the effective render hash, but the projection step never reads
    them. That is deliberate: an unrecognised field must be visible and must
    invalidate caches, yet must not be guessed into a native configuration key.
    """

    path = claude_runtime_policy_path(args)
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as error:
        raise ClaudeError(f"invalid Claude runtime policy: {path}") from error
    if data.get("version") != 1 or data.get("client") != CLIENT:
        raise ClaudeError(
            "Claude runtime policy must target version 1 client claude"
        )
    policy = data.get("policy")
    if not isinstance(policy, Mapping):
        raise ClaudeError("Claude runtime policy.policy must be a table")

    login_mode = policy.get("login_mode", "subscription")
    if login_mode not in LOGIN_MODES:
        raise ClaudeError(
            f"Claude policy login_mode must be one of {sorted(LOGIN_MODES)}"
        )

    permission_mode = policy.get("permission_mode", "manual")
    if permission_mode not in PERMISSION_MODES:
        raise ClaudeError(
            f"Claude policy permission_mode must be one of {sorted(PERMISSION_MODES)}"
        )
    if permission_mode in FORBIDDEN_PERMISSION_MODES:
        raise ClaudeError(
            f"Claude policy permission_mode {permission_mode} is a fixed system gate"
        )

    for name, default in (
        ("enable_project_mcp", False),
        ("auto_memory", False),
    ):
        value = policy.get(name, default)
        if type(value) is not bool:
            raise ClaudeError(f"Claude policy {name} must be boolean")

    enable_user_assets = policy.get("enable_user_assets", False)
    if enable_user_assets is not False:
        raise ClaudeError(
            "Claude policy enable_user_assets must be false; user-level skills, "
            "subagents and commands are a fixed system gate"
        )

    return {
        **policy,
        "login_mode": login_mode,
        "permission_mode": permission_mode,
        "enable_project_mcp": bool(policy.get("enable_project_mcp", False)),
        "enable_user_assets": False,
        "auto_memory": bool(policy.get("auto_memory", False)),
    }


def read_global_claude_preference(runtime_root: Path) -> dict[str, object]:
    """Read the whitelisted user preference from one Claude runtime namespace.

    The runtime namespace also holds credentials and session state, so this
    reads a fixed allowlist rather than the whole file. A missing or unreadable
    file yields an empty preference: the user simply has no stored preference,
    which is not an error.
    """

    path = runtime_root.expanduser().absolute() / "settings.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ClaudeError(f"invalid Claude runtime preference: {path}") from error
    if not isinstance(data, Mapping):
        raise ClaudeError("Claude runtime preference must be an object")
    return {
        key: value for key, value in data.items() if key in GLOBAL_PREFERENCE_KEYS
    }


def effective_claude_config(
    skill_names: tuple[str, ...],
    mcp_servers: Mapping[str, object],
    policy: Mapping[str, object],
    global_preference: Mapping[str, object],
    declared_unsupported: Mapping[str, tuple[str, ...]],
) -> dict[str, object]:
    """Compose the CAP-side effective configuration for one Claude render.

    Composition order is fixed and matches OMP:

        system fixed gates > project policy > role override > user preference

    The user preference is therefore only consulted where the project policy
    left a field unset, and it can never widen a fixed gate.
    """

    for kind in UNSUPPORTED_CAPABILITIES:
        declared = tuple(declared_unsupported.get(kind, ()))
        if declared:
            raise ClaudeError(
                f"Claude adapter does not project {kind} yet; "
                f"declared {sorted(declared)}"
            )

    permission_mode = policy.get("permission_mode")
    if permission_mode is None:
        candidate = global_preference.get("permission_mode")
        permission_mode = candidate if candidate in PERMISSION_MODES else "manual"
    if permission_mode in FORBIDDEN_PERMISSION_MODES:
        raise ClaudeError(
            f"effective permission_mode {permission_mode} is a fixed system gate"
        )

    return {
        "version": 1,
        "client": CLIENT,
        "login_mode": policy["login_mode"],
        "skills": {
            "include": list(skill_names),
            # CAP delivers its own skills as a session-only plugin directory.
            # Every ambient discovery path stays off.
            "enable_user": False,
            "enable_project": False,
            "enable_installed_plugins": False,
        },
        "mcp": {
            "enable_project": bool(policy["enable_project_mcp"]),
            "servers": dict(sorted(mcp_servers.items())),
        },
        "memory": {
            "auto_memory": bool(policy["auto_memory"]),
            "load_user_claude_md": False,
            # Only the project's own verified AGENTS.md pointer, never a file
            # discovered elsewhere on the machine.
            "load_project_claude_md": True,
        },
        "permissions": {
            "default_mode": permission_mode,
            "allow": [],
            "deny": [],
        },
        "prompt": {"append_system_prompt_from": "system-prompt.md"},
        "unsupported": list(UNSUPPORTED_CAPABILITIES),
    }
