#!/usr/bin/env python3
"""Lock, render, launch, and observe explicit project capability profiles."""

from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlsplit

import tomllib

RENDERER_VERSION = "profile-renderer-v3"
LOCK_VERSION = 3
MANIFEST_VERSION = 3
PROFILE_VERSION = 3
BASE_MANIFEST_VERSION = 3
BASE_PIN_VERSION = 3
BINDING_VERSION = 3
OVERLAY_VERSION = 2
PROJECT_SKILL_IMPORTS_VERSION = 1
EVIDENCE_VERSION = 2
MACHINE_CONTEXT_NAME = "machine-context"
REAL_HOME_PROFILE = "real-home"  # legacy migration format only
PROJECT_DEFAULTS_NAME = "project-defaults"
CLIENTS = ("codex", "qoder", "omp", "claude")
# Clients that additionally have a launch adapter. Registering a client
# makes it renderable and lockable; launching it additionally requires auth
# staging and a launch command, which land per client. Clients outside this
# tuple fail closed in `_staged_auth` and `build_launch`.
LAUNCHABLE_CLIENTS = ("codex", "qoder", "omp")
CLIENT_EXECUTABLES = {
    "codex": "codex",
    "qoder": "qoder",
    "omp": "omp",
    "claude": "claude",
}
# Per-client adapter versions. This value reaches `effective_render_hash`
# through the lock and each adapter's source context, so a single shared int
# would make every OMP generation stale whenever another client's adapter
# changed, and vice versa. OMP must stay at 8: existing generations under
# `$HOME/.agent-system-state/renders/omp/` were computed with that value.
CLIENT_ADAPTER_VERSION: Mapping[str, int] = {
    "codex": 8,
    "omp": 8,
    "qoder": 8,
    "claude": 1,
}
IDENTIFIER = re.compile(r"^[a-z][a-z0-9-]*$")
CAPABILITY_KINDS = ("skills", "mcp", "hooks", "plugins")
PROJECT_BYPASS_DIRS = frozenset(
    {
        ".agents",
        ".claude",
        ".claude-plugin",
        ".codex-plugin",
        ".codeium",
        ".codex",
        ".cursor",
        ".gemini",
        ".omp",
        ".qoder",
        ".vscode",
        ".windsurf",
    }
)
PROJECT_BYPASS_FILES = frozenset(
    {
        "AGENTS.md",
        "AGENTS.override.md",
        "CLAUDE.md",
        "CLAUDE.local.md",
        "QODER.md",
        "QODER.local.md",
    }
)
PROJECT_BYPASS_PATHS = frozenset(
    {
        ".mcp.json",
        "mcp.json",
        ".claude/.mcp.json",
        ".claude/mcp.json",
        ".cursor/mcp.json",
        ".gemini/settings.json",
        ".vscode/mcp.json",
        ".windsurf/mcp_config.json",
        "opencode.json",
    }
)
GLOBAL_CAPABILITY_PATHS = (
    ".agents/hooks",
    ".agents/plugins",
    ".agents/skills",
    ".claude/mcp.json",
    ".codeium/windsurf/mcp_config.json",
    ".codex/AGENTS.md",
    ".codex/AGENTS.override.md",
    ".codex/hooks",
    ".codex/hooks.json",
    ".codex/plugins",
    ".codex/skills",
    ".cursor/mcp.json",
    ".mcp.json",
    ".omp/AGENTS.md",
    ".omp/hooks",
    ".omp/mcp.json",
    ".omp/plugins",
    ".omp/skills",
    ".omp/agent/AGENTS.md",
    ".omp/agent/extensions",
    ".omp/agent/hooks",
    ".omp/agent/mcp.json",
    ".omp/agent/.mcp.json",
    ".omp/agent/plugins",
    ".omp/agent/skills",
    ".pi/agent/AGENTS.md",
    ".pi/agent/extensions",
    ".pi/agent/hooks",
    ".pi/agent/mcp.json",
    ".pi/agent/skills",
    ".qoder/AGENTS.md",
    ".qoder/QODER.md",
    ".qoder/hooks",
    ".qoder/mcp.json",
    ".qoder/plugins",
    ".qoder/skills",
)
GLOBAL_FLOOR_PATHS = frozenset({".codex/AGENTS.md", ".qoder/AGENTS.md"})
HOST_FLOOR_TEXT = """# Agent 宿主底座

- 业务指令与能力必须由当前 Git 项目显式声明；模板只用于生成项目内副本，不是运行时来源。
- 全局不得启用业务 Skills、MCP、hooks、plugins、rules、agents、marketplaces 或 provider 覆盖。
- 项目需要本机增量时，必须在项目 manifest 中显式允许；不得因目录位置自动继承。
- 项目缺少 `AGENTS.md` 或 `.cap/manifest.toml` 时，先警告再按用户要求继续；不得从用户目录补齐业务能力。
- 认证、运行态与 UI 偏好可以留在用户目录，但不得向模型注入业务上下文。
- 用户当轮明确指令与平台安全约束优先。
"""
CODEX_CAPABILITY_FEATURES = frozenset(
    {
        "apps",
        "browser_use",
        "browser_use_external",
        "browser_use_full_cdp_access",
        "computer_use",
        "goals",
        "hooks",
        "image_generation",
        "in_app_browser",
        "memories",
        "multi_agent",
        "multi_agent_v2",
        "plugin_sharing",
        "plugins",
        "recommended_plugins",
        "remote_plugin",
        "skill_mcp_dependency_install",
        "skill_search",
        "tool_suggest",
        "workspace_dependencies",
    }
)
CODEX_RUNTIME_ONLY_FEATURES = frozenset({"prevent_idle_sleep"})
CODEX_RUNTIME_ONLY_KEYS = frozenset(
    {
        "approval_policy",
        "analytics",
        "approvals_reviewer",
        "cli_auth_credentials_store",
        "feedback",
        "desktop",
        "features",
        "history",
        "model",
        "model_reasoning_effort",
        "model_reasoning_summary",
        "notice",
        "sandbox_mode",
        "tool_output_token_limit",
        "projects",
        "tui",
    }
)
CODEX_CAPABILITY_KEYS = frozenset(
    {
        "agents",
        "apps",
        "developer_instructions",
        "hooks",
        "marketplaces",
        "mcp_servers",
        "model_instructions_file",
        "model_provider",
        "model_providers",
        "personality",
        "plugins",
        "skills",
    }
)
ORCA_MANAGED_EXTENSION_NAMES = frozenset(
    {"orca-agent-status.ts", "orca-prefill.ts", "orca-titlebar-spinner.ts"}
)
CODEX_EXPLICITLY_DISABLABLE_ROOTS = frozenset({"agents", "apps", "marketplaces"})
GLOBAL_NATIVE_ROOTS = (
    ".agents",
    ".claude",
    ".codeium",
    ".codex",
    ".config/opencode",
    ".cursor",
    ".gemini",
    ".omp",
    ".pi",
    ".qoder",
)
AMBIENT_CONFIG_ENV = frozenset(
    {
        "CODEX_ACCESS_TOKEN",
        "CODEX_API_KEY",
        "CODEX_HOME",
        "OMP_AUTH_BROKER_TOKEN",
        "OMP_AUTH_BROKER_URL",
        "OMP_PROFILE",
        "OPENAI_API_KEY",
        "PI_CODING_AGENT_DIR",
        "PI_CONFIG_DIR",
        "PI_CONFIG_FILES",
        "PI_PROFILE",
        "QODER_CONFIG_DIR",
        "QODER_WORKING_DIR",
    }
)
OMP_AMBIENT_AUTH_ENV = frozenset(
    {
        "AIAND_API_KEY",
        "AIMLAPI_API_KEY",
        "AI_GATEWAY_API_KEY",
        "ALIBABA_CODING_PLAN_API_KEY",
        "ALIBABA_TOKEN_PLAN_API_KEY",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_CUSTOM_HEADERS",
        "ANTHROPIC_FOUNDRY_API_KEY",
        "ANTHROPIC_OAUTH_TOKEN",
        "AWS_CONFIG_FILE",
        "ANTHROPIC_SEARCH_API_KEY",
        "ANTHROPIC_SEARCH_BASE_URL",
        "AWS_ACCESS_KEY_ID",
        "AWS_BEARER_TOKEN_BEDROCK",
        "AWS_CONTAINER_AUTHORIZATION_TOKEN",
        "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
        "AWS_CONTAINER_CREDENTIALS_FULL_URI",
        "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
        "AWS_EC2_METADATA_DISABLED",
        "AWS_EC2_METADATA_SERVICE_ENDPOINT",
        "AWS_PROFILE",
        "AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE",
        "AWS_ROLE_ARN",
        "AWS_ROLE_SESSION_NAME",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_SHARED_CREDENTIALS_FILE",
        "AWS_WEB_IDENTITY_TOKEN_FILE",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_API_VERSION",
        "AZURE_OPENAI_BASE_URL",
        "AZURE_OPENAI_DEPLOYMENT_NAME_MAP",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_RESOURCE_NAME",
        "BAILIAN_TOKEN_PLAN_API_KEY",
        "BASETEN_API_KEY",
        "BRAVE_API_KEY",
        "CEREBRAS_API_KEY",
        "CLAUDE_CODE_USE_FOUNDRY",
        "CLAUDE_CODE_CLIENT_CERT",
        "CLAUDE_CODE_CLIENT_KEY",
        "CLOUDFLARE_AI_GATEWAY_API_KEY",
        "COPILOT_GITHUB_TOKEN",
        "CLOUDSDK_CONFIG",
        "COREWEAVE_API_KEY",
        "CURSOR_ACCESS_TOKEN",
        "CURSOR_API_KEY",
        "DEEPSEEK_API_KEY",
        "DEVIN_API_KEY",
        "EXA_API_KEY",
        "FIRECRAWL_API_KEY",
        "FIREPASS_API_KEY",
        "FIREWORKS_API_KEY",
        "FUGU_BASE_URL",
        "FOUNDRY_BASE_URL",
        "FUGU_API_KEY",
        "GEMINI_API_KEY",
        "GITLAB_TOKEN",
        "GCLOUD_PROJECT",
        "GMI_API_KEY",
        "GOOGLE_API_KEY",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_CLOUD_ACCESS_TOKEN",
        "GOOGLE_CLOUD_API_KEY",
        "GOOGLE_CLOUD_LOCATION",
        "GOOGLE_CLOUD_PROJECT",
        "GOOGLE_CLOUD_PROJECT_ID",
        "GOOGLE_VERTEX_LOCATION",
        "GCP_PROJECT",
        "GROQ_API_KEY",
        "HF_TOKEN",
        "HUGGINGFACE_HUB_TOKEN",
        "JINA_API_KEY",
        "KAGI_API_KEY",
        "KILO_API_KEY",
        "KIMI_API_KEY",
        "KIMI_CODE_BASE_URL",
        "KIMI_CODE_OAUTH_HOST",
        "KIMI_OAUTH_HOST",
        "KIMI_SEARCH_API_KEY",
        "LITELLM_API_KEY",
        "LITELLM_BASE_URL",
        "LLAMA_CPP_API_KEY",
        "LLAMA_CPP_BASE_URL",
        "LM_STUDIO_API_KEY",
        "LM_STUDIO_BASE_URL",
        "META_API_KEY",
        "MINIMAX_API_KEY",
        "MINIMAX_CODE_API_KEY",
        "MINIMAX_CODE_CN_API_KEY",
        "MISTRAL_API_KEY",
        "MODEL_API_KEY",
        "MOONSHOT_API_KEY",
        "MOONSHOT_BASE_URL",
        "MOONSHOT_SEARCH_API_KEY",
        "NANO_GPT_API_KEY",
        "NOVITA_API_KEY",
        "NVIDIA_API_KEY",
        "NODE_EXTRA_CA_CERTS",
        "OLLAMA_API_KEY",
        "OLLAMA_CLOUD_API_KEY",
        "OPENCODE_API_KEY",
        "OPENAI_API_KEY",
        "OLLAMA_BASE_URL",
        "OLLAMA_HOST",
        "OPENAI_BASE_URL",
        "OPENAI_CODEX_OAUTH_TOKEN",
        "OPENROUTER_API_KEY",
        "PARALLEL_API_KEY",
        "PERPLEXITY_API_KEY",
        "PERPLEXITY_COOKIES",
        "QIANFAN_API_KEY",
        "QWEN_OAUTH_TOKEN",
        "QWEN_PORTAL_API_KEY",
        "SAKANA_API_KEY",
        "SILICONFLOW_API_KEY",
        "SILICONFLOW_CN_API_KEY",
        "SYNTHETIC_API_KEY",
        "TAVILY_API_KEY",
        "TINYFISH_API_KEY",
        "TOGETHER_API_KEY",
        "UMANS_AI_CODING_PLAN_API_KEY",
        "SAKANA_BASE_URL",
        "VENICE_API_KEY",
        "VERCEL_AI_GATEWAY_API_KEY",
        "VLLM_API_KEY",
        "WAFER_SERVERLESS_API_KEY",
        "WANDB_API_KEY",
        "XAI_API_KEY",
        "UMANS_WEBSEARCH_PROVIDER",
        "XAI_OAUTH_TOKEN",
        "XIAOMI_API_KEY",
        "XIAOMI_TOKEN_PLAN_AMS_API_KEY",
        "XIAOMI_TOKEN_PLAN_CN_API_KEY",
        "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
        "ZAI_API_KEY",
        "ZENMUX_API_KEY",
        "VERTEX_LOCATION",
        "ZHIPU_API_KEY",
    }
)
OMP_AMBIENT_CREDENTIAL_SUFFIXES = (
    "_API_KEY",
    "_ACCESS_TOKEN",
    "_OAUTH_TOKEN",
    "_BEARER_TOKEN",
    "_HUB_TOKEN",
    "_SECRET_ACCESS_KEY",
    "_SESSION_TOKEN",
)


def _is_ambient_credential_name(name: str) -> bool:
    """Return whether an inherited variable can directly carry provider credentials."""

    return name.endswith(OMP_AMBIENT_CREDENTIAL_SUFFIXES)


FORBIDDEN_CLIENT_ARGUMENTS = {
    # Every flag here can reopen a gate the adapter closed: a different
    # settings source, capability source or system prompt. Verified to exist
    # against Claude Code 2.1.236; see the Claude adapter change package.
    "claude": frozenset(
        {
            "--add-dir",
            "--agent",
            "--agents",
            "--allow-dangerously-skip-permissions",
            "--allowedTools",
            "--allowed-tools",
            "--append-system-prompt",
            "--bare",
            "--dangerously-skip-permissions",
            "--disallowedTools",
            "--disallowed-tools",
            "--mcp-config",
            "--permission-mode",
            "--plugin-dir",
            "--plugin-url",
            "--safe-mode",
            "--setting-sources",
            "--settings",
            "--strict-mcp-config",
            "--system-prompt",
            "--system-prompt-file",
            "--tools",
        }
    ),
    "codex": frozenset(
        {"-c", "-C", "-p", "--add-dir", "--cd", "--config", "--profile"}
    ),
    "qoder": frozenset(
        {
            "-w",
            "--add-dir",
            "--allowed-mcp-server-names",
            "--append-system-prompt",
            "--config-dir",
            "--mcp-config",
            "--plugin-dir",
            "--settings",
            "--strict-mcp-config",
            "--system-prompt",
            "--cwd",
            "--worktree",
        }
    ),
    "omp": frozenset(
        {
            "--add-dir",
            "-e",
            "--append-system-prompt",
            "--config",
            "--extension",
            "--cwd",
            "--from-claude",
            "--from-codex",
            "--hook",
            "--no-skills",
            "--plugin-dir",
            "--trusted-extension",
            "--profile",
            "--skills",
            "--system-prompt",
        }
    ),
}

# Compact flags whose prefix alone can override a capability root, keyed by
# client so that registering a client without declaring its prefixes fails
# closed instead of raising KeyError. Claude has no such compact form: its
# capability-root flags are all long options.
FORBIDDEN_CLIENT_ARGUMENT_PREFIXES = {
    "codex": ("-c", "-C", "-p"),
    "qoder": ("-w",),
    "omp": ("-e",),
    "claude": (),
}


class ProfileError(Exception):
    """Report a deterministic validation or launch-preparation failure."""


@dataclass(frozen=True)
class McpDefinition:
    """Hold one validated, client-neutral stdio MCP definition."""

    name: str
    command: str
    args: tuple[str, ...]
    env: Mapping[str, str]
    source: Path


@dataclass(frozen=True)
class CapabilityOperations:
    """Describe one explicit v3 capability mutation."""

    allow: tuple[str, ...]
    deny: tuple[str, ...]
    override: tuple[str, ...]


@dataclass(frozen=True)
class ProjectSkillImport:
    """Bind one project-owned Skill id to its canonical source directory."""

    name: str
    source: Path


@dataclass(frozen=True)
class Profile:
    """Hold one resolved capability layer, including its source root."""

    name: str
    source: Path
    source_root: Path
    extends: str | None
    chain: tuple[str, ...]
    prompt: Path
    prompt_chain: tuple[Path, ...]
    operations: Mapping[str, CapabilityOperations]
    origins: Mapping[str, Mapping[str, Path]]
    skills: tuple[str, ...]
    mcps: tuple[str, ...]
    hooks: tuple[str, ...]
    plugins: tuple[str, ...]
    runtime: Mapping[str, str]

@dataclass(frozen=True)
class OverlaySpec:
    """Describe one explicit private capability overlay."""

    root: Path
    namespace: str
    descriptor: Path | None


@dataclass(frozen=True)
class Project:
    """Hold a fully validated public project and optional private overlay."""

    root: Path
    manifest: Path
    defaults: Path
    runtime_policies: Mapping[str, Path]
    skill_imports_manifest: Path | None
    skill_imports: Mapping[str, ProjectSkillImport]
    profiles: Mapping[str, Profile]
    mcps: Mapping[str, McpDefinition]
    external_imports: tuple[Mapping[str, Any], ...]
    overlay: OverlaySpec | None = None
@dataclass(frozen=True)
class RenderedFile:
    """Hold normalized output bytes and permission bits for one rendered file."""

    content: bytes
    mode: int = 0o644


@dataclass(frozen=True)
class LaunchSpec:
    """Describe a client command and its isolated-root environment override."""

    command: tuple[str, ...]
    environment: Mapping[str, str]


@dataclass(frozen=True)
class AuthBinding:
    """Hold explicit auth environment values and strings that must be redacted."""

    environment: Mapping[str, str]
    private_values: tuple[str, ...]


@dataclass(frozen=True)
class ReceiptReservation:
    """Hold a no-clobber receipt inode and its stable parent directory."""

    path: Path
    descriptor: int
    parent_device: int
    parent_inode: int
    device: int
    inode: int


@dataclass(frozen=True)
class StableDirectory:
    """Hold a directory and the object identity of every component from the root to it."""

    path: Path
    parts: tuple[str, ...]
    identities: tuple[tuple[int, int], ...]

    @property
    def identity(self) -> tuple[int, int]:
        """Return the device and inode identity of the final directory."""

        return self.identities[-1]


def _load_layer_operations(value: Any, context: str) -> CapabilityOperations:
    """Load one strict v3 allow/deny/override table."""

    if not isinstance(value, Mapping):
        raise ProfileError(f"{context} must be a table")
    _expect_keys(value, {"allow", "deny", "override"}, context)
    operations = CapabilityOperations(
        allow=_identifier_list(value["allow"], f"{context}.allow"),
        deny=_identifier_list(value["deny"], f"{context}.deny"),
        override=_identifier_list(value["override"], f"{context}.override"),
    )
    overlap = (
        set(operations.allow) & set(operations.deny)
        | set(operations.allow) & set(operations.override)
        | set(operations.deny) & set(operations.override)
    )
    if overlap:
        raise ProfileError(
            f"{context} names must appear in exactly one operation: {sorted(overlap)}"
        )
    return operations
def _load_external_imports(
    value: Any, context: str
) -> tuple[Mapping[str, Any], ...]:
    """Validate explicit external asset provenance without reading secrets."""

    if not isinstance(value, list):
        raise ProfileError(f"{context} must be an array")
    result: list[Mapping[str, Any]] = []
    for index, item in enumerate(value):
        item_context = f"{context}[{index}]"
        if not isinstance(item, Mapping):
            raise ProfileError(f"{item_context} must be a table")
        _expect_keys(item, {"name", "source", "digest", "approved", "profiles"}, item_context)
        name = _validate_identifier(item["name"], f"{item_context}.name")
        source = item["source"]
        digest = item["digest"]
        if not isinstance(source, str) or not source.strip():
            raise ProfileError(f"{item_context}.source must be non-empty")
        if not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
            raise ProfileError(f"{item_context}.digest must be a sha256 digest")
        if type(item["approved"]) is not bool:
            raise ProfileError(f"{item_context}.approved must be boolean")
        profiles = _identifier_list(item["profiles"], f"{item_context}.profiles")
        result.append(
            {
                "name": name,
                "source": source,
                "digest": digest,
                "approved": item["approved"],
                "profiles": profiles,
            }
        )
    return tuple(result)


def _load_project_skill_imports(
    root: Path, manifest_path: Path
) -> dict[str, ProjectSkillImport]:
    """Load canonical project-local Skill sources outside the .cap store."""

    data = _read_toml(manifest_path)
    _expect_keys(data, {"version", "imports"}, "project Skill imports")
    if type(data["version"]) is not int or data["version"] != PROJECT_SKILL_IMPORTS_VERSION:
        raise ProfileError(
            f"project Skill imports.version must be {PROJECT_SKILL_IMPORTS_VERSION}"
        )
    raw_imports = data["imports"]
    if not isinstance(raw_imports, list):
        raise ProfileError("project Skill imports.imports must be an array")
    imports: dict[str, ProjectSkillImport] = {}
    for index, item in enumerate(raw_imports):
        context = f"project Skill imports.imports[{index}]"
        if not isinstance(item, Mapping):
            raise ProfileError(f"{context} must be a table")
        _expect_keys(item, {"name", "source"}, context)
        name = _validate_identifier(item["name"], f"{context}.name")
        source_value = item["source"]
        if not isinstance(source_value, str):
            raise ProfileError(f"{context}.source must be a path string")
        source = _resolve_directory(root, source_value, f"{context}.source")
        if source.is_relative_to(root / ".cap"):
            raise ProfileError(
                f"{context}.source must be outside .cap; use the capability store"
            )
        if source.name != name:
            raise ProfileError(
                f"{context}.source directory {source.name!r} must match {name!r}"
            )
        _validate_capability_tree(root, "skills", source)
        if name in imports:
            raise ProfileError(f"project Skill import is duplicated: {name}")
        imports[name] = ProjectSkillImport(name=name, source=source)
    return imports


def _load_overlay_spec(root: Path, private_overlay: Path | str | None) -> OverlaySpec | None:
    if private_overlay is None:
        return None
    overlay_root = Path(private_overlay).expanduser().resolve(strict=True)
    if not overlay_root.is_dir() or overlay_root == root:
        raise ProfileError("private overlay must be a distinct directory")
    descriptor = overlay_root / ".cap" / "overlay.toml"
    namespace = "private"
    if descriptor.exists():
        data = _read_toml(descriptor)
        _expect_keys(data, {"version", "namespace"}, "private overlay")
        if type(data["version"]) is not int or data["version"] != OVERLAY_VERSION:
            raise ProfileError(f"private overlay.version must be {OVERLAY_VERSION}")
        namespace = _validate_identifier(data["namespace"], "private overlay.namespace")
    return OverlaySpec(root=overlay_root, namespace=namespace, descriptor=descriptor if descriptor.exists() else None)


def load_project(
    project_root: Path | str, private_overlay: Path | str | None = None
) -> Project:
    """Load one v3 project and its optional explicit role overlay."""

    root = Path(project_root).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ProfileError(f"project root is not a directory: {root}")
    root_instructions = _resolve_file(root, "AGENTS.md", "root instructions")
    _read_nonempty_text(root_instructions, "root instructions")
    manifest_path = _resolve_file(root, ".cap/manifest.toml", "manifest")
    manifest = _read_toml(manifest_path)
    required_manifest_keys = {"version", "defaults", "runtime", "profiles"}
    actual_manifest_keys = set(manifest)
    missing_manifest_keys = sorted(required_manifest_keys - actual_manifest_keys)
    extra_manifest_keys = sorted(
        actual_manifest_keys - required_manifest_keys - {"skill_imports"}
    )
    if missing_manifest_keys or extra_manifest_keys:
        raise ProfileError(
            "manifest keys mismatch: "
            f"missing={missing_manifest_keys}, extra={extra_manifest_keys}"
        )
    if type(manifest["version"]) is not int or manifest["version"] != MANIFEST_VERSION:
        raise ProfileError(f"manifest.version must be {MANIFEST_VERSION}")
    raw_profiles = manifest["profiles"]
    if not isinstance(raw_profiles, dict) or not raw_profiles:
        raise ProfileError("manifest.profiles must be a non-empty table")
    raw_runtime = manifest["runtime"]
    if not isinstance(raw_runtime, Mapping):
        raise ProfileError("manifest.runtime must be a table")
    declared_runtimes = set(raw_runtime)
    if not declared_runtimes:
        raise ProfileError("manifest.runtime must declare at least one client")
    unknown_runtimes = sorted(declared_runtimes - set(CLIENTS))
    if unknown_runtimes:
        raise ProfileError(
            "manifest.runtime declares unknown clients "
            f"{unknown_runtimes}; known clients are {sorted(CLIENTS)}"
        )
    runtime_policies: dict[str, Path] = {}
    for runtime_client in sorted(declared_runtimes):
        label = f"{runtime_client} runtime policy"
        runtime_source = raw_runtime[runtime_client]
        if not isinstance(runtime_source, str):
            raise ProfileError(
                f"manifest.runtime.{runtime_client} must be a path string"
            )
        runtime_path = _resolve_file(root, runtime_source, label)
        _require_under_cap(root, runtime_path, label)
        runtime_data = _read_toml(runtime_path)
        _expect_keys(runtime_data, {"version", "client", "policy"}, label)
        if type(runtime_data["version"]) is not int or runtime_data["version"] != 1:
            raise ProfileError(f"{label}.version must be 1")
        if runtime_data["client"] != runtime_client or not isinstance(
            runtime_data["policy"], Mapping
        ):
            raise ProfileError(
                f"{label} must target {runtime_client} and contain a table"
            )
        runtime_policies[runtime_client] = runtime_path

    skill_imports_manifest: Path | None = None
    skill_imports: dict[str, ProjectSkillImport] = {}
    raw_skill_imports = manifest.get("skill_imports")
    if raw_skill_imports is not None:
        if not isinstance(raw_skill_imports, str):
            raise ProfileError("manifest.skill_imports must be a path string")
        skill_imports_manifest = _resolve_file(
            root, raw_skill_imports, "project Skill imports"
        )
        _require_under_cap(root, skill_imports_manifest, "project Skill imports")
        skill_imports = _load_project_skill_imports(root, skill_imports_manifest)

    capability_fields = {
        "skills": "skills",
        "mcps": "mcp",
        "hooks": "hooks",
        "plugins": "plugins",
    }
    defaults_path = _resolve_file(root, manifest["defaults"], "project defaults")
    _require_under_cap(root, defaults_path, "project defaults")
    defaults_data = _read_toml(defaults_path)
    _expect_keys(
        defaults_data,
        {"version", "external_imports", *capability_fields},
        "project defaults",
    )
    if type(defaults_data["version"]) is not int or defaults_data["version"] != 3:
        raise ProfileError("project defaults.version must be 3")
    external_imports = _load_external_imports(
        defaults_data["external_imports"], "project-defaults.external_imports"
    )
    default_operations = {
        field: _load_layer_operations(defaults_data[field], f"project-defaults.{field}")
        for field in capability_fields
    }
    expected_by_root: dict[Path, dict[str, set[str]]] = {
        root: {kind: set() for kind in CAPABILITY_KINDS}
    }
    imported_skill_names = set(skill_imports)
    for field, store_kind in capability_fields.items():
        names = {
            *default_operations[field].allow,
            *default_operations[field].override,
        }
        if store_kind == "skills":
            names.difference_update(imported_skill_names)
        expected_by_root[root][store_kind].update(names)

    overlay = _load_overlay_spec(root, private_overlay)
    definitions: dict[str, dict[str, Any]] = {}

    def load_definitions(
        source_root: Path,
        source_manifest: Mapping[str, Any],
        label: str,
        *,
        private: bool,
    ) -> None:
        raw = source_manifest["profiles"]
        if not isinstance(raw, Mapping) or not raw:
            raise ProfileError(f"{label}.profiles must be a non-empty table")
        expected = expected_by_root.setdefault(
            source_root, {kind: set() for kind in CAPABILITY_KINDS}
        )
        for name, raw_path in sorted(raw.items()):
            _validate_identifier(name, f"{label} profile name")
            if name in definitions and not private:
                raise ProfileError(f"profile name is duplicated across layers: {name}")
            if not isinstance(raw_path, str):
                raise ProfileError(f"{label}.profiles.{name} must be a path string")
            source = _resolve_file(source_root, raw_path, f"{label} profile {name}")
            _require_under_cap(source_root, source, f"{label} profile {name}")
            profile_data = _read_toml(source)
            required = {"version", "prompt", "runtime", *capability_fields}
            actual = set(profile_data)
            missing = sorted(required - actual)
            extra = sorted(actual - required)
            if missing or extra:
                raise ProfileError(
                    f"profile {name} keys mismatch: missing={missing}, extra={extra}"
                )
            if type(profile_data["version"]) is not int or profile_data["version"] != 3:
                raise ProfileError(f"profile {name}.version must be 3")
            raw_prompt = profile_data["prompt"]
            if not isinstance(raw_prompt, str):
                raise ProfileError(f"profile {name}.prompt must be a path string")
            prompt = _resolve_file(source_root, raw_prompt, f"profile {name} prompt")
            _require_under_cap(source_root, prompt, f"profile {name} prompt")
            raw_profile_runtime = profile_data["runtime"]
            if not isinstance(raw_profile_runtime, Mapping) or not raw_profile_runtime:
                raise ProfileError(
                    f"profile {name}.runtime must declare at least one client"
                )
            unknown_profile_runtimes = sorted(
                set(raw_profile_runtime) - set(CLIENTS)
            )
            if unknown_profile_runtimes:
                raise ProfileError(
                    f"profile {name}.runtime declares unknown clients "
                    f"{unknown_profile_runtimes}; known clients are {sorted(CLIENTS)}"
                )
            for runtime_client, runtime_id in raw_profile_runtime.items():
                if not isinstance(runtime_id, str):
                    raise ProfileError(
                        f"profile {name}.runtime.{runtime_client} must be a string"
                    )
            operations = {
                field: _load_layer_operations(
                    profile_data[field], f"profile {name}.{field}"
                )
                for field in capability_fields
            }
            for field, store_kind in capability_fields.items():
                names = {
                    *operations[field].allow,
                    *operations[field].override,
                }
                if store_kind == "skills":
                    names.difference_update(imported_skill_names)
                expected[store_kind].update(names)
            definitions[name] = {
                "source": source,
                "source_root": source_root,
                "prompt": prompt,
                "runtime": dict(sorted(raw_profile_runtime.items())),
                "operations": operations,
            }

    load_definitions(root, manifest, "public", private=False)
    if overlay is not None:
        overlay_manifest_path = _resolve_file(
            overlay.root, ".cap/manifest.toml", "private overlay manifest"
        )
        overlay_manifest = _read_toml(overlay_manifest_path)
        _expect_keys(
            overlay_manifest,
            {"version", "defaults", "runtime", "profiles"},
            "private overlay manifest",
        )
        if type(overlay_manifest["version"]) is not int or overlay_manifest["version"] != 3:
            raise ProfileError("private overlay manifest.version must be 3")
        load_definitions(overlay.root, overlay_manifest, "private", private=True)

    def capability_origin(field: str, name: str, source_root: Path) -> Path:
        if field == "skills" and name in skill_imports:
            return skill_imports[name].source
        store_kind = capability_fields[field]
        base = source_root / ".cap" / "capabilities" / store_kind
        return base / f"{name}.json" if store_kind == "mcp" else base / name

    profiles: dict[str, Profile] = {}
    for name, definition in sorted(definitions.items()):
        resolved: dict[str, tuple[str, ...]] = {}
        origins: dict[str, dict[str, Path]] = {}
        for field in capability_fields:
            operations = definition["operations"][field]
            inherited = set(default_operations[field].allow)
            origins[field] = {
                capability: capability_origin(field, capability, root)
                for capability in inherited
            }
            denied = set(operations.deny)
            overrides = set(operations.override)
            missing_overrides = overrides - inherited
            if missing_overrides:
                raise ProfileError(
                    f"profile {name}.{field}.override is not inherited: "
                    f"{sorted(missing_overrides)}"
                )
            duplicate_allows = set(operations.allow) & inherited
            if duplicate_allows:
                raise ProfileError(
                    f"profile {name}.{field}.allow conflicts with project defaults: "
                    f"{sorted(duplicate_allows)}"
                )
            inherited.difference_update(denied)
            inherited.difference_update(overrides)
            for capability in denied:
                origins[field].pop(capability, None)
            for capability in (*operations.override, *operations.allow):
                origins[field][capability] = capability_origin(
                    field, capability, definition["source_root"]
                )
            inherited.update(overrides)
            inherited.update(operations.allow)
            resolved[field] = tuple(sorted(inherited))
        profiles[name] = Profile(
            name=name,
            source=definition["source"],
            source_root=definition["source_root"],
            extends=None,
            chain=("project-defaults", name),
            prompt=definition["prompt"],
            prompt_chain=(definition["prompt"],),
            operations=definition["operations"],
            origins=origins,
            skills=resolved["skills"],
            mcps=resolved["mcps"],
            hooks=resolved["hooks"],
            plugins=resolved["plugins"],
            runtime=definition["runtime"],
        )
    referenced_imports = {
        skill
        for profile in profiles.values()
        for skill in profile.skills
        if skill in skill_imports
    }
    unreferenced_imports = sorted(imported_skill_names - referenced_imports)
    if unreferenced_imports:
        raise ProfileError(f"project Skill imports are unreferenced: {unreferenced_imports}")
    mcps: dict[str, McpDefinition] = {}
    for source_root, expected in expected_by_root.items():
        mcps.update(_validate_capability_store(source_root, expected))
    return Project(
        root=root,
        manifest=manifest_path,
        defaults=defaults_path,
        runtime_policies=runtime_policies,
        skill_imports_manifest=skill_imports_manifest,
        skill_imports=dict(sorted(skill_imports.items())),
        profiles=dict(sorted(profiles.items())),
        mcps=dict(sorted(mcps.items())),
        external_imports=external_imports,
        overlay=overlay,
    )


def _lock_path(project: Project) -> Path:
    """Return the public or explicit private lock path."""

    root = project.overlay.root if project.overlay is not None else project.root
    return root / ".cap" / "lock.json"


def create_lock(
    project_root: Path | str, private_overlay: Path | str | None = None
) -> dict[str, Any]:
    """Create the deterministic lock for a public project or private overlay."""

    project = load_project(project_root, private_overlay)
    _check_project_pollution(project.root)
    if project.overlay is not None:
        _check_project_pollution(project.overlay.root)
    payload = _desired_lock(project)
    lock_path = _lock_path(project)
    if lock_path.is_symlink():
        raise ProfileError("lock file must not be a symlink")
    _atomic_write(lock_path, _canonical_json(payload), mode=0o644)
    _materialize_evidence(project, payload)
    return payload


def verify_project(
    project_root: Path | str,
    *,
    private_overlay: Path | str | None = None,
    base_manifest: Path | str | None = None,
    base_pin: Path | str | None = None,
    binding_dir: Path | str | None = None,
) -> dict[str, Any]:
    """Verify the portable lock, evidence and every selected base binding."""

    project = load_project(project_root, private_overlay)
    _check_project_pollution(project.root)
    if project.overlay is not None:
        _check_project_pollution(project.overlay.root)
    desired = _desired_lock(project)
    _verify_lock(project, desired)
    if project.overlay is not None:
        _verify_evidence(project, desired)
    for profile in project.profiles.values():
        _check_profile_environment(
            project,
            profile,
            desired,
            base_manifest=base_manifest,
            base_pin=base_pin,
            binding_dir=binding_dir,
        )
        _warn_out_of_scope_base_mcps(project, profile, base_manifest)
    return desired
def materialize_profile(
    project_root: Path | str,
    client: str,
    profile_name: str,
    output_root: Path | str,
    *,
    private_overlay: Path | str | None = None,
    base_manifest: Path | str | None = None,
    base_pin: Path | str | None = None,
    binding_dir: Path | str | None = None,
) -> str:
    """Verify and render one profile into an explicit, existing empty directory."""

    project = load_project(project_root, private_overlay)
    _check_project_pollution(project.root)
    if project.overlay is not None:
        _check_project_pollution(project.overlay.root)
    desired = _desired_lock(project)
    _verify_lock(project, desired)
    if project.overlay is not None:
        _verify_evidence(project, desired)
    profile = _select_profile(project, profile_name)
    _check_profile_environment(
        project,
        profile,
        desired,
        base_manifest=base_manifest,
        base_pin=base_pin,
        binding_dir=binding_dir,
    )
    _warn_out_of_scope_base_mcps(project, profile, base_manifest)
    _validate_client(client)
    output = Path(output_root).expanduser().absolute()
    with _stable_directory(output, "render output") as output_directory:
        _require_external_directory(project, output_directory, "render output")
        if os.listdir(output_directory.path):
            raise ProfileError("render output directory must be empty")
        tree = _render_tree(project, client, profile)
        tree_hash = _tree_hash(tree)
        expected_hash = desired["profiles"][profile_name]["clients"][client][
            "tree_hash"
        ]
        if tree_hash != expected_hash:
            raise ProfileError("rendered output drifted after lock verification")
        _materialize_tree(output_directory, tree)
        return tree_hash


def _rendered_text(
    tree: Mapping[str, RenderedFile],
    relative: str,
    context: str,
    *,
    require_nonempty: bool = True,
) -> str:
    """Decode one UTF-8 file directly from the immutable rendered tree."""

    try:
        value = tree[relative].content.decode("utf-8").strip()
    except (KeyError, UnicodeError) as error:
        raise ProfileError(
            f"{context} must be rendered UTF-8 text: {relative}"
        ) from error
    if require_nonempty and not value:
        raise ProfileError(f"{context} must be non-empty")
    return value


def _rendered_skill_names(tree: Mapping[str, RenderedFile]) -> tuple[str, ...]:
    """Return validated top-level skill names directly from the rendered tree."""

    names = {
        parts[1]
        for relative in tree
        if len(parts := PurePosixPath(relative).parts) >= 3 and parts[0] == "skills"
    }
    for name in names:
        _validate_identifier(name, "rendered skill name")
    return tuple(sorted(names))


def _private_checks_are_expressible() -> bool:
    """Return whether this host expresses POSIX ownership and permission bits."""

    return hasattr(os, "geteuid")


def _credential_privacy_evidence() -> str:
    """Report whether credential privacy was judged or is unknown on this host."""

    return "checked" if _private_checks_are_expressible() else "unknown"


def _validate_private_directory(directory: StableDirectory, context: str) -> None:
    """Require one credential directory to be private, writable, and user-owned."""

    info = os.lstat(directory.path)
    if not stat.S_ISDIR(info.st_mode) or _is_link_component(info):
        raise ProfileError(f"{context} must be a directory")
    if not _private_checks_are_expressible():
        return
    if info.st_uid != os.geteuid():
        raise ProfileError(f"{context} must be owned by the current user")
    mode = stat.S_IMODE(info.st_mode)
    if mode & 0o077:
        raise ProfileError(f"{context} must not grant group or other access")
    if mode & 0o700 != 0o700:
        raise ProfileError(f"{context} must grant its owner read, write, and search")


def _read_private_file(
    directory: StableDirectory,
    name: str,
    context: str,
    *,
    max_bytes: int,
    require_owner_write: bool = False,
) -> bytes:
    """Read one bounded private file, retrying concurrent in-place refreshes."""

    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    flags |= getattr(os, "O_BINARY", 0)
    target = directory.path / name
    expressible = _private_checks_are_expressible()
    for attempt in range(3):
        try:
            if _is_link_component(os.lstat(target)):
                raise ProfileError(f"{context} must not be a link")
            descriptor = os.open(target, flags)
        except ProfileError:
            raise
        except OSError as error:
            raise ProfileError(
                f"{context} is not a readable regular file: {error}"
            ) from error
        try:
            before = os.fstat(descriptor)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
                raise ProfileError(
                    f"{context} must be a regular file with one hard link"
                )
            if expressible and before.st_uid != os.geteuid():
                raise ProfileError(f"{context} must be owned by the current user")
            mode = stat.S_IMODE(before.st_mode)
            if expressible and mode & 0o077:
                raise ProfileError(f"{context} must not grant group or other access")
            if expressible and (
                mode & 0o400 != 0o400
                or (require_owner_write and mode & 0o200 != 0o200)
            ):
                requirement = "read and write" if require_owner_write else "read"
                raise ProfileError(f"{context} must grant its owner {requirement}")
            content = bytearray()
            while len(content) <= max_bytes:
                chunk = os.read(descriptor, min(65536, max_bytes + 1 - len(content)))
                if not chunk:
                    break
                content.extend(chunk)
            if len(content) > max_bytes:
                raise ProfileError(f"{context} exceeds {max_bytes} bytes")
            after = os.fstat(descriptor)
            live = os.lstat(target)
            # The descriptor-to-descriptor comparison below keeps st_ctime_ns,
            # but the name-to-descriptor one must not: on Windows st_ctime is
            # the creation time and fstat and lstat report it from different
            # sources, so the same untouched file differs by a fraction of a
            # millisecond and every read would be reported as unstable.
            stable_identity = _same_file_identity(
                after, before.st_dev, before.st_ino
            ) and _same_file_identity(live, before.st_dev, before.st_ino)
            stable_generation = (
                after.st_size,
                after.st_mtime_ns,
                after.st_ctime_ns,
            ) == (
                before.st_size,
                before.st_mtime_ns,
                before.st_ctime_ns,
            ) and (
                live.st_size,
                live.st_mtime_ns,
            ) == (
                before.st_size,
                before.st_mtime_ns,
            )
            if stable_identity and stable_generation:
                return bytes(content)
        finally:
            os.close(descriptor)
        if attempt == 2:
            break
    raise ProfileError(f"{context} did not remain stable while it was read")


def _read_stable_private_value(
    directory: StableDirectory,
    name: str,
    context: str,
    *,
    max_bytes: int,
    parse: Callable[[bytes], Any],
    require_owner_write: bool = False,
) -> Any:
    """Read and parse one private value, retrying stable-but-incomplete refresh snapshots."""

    last_error: ProfileError | None = None
    for attempt in range(3):
        payload = _read_private_file(
            directory,
            name,
            context,
            max_bytes=max_bytes,
            require_owner_write=require_owner_write,
        )
        try:
            return parse(payload)
        except ProfileError as error:
            last_error = error
            if attempt < 2:
                time.sleep(0.01 * (attempt + 1))
    assert last_error is not None
    raise last_error


def _validate_private_tree(root: Path, context: str) -> None:
    """Reject unsafe, deep, or oversized entries in one mutable auth tree."""

    entry_count = 0
    total_bytes = 0
    expressible = _private_checks_are_expressible()
    pending = [(root, 0)]
    while pending:
        directory, depth = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                entry_count += 1
                if entry_count > 256:
                    raise ProfileError(f"{context} exceeds 256 directory entries")
                info = entry.stat(follow_symlinks=False)
                label = f"{context}/{entry.name}"
                if _is_link_component(info):
                    raise ProfileError(f"{label} must not be a link")
                if expressible and info.st_uid != os.geteuid():
                    raise ProfileError(f"{label} must be owned by the current user")
                if stat.S_ISDIR(info.st_mode):
                    if expressible and stat.S_IMODE(info.st_mode) & 0o077:
                        raise ProfileError(
                            f"{label} must not grant group or other access"
                        )
                    if expressible and stat.S_IMODE(info.st_mode) & 0o700 != 0o700:
                        raise ProfileError(
                            f"{label} must grant its owner read, write, and search"
                        )
                    if depth >= 16:
                        raise ProfileError(f"{context} exceeds 16 directory levels")
                    pending.append((Path(entry.path), depth + 1))
                    continue
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                    raise ProfileError(
                        f"{label} must be a regular file with one hard link"
                    )
                if expressible and stat.S_IMODE(info.st_mode) & 0o022:
                    raise ProfileError(f"{label} must not grant group or other write")
                total_bytes += info.st_size
                if total_bytes > 16 * 1024 * 1024:
                    raise ProfileError(f"{context} exceeds 16 MiB")


def _create_auth_symlink(
    runtime: StableDirectory, name: str, target: Path, context: str
) -> None:
    """Expose one validated persistent credential object inside the temporary root."""

    if os.name == "nt":
        raise ProfileError(
            f"{context} staging is not supported on this host; "
            "only omp launches without credential staging"
        )
    try:
        os.symlink(str(target), runtime.path / name)
    except OSError as error:
        raise ProfileError(f"could not stage {context}: {error}") from error


def _validate_broker_url(value: Any) -> str:
    """Return one HTTPS or loopback-HTTP auth-broker URL."""

    if not isinstance(value, str) or not value:
        raise ProfileError("OMP auth broker url must be a non-empty string")
    if any(not character.isprintable() or character.isspace() for character in value):
        raise ProfileError(
            "OMP auth broker url must contain only printable non-space characters"
        )
    parsed = urlsplit(value)
    if (
        parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ProfileError("OMP auth broker url must contain only scheme and authority")
    loopback = parsed.hostname in {"127.0.0.1", "::1", "localhost"}
    if parsed.scheme != "https" and not (parsed.scheme == "http" and loopback):
        raise ProfileError("OMP auth broker url must use HTTPS or loopback HTTP")
    if parsed.hostname is None:
        raise ProfileError("OMP auth broker url must include a host")
    try:
        _ = parsed.port
    except ValueError as error:
        raise ProfileError("OMP auth broker url has an invalid port") from error
    return value.rstrip("/")


def _parse_codex_auth(payload: bytes) -> dict[str, Any]:
    """Parse one complete Codex auth snapshot."""

    try:
        parsed = _loads_strict_json(
            payload.decode("utf-8"), "<auth-root>/codex/auth.json"
        )
    except UnicodeError as error:
        raise ProfileError("Codex auth.json must be UTF-8 JSON") from error
    if not isinstance(parsed, dict) or not parsed:
        raise ProfileError("Codex auth.json must be a non-empty JSON object")
    return parsed


def _parse_omp_broker_metadata(payload: bytes) -> dict[str, Any]:
    """Parse and validate one complete OMP broker metadata snapshot."""

    try:
        broker = _loads_strict_json(
            payload.decode("utf-8"), "<auth-root>/omp/broker.json"
        )
    except UnicodeError as error:
        raise ProfileError("OMP broker metadata must be UTF-8 JSON") from error
    if not isinstance(broker, dict):
        raise ProfileError("OMP broker metadata must be a JSON object")
    _expect_keys(broker, {"version", "url"}, "OMP broker metadata")
    if type(broker["version"]) is not int or broker["version"] != 1:
        raise ProfileError("OMP broker metadata.version must be 1")
    return {"version": 1, "url": _validate_broker_url(broker["url"])}


def _parse_omp_broker_token(payload: bytes) -> str:
    """Parse one complete OMP broker bearer-token snapshot."""

    try:
        token = payload.decode("ascii")
    except UnicodeError as error:
        raise ProfileError("OMP broker token must be ASCII") from error
    if not token or any(not 0x21 <= ord(character) <= 0x7E for character in token):
        raise ProfileError(
            "OMP broker token must contain only printable non-space ASCII"
        )
    return token


@contextmanager
def _staged_auth(
    project: Project,
    client: str,
    auth_root: Path | str,
    runtime: StableDirectory,
) -> Iterator[AuthBinding]:
    """Stage only the selected client's explicit persistent credential source."""

    root_path = Path(auth_root).expanduser().absolute()
    with _stable_directory(root_path, "auth root") as root:
        _require_external_directory(project, root, "auth root")
        _validate_private_directory(root, "auth root")
        client_path = root.path / client
        with _stable_directory(client_path, f"{client} auth directory") as client_root:
            _validate_private_directory(client_root, f"{client} auth directory")
            if client == "codex":
                _read_stable_private_value(
                    client_root,
                    "auth.json",
                    "Codex auth.json",
                    max_bytes=1024 * 1024,
                    parse=_parse_codex_auth,
                    require_owner_write=True,
                )
                _create_auth_symlink(
                    runtime, "auth.json", client_root.path / "auth.json", "Codex auth"
                )
                yield AuthBinding({}, (str(root.path), str(client_root.path)))
            elif client == "qoder":
                auth_path = client_root.path / ".auth"
                with _stable_directory(auth_path, "Qoder .auth") as qoder_auth:
                    _validate_private_directory(qoder_auth, "Qoder .auth")
                    _validate_private_tree(qoder_auth.path, "Qoder .auth")
                    _create_auth_symlink(
                        runtime, ".auth", qoder_auth.path, "Qoder auth directory"
                    )
                    yield AuthBinding({}, (str(root.path), str(qoder_auth.path)))
                    _validate_stable_directory(qoder_auth)
                    _validate_private_tree(qoder_auth.path, "Qoder .auth")
            elif client == "omp":
                broker = _read_stable_private_value(
                    client_root,
                    "broker.json",
                    "OMP broker metadata",
                    max_bytes=16 * 1024,
                    parse=_parse_omp_broker_metadata,
                )
                token_text = _read_stable_private_value(
                    client_root,
                    "token",
                    "OMP broker token",
                    max_bytes=8192,
                    parse=_parse_omp_broker_token,
                )
                yield AuthBinding(
                    {
                        "OMP_AUTH_BROKER_URL": broker["url"],
                        "OMP_AUTH_BROKER_TOKEN": token_text,
                    },
                    (str(root.path), str(client_root.path), token_text),
                )
            else:
                raise ProfileError(f"client {client} has no auth adapter")
            _validate_stable_directory(client_root)
        _validate_stable_directory(root)


def build_launch(
    client: str,
    runtime_root: Path | str,
    rendered_tree: Mapping[str, RenderedFile],
    forwarded_args: Sequence[str] = (),
) -> LaunchSpec:
    """Build one fixed launch from a stable root name and its immutable rendered tree."""

    _validate_client(client)
    root = Path(runtime_root).absolute()
    args = tuple(forwarded_args)
    _validate_forwarded_args(client, args)
    executable = CLIENT_EXECUTABLES[client]
    if client == "codex":
        return LaunchSpec((executable, *args), {"CODEX_HOME": str(root)})
    prompt = _rendered_text(
        rendered_tree, "system-prompt.md", "rendered profile prompt"
    )
    if client == "qoder":
        command = (
            executable,
            "--config-dir",
            str(root),
            "--strict-mcp-config",
            "--mcp-config",
            str(root / "mcp.json"),
            "--append-system-prompt",
            prompt,
            *args,
        )
        return LaunchSpec(command, {"QODER_CONFIG_DIR": str(root)})
    if client == "omp":
        skill_names = _rendered_skill_names(rendered_tree)
        skill_arguments = (
            ("--skills", ",".join(skill_names)) if skill_names else ("--no-skills",)
        )
        command = (
            executable,
            "--config",
            str(root / "config.yml"),
            "--append-system-prompt",
            prompt + "\n",
            *skill_arguments,
            "--no-extensions",
            "--no-rules",
            *args,
        )
        return LaunchSpec(
            command,
            {
                "OMP_PROFILE": "default",
                # PI_CODING_AGENT_DIR is resolved by the client; PI_CONFIG_DIR
                # is joined with the home, so it must be a relative name.
                "PI_CODING_AGENT_DIR": str(root),
                "PI_CONFIG_DIR": _home_relative_name(root, "omp runtime root"),
                "PI_CONFIG_FILES": str(root / "config.yml"),
                "PI_PROFILE": "default",
            },
        )
    raise ProfileError(f"client {client} has no launch adapter")


def _prepare_execution(
    project_root: Path | str,
    client: str,
    profile_name: str,
    forwarded_args: Sequence[str],
    *,
    private_overlay: Path | str | None = None,
    base_manifest: Path | str | None = None,
    base_pin: Path | str | None = None,
    binding_dir: Path | str | None = None,
    allow_active_drift: bool = False,
) -> tuple[Project, Profile, dict[str, Any], tuple[str, ...]]:
    """Validate every launch precondition before a client process can be created."""

    project = load_project(project_root, private_overlay)
    _require_git_root(project.root)
    _check_project_pollution(project.root)
    if project.overlay is not None:
        _check_project_pollution(project.overlay.root)
    desired = _desired_lock(project)
    _verify_lock(project, desired)
    if project.overlay is not None:
        _verify_evidence(project, desired)
    profile = _select_profile(project, profile_name)
    _check_profile_environment(
        project,
        profile,
        desired,
        base_manifest=base_manifest,
        base_pin=base_pin,
        binding_dir=binding_dir,
        allow_active_drift=allow_active_drift,
    )
    _warn_out_of_scope_base_mcps(project, profile, base_manifest)
    _validate_client(client)
    args = tuple(forwarded_args)
    _validate_forwarded_args(client, args)
    return project, profile, desired, args
def _prepare_workdir(value: Path | str | None, default: Path) -> Path:
    """Resolve the client working directory without using mutable profile state."""

    if value is None:
        return default
    path = Path(value).expanduser().resolve(strict=True)
    if path.is_symlink() or not path.is_dir():
        raise ProfileError(f"workdir must be a non-symlink directory: {path}")
    return path


def _execute_runtime(
    project: Project,
    client: str,
    profile: Profile,
    desired: Mapping[str, Any],
    forwarded_args: Sequence[str],
    *,
    auth_root: Path | str,
    runner: Callable[..., Any],
    capture_output: bool,
    workdir: Path | str | None = None,
    base_manifest: Path | str | None = None,
    base_pin: Path | str | None = None,
    binding_dir: Path | str | None = None,
    allow_active_drift: bool = False,
) -> tuple[int, str, str]:
    """Render, bind explicit auth, and invoke one client through the strict path."""

    output_hash = desired["profiles"][profile.name]["clients"][client]["tree_hash"]
    with _ephemeral_runtime_root(client, profile.name) as runtime_root:
        tree = _render_tree(project, client, profile)
        if _tree_hash(tree) != output_hash:
            raise ProfileError("rendered output drifted after lock verification")
        with _stable_directory(runtime_root, "runtime root") as runtime_directory:
            _materialize_tree(runtime_directory, tree)
            with _staged_auth(
                project, client, auth_root, runtime_directory
            ) as auth_binding:
                spec = build_launch(
                    client, runtime_directory.path, tree, forwarded_args
                )
                target_workdir = _prepare_workdir(workdir, project.root)
                if client == "omp":
                    spec = LaunchSpec(
                        (
                            spec.command[0],
                            "--cwd",
                            str(target_workdir),
                            *spec.command[1:],
                        ),
                        spec.environment,
                    )
                environment = os.environ.copy()
                for name in AMBIENT_CONFIG_ENV:
                    environment.pop(name, None)
                if client == "omp":
                    for name in set(OMP_AMBIENT_AUTH_ENV) | {
                        candidate
                        for candidate in environment
                        if _is_ambient_credential_name(candidate)
                    }:
                        environment[name] = ""
                    environment["AWS_EC2_METADATA_DISABLED"] = "true"
                    if _profile_uses_real_home(profile):
                        assert base_manifest is not None
                        environment["HOME"] = _load_base_manifest(base_manifest)["home"]
                    else:
                        environment["HOME"] = str(runtime_directory.path)
                    environment["PI_AUTH_NO_BORROW"] = "1"
                environment.update(spec.environment)
                environment.update(auth_binding.environment)
                run_options: dict[str, Any] = {
                    "cwd": str(
                        runtime_directory.path if client == "omp" else target_workdir
                    ),
                    "env": environment,
                    "check": False,
                }
                if capture_output:
                    run_options.update(
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                    )
                _check_project_pollution(project.root)
                _check_profile_environment(
                    project,
                    profile,
                    desired,
                    base_manifest=base_manifest,
                    base_pin=base_pin,
                    binding_dir=binding_dir,
                    allow_active_drift=allow_active_drift,
                )
                if _input_records(project) != desired["inputs"]:
                    raise ProfileError("locked inputs drifted after lock verification")
                _validate_stable_directory(runtime_directory)
                completed = runner(list(spec.command), **run_options)
                _check_profile_environment(
                    project,
                    profile,
                    desired,
                    base_manifest=base_manifest,
                    base_pin=base_pin,
                    binding_dir=binding_dir,
                    allow_active_drift=allow_active_drift,
                )
                return_code = getattr(completed, "returncode", None)
                if type(return_code) is not int:
                    raise ProfileError(
                        "client runner did not return an integer return code"
                    )
                stdout = getattr(completed, "stdout", "") or ""
                stderr = getattr(completed, "stderr", "") or ""
                private_spellings = {
                    str(runtime_root),
                    runtime_root.as_posix(),
                    str(runtime_directory.path),
                    runtime_directory.path.as_posix(),
                    str(Path(auth_root).expanduser().absolute()),
                    Path(auth_root).expanduser().absolute().as_posix(),
                    *auth_binding.private_values,
                }
                for spelling in sorted(
                    (value for value in private_spellings if value),
                    key=len,
                    reverse=True,
                ):
                    stdout = stdout.replace(spelling, "<private>")
                    stderr = stderr.replace(spelling, "<private>")
    return return_code, stdout, stderr


def _receipt_payload(
    client: str,
    profile: Profile,
    desired: Mapping[str, Any],
    forwarded_args: Sequence[str],
    return_code: int,
) -> dict[str, Any]:
    """Build a receipt that records identity and hashes without arguments or secrets."""

    return {
        "version": 1,
        "client": client,
        "profile": profile.name,
        "executable": CLIENT_EXECUTABLES[client],
        "exit_code": return_code,
        "forwarded_argument_count": len(forwarded_args),
        "inventory": _profile_inventory(profile),
        "lock_hash": f"sha256:{_sha256(_canonical_json(desired))}",
        "output_tree_hash": desired["profiles"][profile.name]["clients"][client][
            "tree_hash"
        ],
        "adapter_version": _client_adapter_version(client),
        "temporary_root_removed": True,
    }


def run_client(
    project_root: Path | str,
    client: str,
    profile_name: str,
    forwarded_args: Sequence[str] = (),
    *,
    auth_root: Path | str,
    receipt_path: Path | str | None = None,
    workdir: Path | str | None = None,
    runner: Callable[..., Any] | None = None,
    private_overlay: Path | str | None = None,
    base_manifest: Path | str | None = None,
    base_pin: Path | str | None = None,
    binding_dir: Path | str | None = None,
) -> int:
    """Launch one authenticated client in a verified temporary root and clean it up."""

    project, profile, desired, args = _prepare_execution(
        project_root,
        client,
        profile_name,
        forwarded_args,
        private_overlay=private_overlay,
        base_manifest=base_manifest,
        base_pin=base_pin,
        binding_dir=binding_dir,
        allow_active_drift=True,
    )
    if _profile_uses_real_home(profile):
        assert base_manifest is not None and base_pin is not None
        _manifest, active_drift, passive_drift = _base_state(
            base_manifest, base_pin
        )
        if passive_drift:
            print(
                "profile: warning: passive machine-context drift: "
                + ", ".join(passive_drift),
                file=sys.stderr,
            )
        if active_drift:
            print(
                "profile: active machine-context drift: " + ", ".join(active_drift),
                file=sys.stderr,
            )
            if not sys.stdin.isatty():
                raise ProfileError(
                    "active machine-context drift blocks non-interactive launch"
                )
            answer = input(
                "Type 'continue' to launch once without updating lock or approval: "
            )
            if answer != "continue":
                raise ProfileError("interactive launch cancelled")
    receipt_target = (
        _prepare_receipt_path(receipt_path) if receipt_path is not None else None
    )
    reservation: ReceiptReservation | None = None
    if receipt_target is not None:
        reservation = _reserve_receipt(project, receipt_target)
    committed = False
    try:
        return_code, _, _ = _execute_runtime(
            project,
            client,
            profile,
            desired,
            args,
            auth_root=auth_root,
            runner=runner or subprocess.run,
            capture_output=False,
            workdir=workdir,
            base_manifest=base_manifest,
            base_pin=base_pin,
            binding_dir=binding_dir,
            allow_active_drift=True,
        )
        receipt_bytes = _canonical_json(
            _receipt_payload(client, profile, desired, args, return_code)
        )
        if reservation is None:
            sys.stdout.buffer.write(receipt_bytes)
        else:
            _commit_receipt(reservation, receipt_bytes)
            committed = True
        return return_code if return_code >= 0 else 128 + abs(return_code)
    finally:
        if reservation is not None:
            _release_receipt(reservation, remove=not committed)

def list_profiles(
    project_root: Path | str, private_overlay: Path | str | None = None
) -> tuple[str, ...]:
    """Return locked explicit profile names in deterministic order."""

    project = load_project(project_root, private_overlay)
    _check_project_pollution(project.root)
    _verify_lock(project, _desired_lock(project))
    if project.overlay is not None:
        _verify_evidence(project, _desired_lock(project))
    return tuple(sorted(project.profiles))


def explain_profile(
    project_root: Path | str,
    profile_name: str,
    private_overlay: Path | str | None = None,
) -> dict[str, Any]:
    """Return one locked profile layer, closure, render hashes and evidence."""

    project = load_project(project_root, private_overlay)
    _check_project_pollution(project.root)
    desired = _desired_lock(project)
    _verify_lock(project, desired)
    if project.overlay is not None:
        _verify_evidence(project, desired)
    profile = _select_profile(project, profile_name)
    if not _profile_uses_real_home(profile):
        _check_global_pollution()
    locked = desired["profiles"][profile.name]
    prompt = (
        profile.prompt.relative_to(profile.source_root).as_posix()
        if profile.prompt.is_relative_to(profile.source_root)
        else str(profile.prompt)
    )
    result = {
        "profile": profile.name,
        "extends": profile.extends,
        "chain": list(profile.chain),
        "prompt": prompt,
        "operations": locked["operations"],
        "inventory": _profile_inventory(profile),
        "external_imports": list(project.external_imports),
        "skill_imports": [
            {
                "name": imported.name,
                "source": imported.source.relative_to(project.root).as_posix(),
            }
            for imported in project.skill_imports.values()
            if imported.name in profile.skills
        ],
        "evidence": {
            "declared": "ok",
            "configured": "lock-verified",
            "effective": "unknown",
            "credential_privacy": _credential_privacy_evidence(),
        },
        "layer_digest": locked["layer_digest"],
        "clients": locked["clients"],
    }
    if project.overlay is not None:
        result["overlay"] = {
            "namespace": project.overlay.namespace,
            "source": "explicit-overlay",
            "evidence_root": str(_evidence_root()),
        }
    return result


OBSERVATION_DIMENSIONS = ("skills", "mcps", "context", "hooks", "plugins")
REPORT_MARKERS = {
    "skills": "SKILLS-AVAILABLE",
    "mcps": "MCP-AVAILABLE",
    "context": "CONTEXT-FILES",
    "hooks": "HOOKS-AVAILABLE",
    "plugins": "PLUGINS-AVAILABLE",
}


def parse_reported(text: str, marker: str) -> list[str] | None:
    """Parse one self-report marker, preserving unknown separately from observed none."""

    for line in reversed(text.splitlines()):
        candidate = line.strip().lstrip("+-").strip().strip("`").strip()
        if not candidate.upper().startswith(marker + ":"):
            continue
        body = candidate.split(":", 1)[1].strip().strip("`").strip()
        if body.lower() in {"unknown", "未知"}:
            return None
        if body.lower() in {"none", "无", ""}:
            return []
        return [item.strip().strip("`") for item in body.split(",") if item.strip()]
    return None


def _same_file_identity(info: os.stat_result, device: int, inode: int) -> bool:
    """Return whether one stat result names the expected filesystem object."""

    return info.st_dev == device and info.st_ino == inode


def _is_link_component(info: os.stat_result) -> bool:
    """Return whether one lstat result names a symlink, junction or other reparse point."""

    if stat.S_ISLNK(info.st_mode):
        return True
    attributes = getattr(info, "st_file_attributes", 0)
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def _validate_stable_directory(directory: StableDirectory) -> None:
    """Verify that every component still names the object it named when opened."""

    try:
        current = Path(directory.path.anchor)
        for index, identity in enumerate(directory.identities):
            if index:
                current = current / directory.parts[index - 1]
            live = os.lstat(current)
            if not stat.S_ISDIR(live.st_mode) or (
                index and _is_link_component(live)
            ):
                raise ProfileError(f"stable directory changed: {directory.path}")
            if not _same_file_identity(live, identity[0], identity[1]):
                raise ProfileError(f"stable directory changed: {directory.path}")
    except ProfileError:
        raise
    except (OSError, NotImplementedError) as error:
        raise ProfileError(
            f"stable directory is no longer accessible: {error}"
        ) from error


def _normalize_root_alias(path: Path, context: str) -> Path:
    """Normalize only a root-owned first-component symlink such as macOS /var."""

    absolute = path.expanduser().absolute()
    if absolute.anchor != os.sep:
        return absolute
    if len(absolute.parts) < 2:
        return absolute
    first = Path(os.sep) / absolute.parts[1]
    try:
        info = os.lstat(first)
        if not stat.S_ISLNK(info.st_mode):
            return absolute
        if getattr(info, "st_uid", -1) != 0:
            raise ProfileError(f"{context} contains a non-root-owned symlink ancestor")
        target = first.resolve(strict=True)
    except ProfileError:
        raise
    except OSError as error:
        raise ProfileError(f"{context} root alias is not stable: {error}") from error
    return target.joinpath(*absolute.parts[2:])


def _open_stable_directory(path: Path, context: str) -> StableDirectory:
    """Bind a lexical path to one component-verified chain of directory identities."""

    absolute = _normalize_root_alias(path, context)
    parts = tuple(absolute.parts[1:])
    identities: list[tuple[int, int]] = []
    try:
        current = Path(absolute.anchor)
        info = os.lstat(current)
        if not stat.S_ISDIR(info.st_mode):
            raise ProfileError(f"{context} filesystem root is not a directory")
        identities.append((info.st_dev, info.st_ino))
        for part in parts:
            current = current / part
            info = os.lstat(current)
            if not stat.S_ISDIR(info.st_mode) or _is_link_component(info):
                raise ProfileError(
                    f"{context} must be an existing non-symlink directory: {current}"
                )
            identities.append((info.st_dev, info.st_ino))
    except ProfileError:
        raise
    except (OSError, NotImplementedError) as error:
        raise ProfileError(
            f"{context} must be an existing non-symlink directory: {error}"
        ) from error
    directory = StableDirectory(absolute, parts, tuple(identities))
    _validate_stable_directory(directory)
    return directory


def _close_stable_directory(directory: StableDirectory) -> None:
    """Release one directory binding; identities hold no operating-system resource."""




@contextmanager
def _stable_directory(path: Path, context: str) -> Iterator[StableDirectory]:
    """Yield one component-verified directory and re-verify its path before releasing."""

    directory = _open_stable_directory(path, context)
    try:
        yield directory
        _validate_stable_directory(directory)
    finally:
        _close_stable_directory(directory)


def _stable_directory_is_within(directory: StableDirectory, root: Path) -> bool:
    """Return whether a verified directory is the same as or below one physical root."""

    root_directory = _open_stable_directory(root, "restricted root")
    return root_directory.identity in directory.identities


def _stable_directory_is_same(directory: StableDirectory, other: Path) -> bool:
    """Return whether a verified directory is the same physical directory as one path."""

    return _open_stable_directory(other, "restricted root").identity == directory.identity


@contextmanager
def _ephemeral_runtime_root(client: str, profile_name: str) -> Iterator[Path]:
    """Yield a one-shot runtime root that both hosts can express to a client.

    It lives under the real home rather than the system temporary directory.
    Some clients define a configuration directory variable as a *name relative
    to the home* and join it with the home themselves, so a root outside the
    home cannot be expressed at all: the value would be joined twice and the run
    would fail before it starts. Neither host's temporary directory is under the
    home -- macOS uses /tmp, Windows uses the LOCALAPPDATA temp folder -- so
    root under the home is what lets one implementation serve both instead of
    special-casing a platform.

    `_require_external_directory` already accepts locations under the home; it
    rejects only the home itself, the project, and the native capability roots.
    """

    parent = Path.home().absolute() / ".agent-system-state" / "tmp"
    parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=f"profile-{client}-{profile_name}-", dir=str(parent)
    ) as temporary:
        yield Path(temporary)


def _home_relative_name(directory: Path, context: str) -> str:
    """Express one managed directory as the home-relative name a client needs.

    See can1357/oh-my-pi#9067: the split between a resolved variable and a
    home-relative one is deliberate upstream, so cap converts rather than
    hoping an absolute path is accepted.
    """

    home = Path.home().absolute()
    try:
        return directory.absolute().relative_to(home).as_posix()
    except ValueError as error:
        raise ProfileError(
            f"{context} must live under the real home so it can be named "
            f"relative to it: {directory}"
        ) from error


def _require_external_directory(
    project: Project, directory: StableDirectory, context: str
) -> None:
    """Reject a held output directory inside the project or native capability roots."""

    if _stable_directory_is_within(directory, project.root):
        raise ProfileError(f"{context} must be outside the project root")
    home = Path.home().absolute()
    if _stable_directory_is_same(directory, home):
        raise ProfileError(f"{context} must be outside global capability roots")
    for relative in GLOBAL_NATIVE_ROOTS:
        native_root = home / relative
        if native_root.exists() and _stable_directory_is_within(directory, native_root):
            raise ProfileError(f"{context} must be outside global capability roots")


def _state_root(
    project: Project, value: Path | str, *, require_empty: bool
) -> StableDirectory:
    """Open an explicit observation directory without remembering a prior selection."""

    candidate = Path(value).expanduser().absolute()
    directory = _open_stable_directory(candidate, "state directory")
    try:
        _require_external_directory(project, directory, "state directory")
        if require_empty and os.listdir(directory.path):
            raise ProfileError("state directory must be empty")
        _validate_stable_directory(directory)
        return directory
    except BaseException:
        _close_stable_directory(directory)
        raise


def _declared_snapshot(
    project: Project,
    client: str,
    profile: Profile,
    desired: Mapping[str, Any],
) -> dict[str, Any]:
    """Describe the selected declaration and its normalized client render."""

    context = [str(project.root / "AGENTS.md")]
    if client == "codex":
        context.append("<runtime>/AGENTS.md")
    return {
        "version": 1,
        "client": client,
        "profile": profile.name,
        "renderer_version": RENDERER_VERSION,
        "adapter_version": _client_adapter_version(client),
        "lock_hash": f"sha256:{_sha256(_canonical_json(desired))}",
        "output_tree_hash": desired["profiles"][profile.name]["clients"][client][
            "tree_hash"
        ],
        "inventory": _profile_inventory(profile),
        "external_imports": list(project.external_imports),
        "evidence": {
            "declared": "ok",
            "configured": "rendered",
            "effective": "unknown",
            "credential_privacy": _credential_privacy_evidence(),
        },
        "context": context,
        "capability_semantics": desired["capability_semantics"],
    }


def _configured_mcp_names(tree: Mapping[str, RenderedFile], client: str) -> list[str]:
    """Read native MCP server names directly from the immutable rendered tree."""

    if client == "codex":
        try:
            data = tomllib.loads(
                _rendered_text(
                    tree,
                    "config.toml",
                    "rendered Codex configuration",
                    require_nonempty=False,
                )
            )
        except tomllib.TOMLDecodeError as error:
            raise ProfileError(
                f"rendered Codex configuration is invalid: {error}"
            ) from error
        servers = data.get("mcp_servers", {})
    elif client in {"qoder", "omp", "claude"}:
        relative = "mcp.json"
        data = _loads_strict_json(
            _rendered_text(tree, relative, "rendered MCP configuration"),
            f"<rendered-tree>/{relative}",
        )
        servers = data.get("mcpServers", {}) if isinstance(data, dict) else None
    else:
        raise ProfileError(f"client {client} has no MCP reader")
    if not isinstance(servers, dict):
        raise ProfileError("rendered MCP configuration has an invalid server table")
    return sorted(servers)


def probe_profile(
    project_root: Path | str,
    client: str,
    profile_name: str,
    state_root: Path | str,
    *,
    private_overlay: Path | str | None = None,
    base_manifest: Path | str | None = None,
    base_pin: Path | str | None = None,
    binding_dir: Path | str | None = None,
) -> dict[str, Any]:
    """Observe the rendered configuration plane without invoking an agent or model."""

    project = load_project(project_root, private_overlay)
    _check_project_pollution(project.root)
    if project.overlay is not None:
        _check_project_pollution(project.overlay.root)
    desired = _desired_lock(project)
    _verify_lock(project, desired)
    if project.overlay is not None:
        _verify_evidence(project, desired)
    profile = _select_profile(project, profile_name)
    _check_profile_environment(
        project,
        profile,
        desired,
        base_manifest=base_manifest,
        base_pin=base_pin,
        binding_dir=binding_dir,
    )
    _warn_out_of_scope_base_mcps(project, profile, base_manifest)
    _validate_client(client)
    state = _state_root(project, state_root, require_empty=True)
    try:
        expected_hash = desired["profiles"][profile.name]["clients"][client][
            "tree_hash"
        ]
        with _ephemeral_runtime_root(f"probe-{client}", profile.name) as runtime_root:
            tree = _render_tree(project, client, profile)
            if _tree_hash(tree) != expected_hash:
                raise ProfileError("rendered output drifted after lock verification")
            with _stable_directory(
                runtime_root, "probe runtime root"
            ) as runtime_directory:
                _materialize_tree(runtime_directory, tree)
                skills = list(_rendered_skill_names(tree))
                mcps = _configured_mcp_names(tree, client)
        declared = _declared_snapshot(project, client, profile, desired)
        probed = {
            "version": 1,
            "client": client,
            "profile": profile.name,
            "plane": "configured",
            "probed_at": datetime.now(UTC).isoformat(),
            "observed": {
                "skills": skills,
                "mcps": mcps,
                "context": None,
                "hooks": None,
                "plugins": None,
            },
            "candidates": {"context": declared["context"]},
            "staged": {
                "hooks": list(profile.hooks),
                "plugins": list(profile.plugins),
            },
            "caveats": [
                "context candidates are not proof that the client loaded them",
                "hooks and plugins are opaque-staging until native loading is verified",
                "configured state is not effective runtime state",
            ],
        }
        _materialize_tree(
            state,
            {
                "declared.json": RenderedFile(_canonical_json(declared)),
                "probed.json": RenderedFile(_canonical_json(probed)),
            },
        )
        return probed
    finally:
        _close_stable_directory(state)


def run_observed(
    project_root: Path | str,
    client: str,
    profile_name: str,
    state_root: Path | str,
    forwarded_args: Sequence[str] = (),
    *,
    auth_root: Path | str,
    receipt_path: Path | str | None = None,
    workdir: Path | str | None = None,
    runner: Callable[..., Any] | None = None,
    private_overlay: Path | str | None = None,
    base_manifest: Path | str | None = None,
    base_pin: Path | str | None = None,
    binding_dir: Path | str | None = None,
) -> int:
    """Run one batch client, capture self-reported effective state, and clean its root."""

    project, profile, desired, args = _prepare_execution(
        project_root,
        client,
        profile_name,
        forwarded_args,
        private_overlay=private_overlay,
        base_manifest=base_manifest,
        base_pin=base_pin,
        binding_dir=binding_dir,
    )
    state = _state_root(project, state_root, require_empty=True)
    reservation: ReceiptReservation | None = None
    committed = False
    try:
        receipt_target = _prepare_receipt_path(
            receipt_path or state.path / "receipt.json"
        )
        reservation = _reserve_receipt(
            project,
            receipt_target,
            parent_directory=state if receipt_target.parent == state.path else None,
        )
        declared = _declared_snapshot(project, client, profile, desired)
        _materialize_tree(
            state,
            {"declared.json": RenderedFile(_canonical_json(declared))},
        )
        started = datetime.now(UTC)
        return_code, stdout, stderr = _execute_runtime(
            project,
            client,
            profile,
            desired,
            args,
            auth_root=auth_root,
            runner=runner or subprocess.run,
            capture_output=True,
            workdir=workdir,
            base_manifest=base_manifest,
            base_pin=base_pin,
            binding_dir=binding_dir,
        )
        ended = datetime.now(UTC)
        text = stdout + "\n" + stderr
        reported = {
            dimension: parse_reported(text, REPORT_MARKERS[dimension])
            for dimension in OBSERVATION_DIMENSIONS
        }
        client_limited = {
            "codex": {"mcps", "context"},
            "qoder": set(),
            "omp": {"mcps"},
        }[client]
        forced_unknown = {"hooks", "plugins"} | client_limited
        effective = {
            "version": 1,
            "client": client,
            "profile": profile.name,
            "plane": "effective",
            "started_at": started.isoformat(),
            "ended_at": ended.isoformat(),
            "duration_s": round((ended - started).total_seconds()),
            "exit_code": return_code,
            "forwarded_argument_count": len(args),
            "observed": {
                dimension: None if dimension in forced_unknown else reported[dimension]
                for dimension in OBSERVATION_DIMENSIONS
            },
            "reported_opaque_staging": {
                dimension: reported[dimension] for dimension in ("hooks", "plugins")
            },
            "reported_client_limited": {
                dimension: reported[dimension] for dimension in sorted(client_limited)
            },
            "evidence": (
                "client output self-report; missing or explicit unknown markers remain unknown; "
                "hook/plugin reports remain opaque-staging; client-limited dimensions are retained "
                "only as unreliable reports rather than effective observations"
            ),
        }
        _materialize_tree(
            state,
            {"effective.json": RenderedFile(_canonical_json(effective))},
        )
        _commit_receipt(
            reservation,
            _canonical_json(
                _receipt_payload(client, profile, desired, args, return_code)
            ),
        )
        committed = True
        if stdout:
            print(stdout, end="" if stdout.endswith("\n") else "\n")
        if stderr:
            print(stderr, end="" if stderr.endswith("\n") else "\n", file=sys.stderr)
        return return_code if return_code >= 0 else 128 + abs(return_code)
    finally:
        if reservation is not None:
            _release_receipt(reservation, remove=not committed)
        _close_stable_directory(state)


def _observation_key(dimension: str, value: str) -> str:
    if dimension != "context":
        return value.strip()
    normalized = value.strip().strip("`").replace("\\", "/").rstrip("/")
    return os.path.normcase(normalized)


def diff_profile(
    project_root: Path | str,
    client: str,
    profile_name: str,
    state_root: Path | str,
    *,
    private_overlay: Path | str | None = None,
    base_manifest: Path | str | None = None,
    base_pin: Path | str | None = None,
    binding_dir: Path | str | None = None,
) -> int:
    """Compare one immutable declaration with the separately captured effective state."""

    project = load_project(project_root, private_overlay)
    _check_project_pollution(project.root)
    if project.overlay is not None:
        _check_project_pollution(project.overlay.root)
    desired = _desired_lock(project)
    _verify_lock(project, desired)
    if project.overlay is not None:
        _verify_evidence(project, desired)
    profile = _select_profile(project, profile_name)
    _check_profile_environment(
        project,
        profile,
        desired,
        base_manifest=base_manifest,
        base_pin=base_pin,
        binding_dir=binding_dir,
    )
    _warn_out_of_scope_base_mcps(project, profile, base_manifest)
    _validate_client(client)
    state = _state_root(project, state_root, require_empty=False)
    try:
        try:
            declared = _strict_json_from_directory(state, "declared.json")
            effective = _strict_json_from_directory(state, "effective.json")
        except ProfileError as error:
            if "state file missing:" in str(error):
                raise ProfileError(
                    "diff requires declared.json and effective.json from one observed run"
                ) from error
            raise
        current = _declared_snapshot(project, client, profile, desired)
        if declared != current:
            raise ProfileError(
                "declared observation no longer matches the selected locked profile"
            )
        if (
            not isinstance(effective, dict)
            or effective.get("client") != client
            or effective.get("profile") != profile.name
        ):
            raise ProfileError(
                "effective observation belongs to a different client or profile"
            )
        observed_by_dimension = effective.get("observed")
        if not isinstance(observed_by_dimension, dict):
            raise ProfileError("effective observation has no observed dimension table")
        expected = {
            "skills": list(profile.skills),
            "mcps": list(profile.mcps),
            "context": list(current["context"]),
            "hooks": list(profile.hooks),
            "plugins": list(profile.plugins),
        }
        problems: list[str] = []
        unknowns: list[str] = []
        print(f"profile: {profile.name}  client: {client}")
        for dimension in OBSERVATION_DIMENSIONS:
            observed = observed_by_dimension.get(dimension)
            effective_text = observed if observed is not None else "unknown"
            print(
                f"[{dimension}] declared={expected[dimension] or '(none)'} "
                f"effective={effective_text}"
            )
            if observed is None:
                unknowns.append(
                    f"{dimension}: unknown; absence of evidence is not observed none"
                )
                continue
            if not isinstance(observed, list) or any(
                not isinstance(item, str) for item in observed
            ):
                raise ProfileError(
                    f"effective observation {dimension} must be an array or null"
                )
            expected_keys = {
                _observation_key(dimension, item): item for item in expected[dimension]
            }
            observed_keys = {
                _observation_key(dimension, item): item for item in observed
            }
            missing = sorted(
                expected_keys[key]
                for key in expected_keys.keys() - observed_keys.keys()
            )
            extra = sorted(
                observed_keys[key]
                for key in observed_keys.keys() - expected_keys.keys()
            )
            if missing:
                problems.append(f"{dimension} missing: {missing}")
            if extra:
                problems.append(f"{dimension} outside declaration: {extra}")
        if effective.get("exit_code") != 0:
            problems.append(f"client exit code was {effective.get('exit_code')}")
        if unknowns:
            print("unknown:")
            for item in unknowns:
                print(f"  ? {item}")
        if problems:
            print("drift:")
            for item in problems:
                print(f"  - {item}")
            return 1
        if unknowns:
            print("result: unknown; one or more effective dimensions were not observed")
            return 2
        print("result: no observed drift")
        return 0
    finally:
        _close_stable_directory(state)


def main(argv: Sequence[str] | None = None) -> int:
    """Run the sole profile command-line interface and return its process exit code."""

    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        project = Path(args.project)
        if args.command == "machine-context-lock":
            payload = create_base_manifest(args.home, args.manifest)
            _print_json(
                {
                    "status": "locked-not-approved",
                    "context": MACHINE_CONTEXT_NAME,
                    "effective_digest": payload["effective_digest"],
                    "inventory_digest": payload["inventory_digest"],
                }
            )
            return 0
        if args.command == "machine-context-approve":
            payload = approve_base_manifest(args.manifest, args.pin)
            _print_json(
                {
                    "status": "approved",
                    "context": MACHINE_CONTEXT_NAME,
                    "approved_digest": payload["approved_digest"],
                }
            )
            return 0
        if args.command == "assembly-bind":
            payload = bind_profile(
                project,
                args.profile,
                args.base_manifest,
                args.base_pin,
                args.binding_dir,
                private_overlay=args.private_overlay,
            )
            _print_json({"status": "bound", **payload})
            return 0
        if args.command == "lock":
            payload = create_lock(project, args.private_overlay)
            _print_json(
                {
                    "status": "locked",
                    "lock_hash": f"sha256:{_sha256(_canonical_json(payload))}",
                }
            )
            return 0
        if args.command == "verify":
            payload = verify_project(
                project,
                private_overlay=args.private_overlay,
                base_manifest=args.base_manifest,
                base_pin=args.base_pin,
                binding_dir=args.binding_dir,
            )
            _print_json(
                {
                    "status": "ok",
                    "lock_hash": f"sha256:{_sha256(_canonical_json(payload))}",
                    "credential_privacy": _credential_privacy_evidence(),
                }
            )
            return 0
        if args.command == "list":
            _print_json({"profiles": list(list_profiles(project, args.private_overlay))})
            return 0
        if args.command == "explain":
            _print_json(explain_profile(project, args.profile, args.private_overlay))
            return 0
        if args.command == "materialize":
            tree_hash = materialize_profile(
                project,
                args.client,
                args.profile,
                args.output,
                private_overlay=args.private_overlay,
                base_manifest=args.base_manifest,
                base_pin=args.base_pin,
                binding_dir=args.binding_dir,
            )
            _print_json(
                {
                    "status": "materialized",
                    "client": args.client,
                    "profile": args.profile,
                    "tree_hash": tree_hash,
                }
            )
            return 0
        if args.command == "probe":
            _print_json(
                probe_profile(
                    project,
                    args.client,
                    args.profile,
                    args.state,
                    private_overlay=args.private_overlay,
                    base_manifest=args.base_manifest,
                    base_pin=args.base_pin,
                    binding_dir=args.binding_dir,
                )
            )
            return 0
        if args.command == "diff":
            return diff_profile(
                project,
                args.client,
                args.profile,
                args.state,
                private_overlay=args.private_overlay,
                base_manifest=args.base_manifest,
                base_pin=args.base_pin,
                binding_dir=args.binding_dir,
            )
        forwarded = list(args.client_args)
        if forwarded and forwarded[0] == "--":
            forwarded.pop(0)
        if args.command == "launch":
            return run_client(
                project,
                args.client,
                args.profile,
                forwarded,
                auth_root=args.auth_root,
                receipt_path=args.receipt,
                private_overlay=args.private_overlay,
                base_manifest=args.base_manifest,
                base_pin=args.base_pin,
                binding_dir=args.binding_dir,
            )
        return run_observed(
            project,
            args.client,
            args.profile,
            args.state,
            forwarded,
            auth_root=args.auth_root,
            receipt_path=args.receipt,
            private_overlay=args.private_overlay,
            base_manifest=args.base_manifest,
            base_pin=args.base_pin,
            binding_dir=args.binding_dir,
        )
    except (ProfileError, OSError) as error:
        print(f"profile: error: {error}", file=sys.stderr)
        return 2


def _add_selection(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--client", required=True, choices=CLIENTS)
    parser.add_argument("--profile", required=True)


def _add_auth(parser: argparse.ArgumentParser) -> None:
    """Require one explicit persistent auth vault for runtime commands."""

    parser.add_argument(
        "--auth-root",
        required=True,
        help="private directory containing codex/, qoder/, and omp/ credentials",
    )

def _add_machine_context_binding(
    parser: argparse.ArgumentParser, *, required: bool = False
) -> None:
    """Add explicit machine-context and assembly binding paths."""

    parser.add_argument(
        "--machine-context-manifest", dest="base_manifest", required=required
    )
    parser.add_argument(
        "--machine-context-pin", dest="base_pin", required=required
    )
    parser.add_argument(
        "--assembly-binding-dir", dest="binding_dir", required=required
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="profile")
    parser.add_argument("--project", required=True, metavar="目录")
    parser.add_argument(
        "--private-overlay",
        default=None,
        metavar="目录",
        help="显式私有 capability overlay 根目录；未提供时只使用公共 source",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("lock")
    verify = subparsers.add_parser("verify")
    _add_machine_context_binding(verify)
    subparsers.add_parser("list")
    machine_context_lock = subparsers.add_parser("machine-context-lock")
    machine_context_lock.add_argument("--home", required=True)
    machine_context_lock.add_argument(
        "--machine-context-manifest", dest="manifest", required=True
    )
    machine_context_approve = subparsers.add_parser("machine-context-approve")
    machine_context_approve.add_argument(
        "--machine-context-manifest", dest="manifest", required=True
    )
    machine_context_approve.add_argument(
        "--machine-context-pin", dest="pin", required=True
    )
    assembly_bind = subparsers.add_parser("assembly-bind")
    assembly_bind.add_argument("--profile", required=True)
    _add_machine_context_binding(assembly_bind, required=True)
    explain = subparsers.add_parser("explain")
    explain.add_argument("--profile", required=True)
    materialize = subparsers.add_parser("materialize")
    _add_selection(materialize)
    _add_machine_context_binding(materialize)
    materialize.add_argument("--output", required=True)
    probe = subparsers.add_parser("probe")
    _add_selection(probe)
    _add_machine_context_binding(probe)
    probe.add_argument("--state", required=True)
    diff = subparsers.add_parser("diff")
    _add_selection(diff)
    _add_machine_context_binding(diff)
    diff.add_argument("--state", required=True)
    launch = subparsers.add_parser("launch")
    _add_selection(launch)
    _add_auth(launch)
    launch.add_argument("--receipt")
    launch.add_argument("--workdir")
    _add_machine_context_binding(launch)
    launch.add_argument("client_args", nargs=argparse.REMAINDER)
    run = subparsers.add_parser("run")
    _add_selection(run)
    _add_auth(run)
    run.add_argument("--state", required=True)
    run.add_argument("--receipt")
    run.add_argument("--workdir")
    _add_machine_context_binding(run)
    run.add_argument("client_args", nargs=argparse.REMAINDER)
    return parser


def _read_toml(path: Path) -> dict[str, Any]:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as error:
        raise ProfileError(f"invalid TOML {path}: {error}") from error
    if not isinstance(data, dict):
        raise ProfileError(f"TOML root must be a table: {path}")
    return data


def _loads_strict_json(text: str, context: str) -> Any:
    """Parse strict JSON text with duplicate-key and non-finite-number rejection."""

    def pairs_hook(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ProfileError(f"duplicate JSON key {key!r} in {context}")
            result[key] = value
        return result

    def reject_constant(value: str) -> Any:
        raise ProfileError(f"non-finite JSON number {value!r} in {context}")

    try:
        return json.loads(
            text,
            object_pairs_hook=pairs_hook,
            parse_constant=reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ProfileError(f"invalid JSON {context}: {error}") from error


def _strict_json(path: Path) -> Any:
    """Read and parse one strict JSON file by path."""

    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise ProfileError(f"invalid JSON {path}: {error}") from error
    return _loads_strict_json(text, str(path))


def _strict_json_from_directory(directory: StableDirectory, name: str) -> Any:
    """Read one strict JSON file relative to a held directory without following links."""

    flags = os.O_RDONLY | getattr(os, "O_NONBLOCK", 0)
    for flag_name in ("O_CLOEXEC", "O_NOFOLLOW"):
        flags |= getattr(os, flag_name, 0)
    target = directory.path / name
    try:
        _validate_stable_directory(directory)
        try:
            if _is_link_component(os.lstat(target)):
                raise ProfileError(f"state file must not be a link: {name}")
            descriptor = os.open(target, flags)
        except FileNotFoundError as error:
            raise ProfileError(f"state file missing: {name}") from error
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise ProfileError(f"state file must be a private regular file: {name}")
            with os.fdopen(descriptor, "r", encoding="utf-8") as stream:
                descriptor = -1
                text = stream.read()
        finally:
            if descriptor >= 0:
                os.close(descriptor)
        live = os.stat(target, follow_symlinks=False)
        if (
            not stat.S_ISREG(live.st_mode)
            or live.st_nlink != 1
            or not _same_file_identity(live, info.st_dev, info.st_ino)
        ):
            raise ProfileError(f"state file changed while reading: {name}")
        _validate_stable_directory(directory)
    except ProfileError:
        raise
    except (OSError, NotImplementedError, UnicodeError) as error:
        raise ProfileError(f"invalid JSON {directory.path / name}: {error}") from error
    return _loads_strict_json(text, str(directory.path / name))


def _expect_keys(data: Mapping[str, Any], expected: set[str], context: str) -> None:
    actual = set(data)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing or extra:
        raise ProfileError(f"{context} keys mismatch: missing={missing}, extra={extra}")


def _validate_identifier(value: Any, context: str) -> str:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise ProfileError(f"{context} must match {IDENTIFIER.pattern}: {value!r}")
    return value


def _identifier_list(value: Any, context: str) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise ProfileError(f"{context} must be an array")
    result = tuple(_validate_identifier(item, context) for item in value)
    if len(result) != len(set(result)):
        raise ProfileError(f"{context} contains duplicates")
    return result


def _safe_relative(value: str, context: str) -> PurePosixPath:
    if not value or "\\" in value:
        raise ProfileError(
            f"{context} must be a normalized POSIX relative path: {value!r}"
        )
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or path.as_posix() != value
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ProfileError(
            f"{context} must be a normalized POSIX relative path: {value!r}"
        )
    return path


def _resolve_file(root: Path, value: str, context: str) -> Path:
    relative = _safe_relative(value, context)
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ProfileError(f"{context} must not traverse a symlink: {value}")
    try:
        resolved = current.resolve(strict=True)
    except OSError as error:
        raise ProfileError(f"{context} does not exist: {value}") from error
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise ProfileError(f"{context} must resolve to a regular project file: {value}")
    return resolved


def _resolve_directory(root: Path, value: str, context: str) -> Path:
    relative = _safe_relative(value, context)
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ProfileError(f"{context} must not traverse a symlink: {value}")
    try:
        resolved = current.resolve(strict=True)
    except OSError as error:
        raise ProfileError(f"{context} does not exist: {value}") from error
    if not resolved.is_relative_to(root) or not resolved.is_dir():
        raise ProfileError(f"{context} must resolve to a project directory: {value}")
    return resolved


def _require_under_cap(root: Path, path: Path, context: str) -> None:
    cap_root = root / ".cap"
    if not path.is_relative_to(cap_root):
        raise ProfileError(f"{context} must be stored under .cap")


def _validate_capability_store(
    root: Path, expected: Mapping[str, set[str]]
) -> dict[str, McpDefinition]:
    base = root / ".cap" / "capabilities"
    _require_directory(base, "capability store")
    children = {item.name for item in base.iterdir()}
    known_kinds = set(CAPABILITY_KINDS)
    extra_kinds = sorted(children - known_kinds)
    missing_required_kinds = sorted(
        kind for kind in known_kinds - children if expected[kind]
    )
    if extra_kinds or missing_required_kinds:
        raise ProfileError(
            "capability store kinds mismatch: "
            f"missing={missing_required_kinds}, extra={extra_kinds}"
        )
    mcps: dict[str, McpDefinition] = {}
    for kind in CAPABILITY_KINDS:
        kind_root = base / kind
        if not kind_root.exists():
            if kind_root.is_symlink() or expected[kind]:
                _require_directory(kind_root, f"capability kind {kind}")
            continue
        _require_directory(kind_root, f"capability kind {kind}")
        if kind == "mcp":
            actual = set()
            for item in sorted(kind_root.iterdir(), key=lambda path: path.name):
                if item.is_symlink() or not item.is_file() or item.suffix != ".json":
                    raise ProfileError(
                        f"mcp store contains invalid entry: {item.relative_to(root)}"
                    )
                name = item.stem
                _validate_identifier(name, "mcp capability name")
                actual.add(name)
                mcps[name] = _load_mcp(item, name)
        else:
            actual = set()
            for item in sorted(kind_root.iterdir(), key=lambda path: path.name):
                if item.is_symlink() or not item.is_dir():
                    raise ProfileError(
                        f"{kind} store contains invalid entry: {item.relative_to(root)}"
                    )
                _validate_identifier(item.name, f"{kind} capability name")
                actual.add(item.name)
                _validate_capability_tree(root, kind, item)
        if actual != expected[kind]:
            raise ProfileError(
                f"{kind} inventory mismatch: missing={sorted(expected[kind] - actual)}, "
                f"unreferenced={sorted(actual - expected[kind])}"
            )
    return mcps


def _require_directory(path: Path, context: str) -> None:
    if path.is_symlink() or not path.exists() or not path.is_dir():
        raise ProfileError(f"{context} must be a non-symlink directory: {path}")


def _validate_capability_tree(root: Path, kind: str, capability: Path) -> None:
    entries = sorted(
        capability.rglob("*"), key=lambda path: path.relative_to(root).as_posix()
    )
    for item in entries:
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            raise ProfileError(
                f"capability tree contains unsupported entry: {item.relative_to(root)}"
            )
    if kind == "skills":
        if not (capability / "SKILL.md").is_file():
            raise ProfileError(
                f"skill capability lacks SKILL.md: {capability.relative_to(root)}"
            )
        if not any(item.is_file() for item in entries):
            raise ProfileError(
                f"skill capability is empty: {capability.relative_to(root)}"
            )
        return
    direct = {item.name for item in capability.iterdir()}
    if direct != {"targets"}:
        raise ProfileError(
            f"{kind} capability must contain only targets/: {capability.relative_to(root)}"
        )
    targets = capability / "targets"
    _require_directory(targets, f"{kind} targets")
    target_names = {item.name for item in targets.iterdir()}
    if not target_names or not target_names.issubset(set(CLIENTS)):
        raise ProfileError(
            f"{kind} targets must be a non-empty subset of {list(CLIENTS)}"
        )
    for target in targets.iterdir():
        _require_directory(target, f"{kind} target {target.name}")
        direct = {item.name for item in target.iterdir()}
        if direct != {kind}:
            raise ProfileError(
                f"{kind} target {target.name} must contain only {kind}/: "
                f"{target.relative_to(root)}"
            )
        namespace = target / kind
        _require_directory(namespace, f"{kind} target {target.name} namespace")
        if not any(item.is_file() for item in namespace.rglob("*")):
            raise ProfileError(f"{kind} target is empty: {target.relative_to(root)}")


def _load_mcp(path: Path, expected_name: str) -> McpDefinition:
    data = _strict_json(path)
    if not isinstance(data, dict):
        raise ProfileError(f"MCP definition must be an object: {path}")
    _expect_keys(
        data, {"version", "name", "command", "args", "env"}, f"MCP {expected_name}"
    )
    if type(data["version"]) is not int or data["version"] != 1:
        raise ProfileError(f"MCP {expected_name}.version must be 1")
    if data["name"] != expected_name:
        raise ProfileError(f"MCP {expected_name}.name must equal its file name")
    if (
        not isinstance(data["command"], str)
        or not data["command"]
        or "\x00" in data["command"]
    ):
        raise ProfileError(
            f"MCP {expected_name}.command must be a non-empty NUL-free string"
        )
    args = data["args"]
    if not isinstance(args, list) or any(
        not isinstance(item, str) or "\x00" in item for item in args
    ):
        raise ProfileError(
            f"MCP {expected_name}.args must be an array of NUL-free strings"
        )
    env = data["env"]
    if not isinstance(env, dict) or any(
        not isinstance(key, str)
        or not key
        or "\x00" in key
        or not isinstance(value, str)
        or "\x00" in value
        for key, value in env.items()
    ):
        raise ProfileError(f"MCP {expected_name}.env must be a string-to-string object")
    return McpDefinition(
        expected_name, data["command"], tuple(args), dict(sorted(env.items())), path
    )


def _path_key(value: str) -> str:
    """Normalize one relative path spelling for conservative cross-platform comparisons."""

    return os.path.normcase(value.replace("\\", "/")).casefold()

def _managed_publication_paths(root: Path) -> set[str]:
    """Return exact dual-client Marketplace sources that cannot activate by discovery."""

    allowed: set[str] = set()
    claude_entry = root / "CLAUDE.md"
    if (
        claude_entry.is_file()
        and not claude_entry.is_symlink()
        and claude_entry.read_text(encoding="utf-8") == "@AGENTS.md\n"
    ):
        allowed.add(_path_key("CLAUDE.md"))

    agents_root = root / ".agents"
    agents_plugins = agents_root / "plugins"
    codex_marketplace = agents_plugins / "marketplace.json"
    claude_root = root / ".claude-plugin"
    claude_marketplace = claude_root / "marketplace.json"
    if any(
        path.is_symlink()
        for path in (
            agents_root,
            agents_plugins,
            codex_marketplace,
            claude_root,
            claude_marketplace,
        )
    ) or not codex_marketplace.is_file() or not claude_marketplace.is_file():
        return allowed

    try:
        codex_payload = _strict_json(codex_marketplace)
        claude_payload = _strict_json(claude_marketplace)
    except ProfileError:
        return allowed
    codex_plugins = codex_payload.get("plugins")
    claude_plugins = claude_payload.get("plugins")
    if not isinstance(codex_plugins, list) or not isinstance(claude_plugins, list):
        return allowed

    codex_versions: dict[str, str] = {}
    managed_plugin_paths: set[str] = set()
    for plugin in codex_plugins:
        if not isinstance(plugin, dict):
            return allowed
        name = plugin.get("name")
        version = plugin.get("version")
        source = plugin.get("source")
        if (
            not isinstance(name, str)
            or not IDENTIFIER.fullmatch(name)
            or name in codex_versions
            or not isinstance(version, str)
            or not version
            or not isinstance(source, dict)
            or source.get("source") != "local"
            or source.get("path") != f"./plugins/{name}"
        ):
            return allowed
        plugin_root = root / "plugins" / name
        codex_manifest_root = plugin_root / ".codex-plugin"
        codex_manifest_path = codex_manifest_root / "plugin.json"
        claude_manifest_root = plugin_root / ".claude-plugin"
        claude_manifest_path = claude_manifest_root / "plugin.json"
        if (
            not plugin_root.is_dir()
            or plugin_root.is_symlink()
            or codex_manifest_root.is_symlink()
            or codex_manifest_path.is_symlink()
            or claude_manifest_root.is_symlink()
            or claude_manifest_path.is_symlink()
            or not codex_manifest_path.is_file()
            or not claude_manifest_path.is_file()
        ):
            return allowed
        try:
            codex_manifest = _strict_json(codex_manifest_path)
            claude_manifest = _strict_json(claude_manifest_path)
        except ProfileError:
            return allowed
        for manifest in (codex_manifest, claude_manifest):
            if (
                manifest.get("name") != name
                or manifest.get("version") != version
                or manifest.get("repository")
                != "https://github.com/Eridanus117/agent-system"
                or manifest.get("skills") != "./skills/"
            ):
                return allowed
        codex_versions[name] = version
        managed_plugin_paths.update(
            {
                _path_key(f"plugins/{name}/.codex-plugin"),
                _path_key(f"plugins/{name}/.codex-plugin/plugin.json"),
                _path_key(f"plugins/{name}/.claude-plugin"),
                _path_key(f"plugins/{name}/.claude-plugin/plugin.json"),
            }
        )

    claude_versions: dict[str, str] = {}
    for plugin in claude_plugins:
        if not isinstance(plugin, dict):
            return allowed
        name = plugin.get("name")
        version = plugin.get("version")
        if (
            not isinstance(name, str)
            or not IDENTIFIER.fullmatch(name)
            or name in claude_versions
            or not isinstance(version, str)
            or not version
            or plugin.get("source") != f"./plugins/{name}"
        ):
            return allowed
        claude_versions[name] = version
    if not codex_versions or claude_versions != codex_versions:
        return allowed

    allowed.update(
        {
            _path_key(".agents"),
            _path_key(".agents/plugins"),
            _path_key(".agents/plugins/marketplace.json"),
            _path_key(".claude-plugin"),
            _path_key(".claude-plugin/marketplace.json"),
            *managed_plugin_paths,
        }
    )
    return allowed




def _check_project_pollution(root: Path) -> None:
    violations: list[str] = []
    bypass_dirs = {_path_key(value) for value in PROJECT_BYPASS_DIRS}
    bypass_files = {_path_key(value) for value in PROJECT_BYPASS_FILES}
    bypass_paths = {_path_key(value) for value in PROJECT_BYPASS_PATHS}
    managed_publication_paths = _managed_publication_paths(root)
    for item in sorted(
        root.rglob("*"), key=lambda path: path.relative_to(root).as_posix()
    ):
        relative = item.relative_to(root)
        relative_text = relative.as_posix()
        if relative.parts[0] in {".cap", ".git"}:
            continue
        if _path_key(relative_text) in managed_publication_paths:
            continue
        if any(_path_key(part) in bypass_dirs for part in relative.parts):
            violations.append(relative_text)
            continue
        if _path_key(relative_text) in bypass_paths:
            violations.append(relative_text)
            continue
        if _path_key(item.name) in bypass_files and relative_text != "AGENTS.md":
            violations.append(relative_text)
    if violations:
        raise ProfileError(
            f"project capability bypass detected: {', '.join(violations)}"
        )


def _codex_capability_root_is_disabled(value: Any) -> bool:
    """Return whether a capability root or all of its named entries are disabled."""

    if not isinstance(value, Mapping) or not value:
        return False
    if value.get("enabled") is False:
        return True
    return all(
        isinstance(entry, Mapping) and entry.get("enabled") is False
        for entry in value.values()
    )


def _codex_config_has_active_capability(config: Mapping[str, Any]) -> bool:
    """Return whether a Codex config actively enables model-visible capability input."""

    for key in CODEX_CAPABILITY_KEYS - {"hooks", "plugins", "skills"}:
        value = config.get(key)
        if not value:
            continue
        if (
            key in CODEX_EXPLICITLY_DISABLABLE_ROOTS
            and _codex_capability_root_is_disabled(value)
        ):
            continue
        return True
    projects = config.get("projects")
    if projects and (
        not isinstance(projects, Mapping)
        or any(
            not isinstance(value, Mapping)
            or set(value) - {"trust_level"}
            or not isinstance(value.get("trust_level"), str)
            for value in projects.values()
        )
    ):
        return True
    if any(
        value
        for key, value in config.items()
        if key not in CODEX_RUNTIME_ONLY_KEYS and key not in CODEX_CAPABILITY_KEYS
    ):
        return True
    hooks = config.get("hooks")
    if hooks and (
        not isinstance(hooks, Mapping) or any(key != "state" for key in hooks)
    ):
        return True
    features = config.get("features")
    if features and not isinstance(features, Mapping):
        return True
    if isinstance(features, Mapping):
        for key, value in features.items():
            if key in CODEX_CAPABILITY_FEATURES:
                if value is True:
                    return True
                if value is not False:
                    return True
            elif key not in CODEX_RUNTIME_ONLY_FEATURES and value not in (False, None):
                return True
    plugins = config.get("plugins")
    if plugins and (
        not isinstance(plugins, Mapping)
        or any(
            not isinstance(value, Mapping) or value.get("enabled") is not False
            for value in plugins.values()
        )
    ):
        return True
    skills = config.get("skills")
    if isinstance(skills, Mapping):
        if any(key != "config" for key in skills):
            return True
        entries = skills.get("config", ())
        if not isinstance(entries, Sequence) or isinstance(entries, (str, bytes)):
            return True
        if any(
            not isinstance(entry, Mapping) or entry.get("enabled") is not False
            for entry in entries
        ):
            return True
    elif skills:
        return True
    return False


def _qoder_hooks_are_ignored_host_integrations(value: Any, home: Path) -> bool:
    """Return whether Qoder Hooks contain only the ignored Yunke/R2C integrations."""

    if not isinstance(value, Mapping):
        return False
    yunke_command = f"{home}/.yunke/aah_hooks/hook_entry --agent-type=qoder"
    r2c_command = f"bash {home}/.r2c/scripts/qoder-cli-hook.sh"
    for registrations in value.values():
        if not isinstance(registrations, Sequence) or isinstance(
            registrations, (str, bytes)
        ):
            return False
        for registration in registrations:
            if not isinstance(registration, Mapping) or set(registration) - {
                "hooks",
                "matcher",
            }:
                return False
            actions = registration.get("hooks")
            if not isinstance(actions, Sequence) or isinstance(actions, (str, bytes)):
                return False
            for action in actions:
                if not isinstance(action, Mapping) or action.get("type") != "command":
                    return False
                command = action.get("command")
                if command == yunke_command:
                    if action.get("_yunke_managed") is not True or set(action) - {
                        "_yunke_managed",
                        "command",
                        "timeout",
                        "type",
                    }:
                        return False
                elif command == r2c_command:
                    if set(action) - {"command", "timeout", "type"}:
                        return False
                else:
                    return False
    return True


def _qoder_config_has_active_capability(config: Mapping[str, Any], home: Path) -> bool:
    """Return whether a Qoder config actively enables project business capability."""

    enabled_plugins = config.get("enabledPlugins")
    if isinstance(enabled_plugins, Mapping) and any(
        value is not False for value in enabled_plugins.values()
    ):
        return True
    hooks = config.get("hooks")
    if hooks and not _qoder_hooks_are_ignored_host_integrations(hooks, home):
        return True
    return any(config.get(key) for key in ("mcpServers", "plugins", "skills"))


def _matches_host_floor(path: Path) -> bool:
    """Return whether one global instruction entry is exactly the inert host floor."""

    try:
        return path.is_file() and path.read_text(encoding="utf-8") == HOST_FLOOR_TEXT
    except (OSError, UnicodeError):
        return False


def _path_has_symlink_component(path: Path) -> bool:
    """Return whether an absolute path traverses a symlink at any component."""

    current = Path(path.anchor)
    try:
        for part in path.parts[1:]:
            current /= part
            if current.is_symlink():
                return True
    except OSError:
        return True
    return False


def _tree_has_symlink(root: Path) -> bool:
    """Return whether a materialized capability tree contains any symlink."""

    try:
        return root.is_symlink() or any(item.is_symlink() for item in root.rglob("*"))
    except OSError:
        return True


def _codex_system_skills_are_disabled(
    path: Path, config: Mapping[str, Any], home: Path
) -> bool:
    """Return whether every materialized Codex system Skill is explicitly disabled."""

    features = config.get("features")
    if not isinstance(features, Mapping) or features.get("skill_search") is not False:
        return False
    skills = config.get("skills")
    if not isinstance(skills, Mapping):
        return False
    entries = skills.get("config")
    if not isinstance(entries, Sequence) or isinstance(entries, (str, bytes)):
        return False
    if _tree_has_symlink(path):
        return False
    disabled: set[Path] = set()
    for entry in entries:
        if not isinstance(entry, Mapping) or entry.get("enabled") is not False:
            continue
        raw_path = entry.get("path")
        if not isinstance(raw_path, str) or not raw_path:
            continue
        entry_path = Path(raw_path).expanduser()
        if not entry_path.is_absolute():
            entry_path = home / ".codex" / entry_path
        entry_path = Path(os.path.abspath(entry_path))
        if _path_has_symlink_component(entry_path):
            continue
        disabled.add(entry_path)
    materialized = {Path(os.path.abspath(skill)) for skill in path.rglob("SKILL.md")}
    return materialized.issubset(disabled)


def _qoder_plugin_cache_is_disabled(path: Path, config: Mapping[str, Any]) -> bool:
    """Return whether every materialized Qoder plugin is explicitly disabled."""

    enabled = config.get("enabledPlugins")
    if (
        not isinstance(enabled, Mapping)
        or not enabled
        or any(value is not False for value in enabled.values())
        or _tree_has_symlink(path)
    ):
        return False
    try:
        root_entries = list(path.iterdir())
    except OSError:
        return False
    if any(
        item.name not in {"cache", "data"} or not item.is_dir() for item in root_entries
    ):
        return False
    data = path / "data"
    if data.exists():
        try:
            data_entries = list(data.iterdir())
            if any(
                item.name != "security-scan" or not item.is_dir() or any(item.iterdir())
                for item in data_entries
            ):
                return False
        except OSError:
            return False
    cache = path / "cache"
    if not cache.is_dir():
        return False
    for marketplace in cache.iterdir():
        if not marketplace.is_dir():
            return False
        children = list(marketplace.iterdir())
        if marketplace.name.startswith("qoder-enterprise-"):
            if any(
                item.name != "update.lock" or not item.is_file() for item in children
            ):
                return False
            continue
        for plugin in children:
            if not plugin.is_dir():
                return False
            if enabled.get(f"{plugin.name}@{marketplace.name}") is not False:
                return False
    return True


def _orca_managed_extensions_are_inert(path: Path) -> bool:
    """Return whether a client extension root contains only Orca runtime adapters."""

    if _tree_has_symlink(path):
        return False
    try:
        entries = list(path.iterdir())
        if not entries or any(
            not item.is_file() or item.name not in ORCA_MANAGED_EXTENSION_NAMES
            for item in entries
        ):
            return False
        for item in entries:
            with item.open(encoding="utf-8") as stream:
                if stream.readline(128).rstrip() != "// @orca-managed-pi-extension":
                    return False
        return True
    except (OSError, UnicodeError):
        return False


def _global_path_is_passive(
    relative: str,
    path: Path,
    home: Path,
    codex_config: Mapping[str, Any],
    qoder_config: Mapping[str, Any],
) -> bool:
    """Return whether an existing global path is an inert floor, empty root, or cache."""

    if path.is_dir() and not any(path.iterdir()):
        return True
    if relative in GLOBAL_FLOOR_PATHS:
        return _matches_host_floor(path)
    if relative in {".omp/agent/extensions", ".pi/agent/extensions"}:
        return _orca_managed_extensions_are_inert(path)
    codex_features = codex_config.get("features")
    if relative == ".codex/hooks":
        return (
            isinstance(codex_features, Mapping) and codex_features.get("hooks") is False
        )
    if relative == ".codex/plugins":
        return (
            isinstance(codex_features, Mapping)
            and codex_features.get("plugins") is False
            and not _codex_config_has_active_capability(
                {**codex_config, "skills": {}, "hooks": {}}
            )
        )
    if relative == ".codex/skills":
        return _codex_system_skills_are_disabled(path, codex_config, home)
    if relative == ".qoder/plugins":
        return _qoder_plugin_cache_is_disabled(path, qoder_config)
    return False


def _check_global_pollution() -> None:
    home = Path.home()
    codex_config_path = home / ".codex" / "config.toml"
    codex_config = _read_toml(codex_config_path) if codex_config_path.is_file() else {}
    qoder_config_path = home / ".qoder" / "settings.json"
    qoder_config = (
        _strict_json(qoder_config_path) if qoder_config_path.is_file() else {}
    )
    violations = {
        relative
        for relative in set(GLOBAL_CAPABILITY_PATHS)
        if os.path.lexists(home / relative)
        and not _global_path_is_passive(
            relative, home / relative, home, codex_config, qoder_config
        )
    }
    if codex_config and _codex_config_has_active_capability(codex_config):
        violations.add(".codex/config.toml")
    json_configs = {
        ".claude.json": {"enabledPlugins", "hooks", "mcpServers", "plugins", "skills"},
        ".gemini/settings.json": {
            "extensions",
            "hooks",
            "mcpServers",
            "plugins",
            "skills",
        },
    }
    for relative, keys in json_configs.items():
        path = home / relative
        if path.is_file() and _contains_mapping_key(_strict_json(path), keys):
            violations.add(relative)
    if qoder_config and _qoder_config_has_active_capability(qoder_config, home):
        violations.add(".qoder/settings.json")
    text_configs = {
        ".config/opencode/opencode.json": {"instructions", "mcp", "plugin"},
        ".omp/agent/config.yml": {
            "extensions",
            "hooks",
            "mcp",
            "mcpServers",
            "plugins",
            "rules",
            "skills",
        },
        ".pi/agent/config.yml": {
            "extensions",
            "hooks",
            "mcp",
            "mcpServers",
            "plugins",
            "rules",
            "skills",
        },
    }
    for relative, keys in text_configs.items():
        path = home / relative
        if path.is_file() and _text_has_top_level_key(path, keys):
            violations.add(relative)
    if violations:
        raise ProfileError(
            f"global capability pollution detected: {', '.join(sorted(violations))}"
        )


SECRET_KEY_PATTERN = re.compile(
    r"(?:api[-_]?key|auth|bearer|cookie|credential|password|private[-_]?key|secret|token)",
    re.IGNORECASE,
)
SECRET_LINE_PATTERN = re.compile(
    r"(?im)^(\s*[\"']?[^:=\n]*(?:api[-_]?key|auth|bearer|cookie|credential|"
    r"password|private[-_]?key|secret|token)[^:=\n]*[\"']?\s*[:=]\s*).*$"
)
REAL_HOME_CONFIG_KEYS: Mapping[str, set[str]] = {
    ".claude.json": {"enabledPlugins", "hooks", "mcpServers", "plugins", "skills"},
    ".gemini/settings.json": {
        "extensions",
        "hooks",
        "mcpServers",
        "plugins",
        "skills",
    },
    ".config/opencode/opencode.json": {"instructions", "mcp", "plugin"},
    ".omp/agent/config.yml": {
        "extensions",
        "hooks",
        "mcp",
        "mcpServers",
        "plugins",
        "rules",
        "skills",
    },
    ".pi/agent/config.yml": {
        "extensions",
        "hooks",
        "mcp",
        "mcpServers",
        "plugins",
        "rules",
        "skills",
    },
}


def _redact_secret_values(value: Any, parent_key: str = "") -> Any:
    """Remove secret-bearing values before any configuration content is hashed."""

    if isinstance(value, Mapping):
        redacted: dict[str, Any] = {}
        for key, item in sorted(value.items(), key=lambda pair: str(pair[0])):
            name = str(key)
            if SECRET_KEY_PATTERN.search(name) or parent_key.casefold() in {
                "env",
                "environment",
                "headers",
            }:
                redacted[name] = "<external-secret>"
            else:
                redacted[name] = _redact_secret_values(item, name)
        return redacted
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_redact_secret_values(item, parent_key) for item in value]
    return value


def _canonical_mode(path: Path) -> int:
    """Return a filesystem-independent permission value for one lock or render input.

    The raw `stat.S_IMODE` value is not comparable across platforms or even
    across filesystems on one platform, so recording it verbatim made
    `.cap/lock.json` and every `tree_hash` environment-dependent: a lock written
    in one environment always failed verification in another. Observed values
    for the same committed, non-executable file:

        Linux ext4        0o644
        Windows (native)  0o666   -- only a read-only flag exists
        WSL on DrvFs      0o777   -- every file reports as executable

    No canonicalization of these values can agree, because DrvFs reports the
    executable bit set for everything while Git for Windows checks every file
    out as non-executable. The permission bits therefore carry no portable
    information, and this function returns a constant.

    Integrity is unaffected: `type` plus the content `sha256` already identify
    every lock input, and capability permissions are gated separately.

    Consequence: an executable capability file is recorded and materialized as
    non-executable. No lock input is currently executable. Restoring executable
    support requires a portable source for that bit -- Git's index rather than
    the filesystem -- and a lock version bump; the field should simply be
    removed at that point. See Eridanus117/agent-system#82.
    """

    del path
    return 0o644


def _redacted_file_bytes(path: Path) -> bytes:
    """Read one bounded capability file and redact recognizable secret assignments."""

    content = path.read_bytes()
    if len(content) > 8 * 1024 * 1024:
        raise ProfileError(f"machine-context capability file exceeds 8 MiB: {path}")
    suffix = path.suffix.casefold()
    try:
        if suffix == ".json":
            parsed = _loads_strict_json(content.decode("utf-8"), str(path))
            return _canonical_json(_redact_secret_values(parsed))
        if suffix == ".toml":
            parsed = tomllib.loads(content.decode("utf-8"))
            return _canonical_json(_redact_secret_values(parsed))
        text = content.decode("utf-8")
    except (UnicodeError, tomllib.TOMLDecodeError, ProfileError):
        return content
    return SECRET_LINE_PATTERN.sub(r"\1<external-secret>", text).encode("utf-8")


def _home_path_digest(path: Path) -> str:
    """Hash one capability path as redacted content, mode, and lexical tree shape."""

    records: dict[str, Any] = {}
    entries = [path]
    if path.is_dir() and not path.is_symlink():
        entries.extend(sorted(path.rglob("*"), key=lambda item: item.relative_to(path).as_posix()))
    if len(entries) > 4096:
        raise ProfileError(f"machine-context capability tree exceeds 4096 entries: {path}")
    for item in entries:
        relative = "." if item == path else item.relative_to(path).as_posix()
        info = item.lstat()
        mode = f"{stat.S_IMODE(info.st_mode):04o}"
        if item.is_symlink():
            records[relative] = {
                "type": "symlink",
                "mode": mode,
                "target_sha256": _sha256(os.readlink(item).encode("utf-8")),
            }
        elif item.is_dir():
            records[relative] = {"type": "directory", "mode": mode}
        elif item.is_file():
            records[relative] = {
                "type": "file",
                "mode": mode,
                "sha256": _sha256(_redacted_file_bytes(item)),
            }
        else:
            raise ProfileError(f"unsupported machine-context capability entry: {item}")
    return f"sha256:{_sha256(_canonical_json(records))}"


def _home_entry_kind(relative: str) -> str:
    folded = relative.casefold()
    if any(name in folded for name in ("agents.md", "claude.md", "gemini.md", "instructions")):
        return "context"
    if "skill" in folded:
        return "skills"
    if "mcp" in folded:
        return "mcp"
    if "hook" in folded:
        return "hooks"
    if "plugin" in folded or "extension" in folded:
        return "plugins"
    return "settings"

def _home_capability_inventory(path: Path, kind: str) -> dict[str, list[str]]:
    """Extract stable capability ids without recording capability contents."""

    names: dict[str, set[str]] = {
        field: set() for field in ("skills", "mcps", "hooks", "plugins")
    }

    def add_values(field: str, value: Any) -> None:
        if isinstance(value, Mapping):
            values = value.keys()
        elif isinstance(value, list):
            values = value
        else:
            return
        names[field].update(
            item for item in values if isinstance(item, str) and IDENTIFIER.fullmatch(item)
        )

    try:
        if kind == "skills" and path.is_dir():
            names["skills"].update(
                skill.parent.name
                for skill in path.rglob("SKILL.md")
                if IDENTIFIER.fullmatch(skill.parent.name)
            )
        elif kind == "hooks" and path.is_dir():
            names["hooks"].update(
                item.name for item in path.iterdir() if IDENTIFIER.fullmatch(item.name)
            )
        elif kind == "plugins" and path.is_dir():
            for marker in path.rglob("plugin.json"):
                payload = _strict_json(marker)
                if isinstance(payload, Mapping):
                    name = payload.get("name")
                    if isinstance(name, str) and IDENTIFIER.fullmatch(name):
                        names["plugins"].add(name)
        if path.is_file() and path.suffix.casefold() == ".json":
            payload = _strict_json(path)
            if isinstance(payload, Mapping):
                add_values("mcps", payload.get("mcpServers"))
                add_values("plugins", payload.get("enabledPlugins"))
        elif path.is_file() and path.suffix.casefold() == ".toml":
            payload = tomllib.loads(path.read_text(encoding="utf-8"))
            if isinstance(payload, Mapping):
                add_values("mcps", payload.get("mcp_servers"))
                add_values("mcps", payload.get("mcpServers"))
    except (OSError, ProfileError, UnicodeDecodeError, tomllib.TOMLDecodeError):
        return {field: [] for field in ("skills", "mcps", "hooks", "plugins")}
    return {field: sorted(values) for field, values in names.items()}


def discover_real_home(home_root: Path | str) -> dict[str, Any]:
    """Build a private, redacted inventory of one real HOME capability surface."""

    home = Path(home_root).expanduser().resolve(strict=True)
    if not home.is_dir():
        raise ProfileError(f"real HOME is not a directory: {home}")
    codex_config_path = home / ".codex" / "config.toml"
    codex_config = _read_toml(codex_config_path) if codex_config_path.is_file() else {}
    qoder_config_path = home / ".qoder" / "settings.json"
    qoder_config = (
        _strict_json(qoder_config_path) if qoder_config_path.is_file() else {}
    )
    candidates = set(GLOBAL_CAPABILITY_PATHS) | set(REAL_HOME_CONFIG_KEYS) | {
        ".codex/config.toml",
        ".qoder/settings.json",
    }
    entries: list[dict[str, Any]] = []
    for relative in sorted(candidates):
        path = home / relative
        if not os.path.lexists(path):
            continue
        active = True
        if relative in GLOBAL_CAPABILITY_PATHS:
            active = not _global_path_is_passive(
                relative, path, home, codex_config, qoder_config
            )
        if relative == ".codex/config.toml":
            active = bool(codex_config) and _codex_config_has_active_capability(
                codex_config
            )
        elif relative == ".qoder/settings.json":
            active = bool(qoder_config) and _qoder_config_has_active_capability(
                qoder_config, home
            )
        elif relative in REAL_HOME_CONFIG_KEYS:
            keys = REAL_HOME_CONFIG_KEYS[relative]
            if path.suffix.casefold() == ".json":
                active = path.is_file() and _contains_mapping_key(
                    _strict_json(path), keys
                )
            else:
                active = path.is_file() and _text_has_top_level_key(path, keys)
        kind = _home_entry_kind(relative)
        capabilities = _home_capability_inventory(path, kind)
        entries.append(
            {
                "path": relative,
                "kind": kind,
                "state": "active" if active else "passive",
                "digest": _home_path_digest(path),
                "capabilities": capabilities,
            }
        )
    effective_records = [entry for entry in entries if entry["state"] == "active"]
    return {
        "version": BASE_MANIFEST_VERSION,
        "context": MACHINE_CONTEXT_NAME,
        "home": str(home),
        "effective_digest": f"sha256:{_sha256(_canonical_json(effective_records))}",
        "inventory_digest": f"sha256:{_sha256(_canonical_json(entries))}",
        "entries": entries,
    }

def discover_asset_inventory(home_root: Path | str) -> dict[str, Any]:
    """Build a separate redacted inventory for Agent-facing candidates."""

    machine_context = discover_real_home(home_root)

    def observed_entries(kind: str) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for entry in machine_context["entries"]:
            if entry["kind"] != kind:
                continue
            result.append(
                {
                    **entry,
                    "status": "unknown"
                    if entry["state"] == "active"
                    else "observed",
                }
            )
        return result

    capability_entries = [
        {
            **entry,
            "status": "unknown" if entry["state"] == "active" else "observed",
        }
        for entry in machine_context["entries"]
        if entry["kind"] in CAPABILITY_KINDS
    ]
    instruction_entries = observed_entries("context")
    inventory_digest = "sha256:" + _sha256(_canonical_json({
        "capability": capability_entries,
        "instruction": instruction_entries,
    }))
    return {
        "version": 1,
        "kind": "asset-inventory",
        "source_context_digest": machine_context["effective_digest"],
        "inventory_digest": inventory_digest,
        "capability_entries": capability_entries,
        "instruction_entries": instruction_entries,
    }

def classify_asset_inventory(
    inventory: Mapping[str, Any],
    *,
    allowed: Sequence[str] = (),
    denied: Sequence[str] = (),
    client_limited: bool = False,
) -> dict[str, Any]:
    """Project observed candidates into explicit closure evidence states."""

    allowed_names = set(allowed)
    denied_names = set(denied)

    def classify(entries: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for entry in entries:
            names = {
                name
                for values in entry.get("capabilities", {}).values()
                for name in values
            }
            names.add(str(entry["path"]))
            if client_limited:
                status = "reported_client_limited"
            elif names & denied_names:
                status = "blocked"
            elif names & allowed_names:
                status = "allowed"
            elif entry.get("status") == "unknown":
                status = "unknown"
            else:
                status = "stripped"
            result.append({**entry, "status": status})
        return result

    return {
        **inventory,
        "capability_entries": classify(inventory["capability_entries"]),
        "instruction_entries": classify(inventory["instruction_entries"]),
    }

def enforce_asset_closure(
    inventory: Mapping[str, Any], *, require_client_evidence: bool = True
) -> None:
    """Fail closed for blocked assets and active unknown observations."""

    entries = [
        *inventory["capability_entries"],
        *inventory["instruction_entries"],
    ]
    blocked = sorted(
        str(entry["path"]) for entry in entries if entry.get("status") == "blocked"
    )
    if blocked:
        raise ProfileError(f"blocked Agent-facing assets: {', '.join(blocked)}")
    if require_client_evidence:
        unknown = sorted(
            str(entry["path"]) for entry in entries if entry.get("status") == "unknown"
        )
        if unknown:
            raise ProfileError(
                "active Agent-facing assets lack client evidence: "
                + ", ".join(unknown)
            )

def _validate_external_imports(
    project: Project, profile: Profile, inventory: Mapping[str, Any]
) -> tuple[str, ...]:
    """Require approved provenance and role binding for external assets."""

    entries = [
        *inventory["capability_entries"],
        *inventory["instruction_entries"],
    ]
    imported: list[str] = []
    for item in project.external_imports:
        if profile.name not in item["profiles"]:
            continue
        if not item["approved"]:
            raise ProfileError(
                f"external import {item['name']} is not approved for {profile.name}"
            )
        matches = [
            entry
            for entry in entries
            if entry["digest"] == item["digest"]
            and item["name"]
            in {
                name
                for values in entry.get("capabilities", {}).values()
                for name in values
            }
        ]
        if not matches:
            raise ProfileError(
                f"external import {item['name']} does not match machine asset digest"
            )
        imported.append(item["name"])
    return tuple(imported)

def _controlled_output_path(value: Path | str, context: str) -> Path:
    path = Path(value).expanduser().absolute()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink() or _path_has_symlink_component(path.parent):
        raise ProfileError(f"{context} path must not traverse symlinks: {path}")
    return path


def create_base_manifest(
    home_root: Path | str, manifest_path: Path | str
) -> dict[str, Any]:
    """Refresh the private machine-context manifest without approving it."""

    payload = discover_real_home(home_root)
    target = _controlled_output_path(manifest_path, "machine-context manifest")
    _atomic_write(target, _canonical_json(payload), mode=0o600)
    return payload


def _load_base_manifest(path: Path | str) -> dict[str, Any]:
    target = Path(path).expanduser().resolve(strict=True)
    payload = _strict_json(target)
    if not isinstance(payload, Mapping):
        raise ProfileError("machine-context manifest must be an object")
    _expect_keys(
        payload,
        {
            "version",
            "context",
            "home",
            "effective_digest",
            "inventory_digest",
            "entries",
        },
        "machine-context manifest",
    )
    if payload["version"] != BASE_MANIFEST_VERSION:
        raise ProfileError(
            f"machine-context manifest.version must be {BASE_MANIFEST_VERSION}"
        )
    if payload["context"] != MACHINE_CONTEXT_NAME:
        raise ProfileError(
            f"machine-context manifest.context must be {MACHINE_CONTEXT_NAME}"
        )
    if not isinstance(payload["entries"], list):
        raise ProfileError("machine-context manifest.entries must be an array")
    effective = [
        entry
        for entry in payload["entries"]
        if isinstance(entry, Mapping) and entry.get("state") == "active"
    ]
    expected_effective = f"sha256:{_sha256(_canonical_json(effective))}"
    expected_inventory = (
        f"sha256:{_sha256(_canonical_json(payload['entries']))}"
    )
    if payload["effective_digest"] != expected_effective:
        raise ProfileError("machine-context effective_digest is invalid")
    if payload["inventory_digest"] != expected_inventory:
        raise ProfileError("machine-context inventory_digest is invalid")
    return dict(payload)


def approve_base_manifest(
    manifest_path: Path | str, pin_path: Path | str
) -> dict[str, Any]:
    """Approve one reviewed machine-context digest without copying its inventory."""

    manifest = _load_base_manifest(manifest_path)
    payload = {
        "version": BASE_PIN_VERSION,
        "context": MACHINE_CONTEXT_NAME,
        "approved_digest": manifest["effective_digest"],
        "approved_at": datetime.now(UTC).isoformat(),
        "tool_version": RENDERER_VERSION,
        "policy": "tiered-gate",
    }
    target = _controlled_output_path(pin_path, "machine-context pin")
    _atomic_write(target, _canonical_json(payload), mode=0o644)
    return payload


def _load_base_pin(path: Path | str) -> dict[str, Any]:
    payload = _strict_json(Path(path).expanduser().resolve(strict=True))
    if not isinstance(payload, Mapping):
        raise ProfileError("machine-context pin must be an object")
    _expect_keys(
        payload,
        {
            "version",
            "context",
            "approved_digest",
            "approved_at",
            "tool_version",
            "policy",
        },
        "machine-context pin",
    )
    if payload["version"] != BASE_PIN_VERSION:
        raise ProfileError(
            f"machine-context pin.version must be {BASE_PIN_VERSION}"
        )
    if payload["context"] != MACHINE_CONTEXT_NAME:
        raise ProfileError(
            f"machine-context pin.context must be {MACHINE_CONTEXT_NAME}"
        )
    if payload["policy"] != "tiered-gate":
        raise ProfileError("machine-context pin.policy must be tiered-gate")
    return dict(payload)


def _profile_uses_real_home(profile: Profile) -> bool:
    """All v3 roles run inside the approved machine context."""

    return True


def _base_diff(
    locked: Mapping[str, Any], live: Mapping[str, Any]
) -> tuple[list[str], list[str]]:
    locked_entries = {
        entry["path"]: entry
        for entry in locked["entries"]
        if isinstance(entry, Mapping) and isinstance(entry.get("path"), str)
    }
    live_entries = {
        entry["path"]: entry
        for entry in live["entries"]
        if isinstance(entry, Mapping) and isinstance(entry.get("path"), str)
    }
    active: list[str] = []
    passive: list[str] = []
    for path in sorted(set(locked_entries) | set(live_entries)):
        before = locked_entries.get(path)
        after = live_entries.get(path)
        if before == after:
            continue
        if (before and before.get("state") == "active") or (
            after and after.get("state") == "active"
        ):
            active.append(path)
        else:
            passive.append(path)
    return active, passive


def _project_declared_capabilities(
    project: Project, profile: Profile, field: str
) -> set[str]:
    """Return the effective project-declared capability set."""

    return set(getattr(profile, field))


def _out_of_scope_base_mcps(
    project: Project, profile: Profile, manifest: Mapping[str, Any]
) -> list[tuple[str, str]]:
    """Return active base MCP ids not explicitly selected by project layers."""

    declared = _project_declared_capabilities(project, profile, "mcps")
    findings: set[tuple[str, str]] = set()
    for entry in manifest["entries"]:
        if not isinstance(entry, Mapping) or entry.get("state") != "active":
            continue
        path = entry.get("path")
        capabilities = entry.get("capabilities")
        if not isinstance(path, str) or not isinstance(capabilities, Mapping):
            continue
        names = capabilities.get("mcps")
        if not isinstance(names, list):
            continue
        for name in names:
            if isinstance(name, str) and name not in declared:
                findings.add((name, path))
    return sorted(findings)


def _warn_out_of_scope_base_mcps(
    project: Project, profile: Profile, manifest_path: Path | str | None
) -> None:
    """Warn the operator before an ambient base MCP can surprise the selected profile."""

    if manifest_path is None or not _profile_uses_real_home(profile):
        return
    manifest = _load_base_manifest(manifest_path)
    findings = _out_of_scope_base_mcps(project, profile, manifest)
    if not findings:
        return
    details = ", ".join(f"{name} ({path})" for name, path in findings)
    print(
        f"profile: warning: {profile.name} has out-of-scope base MCP(s): {details}; "
        "they are not part of the project-declared capability closure",
        file=sys.stderr,
    )


def _validate_base_layer_operations(
    project: Project, profile: Profile, manifest: Mapping[str, Any]
) -> None:
    """Resolve every operation against approved base ids and reject silent collisions."""

    base_names: dict[str, set[str]] = {
        field: {
            name
            for entry in manifest["entries"]
            if isinstance(entry, Mapping) and entry.get("state") == "active"
            for name in (
                entry.get("capabilities", {}).get(field, ())
                if isinstance(entry.get("capabilities"), Mapping)
                else ()
            )
            if isinstance(name, str)
        }
        for field in ("skills", "mcps", "hooks", "plugins")
    }
    effective = {field: set(names) for field, names in base_names.items()}
    for layer_name in profile.chain:
        if layer_name == REAL_HOME_PROFILE:
            continue
        layer = project.profiles.get(layer_name)
        if layer is None:
            continue
        for field in ("skills", "mcps", "hooks", "plugins"):
            operations = layer.operations[field]
            duplicate_allows = set(operations.allow) & effective[field]
            if duplicate_allows:
                raise ProfileError(
                    f"profile {layer.name}.{field}.allow conflicts with base/layer names: "
                    f"{sorted(duplicate_allows)}"
                )
            missing_denies = set(operations.deny) - effective[field]
            missing_overrides = set(operations.override) - effective[field]
            if missing_denies or missing_overrides:
                raise ProfileError(
                    f"profile {layer.name}.{field} references unknown inherited names: "
                    f"{sorted(missing_denies | missing_overrides)}"
                )
            effective[field].difference_update(operations.deny)
            effective[field].difference_update(operations.override)
            effective[field].update(operations.override)
            effective[field].update(operations.allow)


def _base_state(
    manifest_path: Path | str, pin_path: Path | str
) -> tuple[dict[str, Any], list[str], list[str]]:
    manifest = _load_base_manifest(manifest_path)
    pin = _load_base_pin(pin_path)
    if pin["approved_digest"] != manifest["effective_digest"]:
        raise ProfileError(
            "machine-context pin does not approve the current machine-context digest"
        )
    live = discover_real_home(manifest["home"])
    active, passive = _base_diff(manifest, live)
    return manifest, active, passive


def _profile_layer_digest(project: Project, profile: Profile) -> str:
    locked = _desired_lock(project)["profiles"][profile.name]
    return locked["layer_digest"]


def bind_profile(
    project_root: Path | str,
    profile_name: str,
    manifest_path: Path | str,
    pin_path: Path | str,
    binding_dir: Path | str,
    *,
    private_overlay: Path | str | None = None,
) -> dict[str, Any]:
    """Bind one portable profile layer to an approved machine-specific base."""

    project = load_project(project_root, private_overlay)
    _check_project_pollution(project.root)
    if project.overlay is not None:
        _check_project_pollution(project.overlay.root)
    desired = _desired_lock(project)
    _verify_lock(project, desired)
    if project.overlay is not None:
        _verify_evidence(project, desired)
    profile = _select_profile(project, profile_name)
    if not _profile_uses_real_home(profile):
        raise ProfileError(f"profile {profile.name} does not extend {REAL_HOME_PROFILE}")
    manifest, active, _passive = _base_state(manifest_path, pin_path)
    _validate_base_layer_operations(project, profile, manifest)
    _warn_out_of_scope_base_mcps(project, profile, manifest_path)
    inventory = discover_asset_inventory(manifest["home"])
    imported = _validate_external_imports(project, profile, inventory)
    enforce_asset_closure(
        classify_asset_inventory(
            inventory,
            allowed=(
                *profile.skills,
                *profile.mcps,
                *profile.hooks,
                *profile.plugins,
                *imported,
            ),
            denied=tuple(
                capability
                for operations in profile.operations.values()
                for capability in operations.deny
            ),
        )
    )
    if active:
        raise ProfileError(f"active machine-context drift detected: {', '.join(active)}")
    layer_digest = desired["profiles"][profile.name]["layer_digest"]
    effective_digest = "sha256:" + _sha256(_canonical_json({
        "machine_context_digest": manifest["effective_digest"],
        "layer_digest": layer_digest,
        "profile": profile.name,
    }))
    target = Path(binding_dir).expanduser().absolute() / f"{profile.name}.binding.json"
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    payload = {
        "version": BINDING_VERSION,
        "profile": profile.name,
        "machine_context": MACHINE_CONTEXT_NAME,
        "machine_context_digest": manifest["effective_digest"],
        "layer_digest": layer_digest,
        "effective_digest": effective_digest,
    }
    if project.overlay is not None:
        payload["overlay_namespace"] = project.overlay.namespace
    _atomic_write(target, _canonical_json(payload), mode=0o644)
    return payload


def _verify_profile_binding(
    project: Project,
    profile: Profile,
    desired: Mapping[str, Any],
    manifest_path: Path | str,
    pin_path: Path | str,
    binding_dir: Path | str,
) -> tuple[list[str], list[str]]:
    manifest, active, passive = _base_state(manifest_path, pin_path)
    _validate_base_layer_operations(project, profile, manifest)
    binding_path = (
        Path(binding_dir).expanduser().resolve(strict=True)
        / f"{profile.name}.binding.json"
    )
    binding = _strict_json(binding_path)
    layer_digest = desired["profiles"][profile.name]["layer_digest"]
    expected_effective = "sha256:" + _sha256(_canonical_json({
        "machine_context_digest": manifest["effective_digest"],
        "layer_digest": layer_digest,
        "profile": profile.name,
    }))
    expected = {
        "version": BINDING_VERSION,
        "profile": profile.name,
        "machine_context": MACHINE_CONTEXT_NAME,
        "machine_context_digest": manifest["effective_digest"],
        "layer_digest": layer_digest,
        "effective_digest": expected_effective,
    }
    if project.overlay is not None:
        expected["overlay_namespace"] = project.overlay.namespace
    if binding != expected:
        raise ProfileError(
            f"profile {profile.name} binding is stale; run profile bind after review"
        )
    return active, passive



def _check_profile_environment(
    project: Project,
    profile: Profile,
    desired: Mapping[str, Any],
    *,
    base_manifest: Path | str | None,
    base_pin: Path | str | None,
    binding_dir: Path | str | None,
    allow_active_drift: bool = False,
) -> list[str]:
    """Verify the approved machine-context or the legacy clean-home gate."""

    if not _profile_uses_real_home(profile):
        _check_global_pollution()
        return []
    if base_manifest is None or base_pin is None or binding_dir is None:
        raise ProfileError(
            f"profile {profile.name} requires --machine-context-manifest, "
            "--machine-context-pin, and --assembly-binding-dir"
        )
    active, passive = _verify_profile_binding(
        project,
        profile,
        desired,
        base_manifest,
        base_pin,
        binding_dir,
    )
    if active and not allow_active_drift:
        raise ProfileError(f"active machine-context drift detected: {', '.join(active)}")
    machine_context = _load_base_manifest(base_manifest)
    inventory = discover_asset_inventory(machine_context["home"])
    imported = _validate_external_imports(project, profile, inventory)
    allowed = (
        *profile.skills,
        *profile.mcps,
        *profile.hooks,
        *profile.plugins,
        *imported,
    )
    denied = tuple(
        capability
        for operations in profile.operations.values()
        for capability in operations.deny
    )
    enforce_asset_closure(
        classify_asset_inventory(inventory, allowed=allowed, denied=denied)
    )
    return [*(f"active:{path}" for path in active), *passive]

def _desired_lock(project: Project) -> dict[str, Any]:
    profiles: dict[str, Any] = {}
    for name, profile in sorted(project.profiles.items()):
        clients = {
            client: {"tree_hash": _tree_hash(_render_tree(project, client, profile))}
            for client in CLIENTS
        }
        operations = {
            kind: {
                "allow": list(profile.operations[kind].allow),
                "deny": list(profile.operations[kind].deny),
                "override": list(profile.operations[kind].override),
            }
            for kind in ("skills", "mcps", "hooks", "plugins")
        }
        layer = {
            "defaults": PROJECT_DEFAULTS_NAME,
            "chain": list(profile.chain),
            "runtime": dict(profile.runtime),
            "operations": operations,
            "inventory": _profile_inventory(profile),
            "clients": clients,
        }
        layer["layer_digest"] = f"sha256:{_sha256(_canonical_json(layer))}"
        profiles[name] = layer
    payload: dict[str, Any] = {
        "version": LOCK_VERSION,
        "renderer_version": RENDERER_VERSION,
        "clients": {
            client: {
                "adapter_version": _client_adapter_version(client),
                "executable": CLIENT_EXECUTABLES[client],
            }
            for client in CLIENTS
        },
        "capability_semantics": {
            "skills": "native-staging",
            "mcp": "native-config",
            "hooks": "opaque-staging",
            "plugins": "opaque-staging",
        },
        "inputs": _input_records(project),
        "external_imports": list(project.external_imports),
        "profiles": profiles,
    }
    if project.skill_imports:
        payload["project_skill_imports"] = [
            {
                "name": item.name,
                "source": item.source.relative_to(project.root).as_posix(),
            }
            for item in project.skill_imports.values()
        ]
    if project.overlay is not None:
        payload["source_layers"] = [
            {"kind": "public", "root": "project"},
            {
                "kind": "private",
                "namespace": project.overlay.namespace,
                "root": "explicit-overlay",
            },
        ]
        payload["evidence"] = {
            "version": EVIDENCE_VERSION,
            "root": "user-state/evidence",
            "source_digest": f"sha256:{_sha256(_canonical_json(payload['inputs']))}",
        }
    return payload


def _profile_inventory(profile: Profile) -> dict[str, list[str]]:
    return {
        "skills": list(profile.skills),
        "mcps": list(profile.mcps),
        "hooks": list(profile.hooks),
        "plugins": list(profile.plugins),
    }


def _input_records(project: Project) -> dict[str, Any]:
    if project.overlay is None:
        paths: set[Path] = {
            project.manifest,
            project.defaults,
            *project.runtime_policies.values(),
            project.root / "AGENTS.md",
        }
        if project.skill_imports_manifest is not None:
            paths.add(project.skill_imports_manifest)
        for item in project.skill_imports.values():
            paths.add(item.source)
            paths.update(item.source.rglob("*"))
        for profile in project.profiles.values():
            paths.update({profile.source, profile.prompt})
        capability_root = project.root / ".cap" / "capabilities"
        paths.add(capability_root)
        paths.update(capability_root.rglob("*"))
        records: dict[str, Any] = {}
        for path in sorted(
            paths, key=lambda item: item.relative_to(project.root).as_posix()
        ):
            relative = path.relative_to(project.root).as_posix()
            if path.is_symlink():
                raise ProfileError(f"lock input must not be a symlink: {relative}")
            if path.is_dir():
                records[relative] = {"type": "directory"}
            elif path.is_file():
                records[relative] = {
                    "type": "file",
                    "mode": f"{_canonical_mode(path):04o}",
                    "sha256": _sha256(path.read_bytes()),
                }
            else:
                raise ProfileError(
                    f"lock input is not a regular file or directory: {relative}"
                )
        return records

    entries: list[tuple[str, Path]] = [
        ("public/AGENTS.md", project.root / "AGENTS.md"),
        ("public/.cap/manifest.toml", project.manifest),
    ]
    entries.extend(
        (
            "public/" + path.relative_to(project.root).as_posix(),
            path,
        )
        for path in (project.defaults, *project.runtime_policies.values())
    )
    if project.skill_imports_manifest is not None:
        entries.append(
            (
                "public/" + project.skill_imports_manifest.relative_to(project.root).as_posix(),
                project.skill_imports_manifest,
            )
        )
    for item in project.skill_imports.values():
        relative = item.source.relative_to(project.root).as_posix()
        entries.append((f"public/{relative}", item.source))
        entries.extend(
            (
                "public/" + path.relative_to(project.root).as_posix(),
                path,
            )
            for path in item.source.rglob("*")
        )
    roots: dict[Path, str] = {project.root: "public"}
    if project.overlay is not None:
        roots[project.overlay.root] = "private"
        entries.append(
            (
                "private/.cap/manifest.toml",
                project.overlay.root / ".cap" / "manifest.toml",
            )
        )
        if project.overlay.descriptor is not None:
            entries.append(
                ("private/.cap/overlay.toml", project.overlay.descriptor)
            )
    for profile in project.profiles.values():
        prefix = roots[profile.source_root]
        entries.extend(
            (
                f"{prefix}/{path.relative_to(profile.source_root).as_posix()}",
                path,
            )
            for path in (profile.source, profile.prompt)
        )
    for source_root, prefix in roots.items():
        capability_root = source_root / ".cap" / "capabilities"
        entries.append(
            (f"{prefix}/.cap/capabilities", capability_root)
        )
        entries.extend(
            (
                f"{prefix}/{path.relative_to(source_root).as_posix()}",
                path,
            )
            for path in capability_root.rglob("*")
        )
    records: dict[str, Any] = {}
    for relative, path in sorted(entries):
        if path.is_symlink():
            raise ProfileError(f"lock input must not be a symlink: {relative}")
        if path.is_dir():
            records[relative] = {"type": "directory"}
        elif path.is_file():
            records[relative] = {
                "type": "file",
                "mode": f"{_canonical_mode(path):04o}",
                "sha256": _sha256(_redacted_file_bytes(path)),
            }
        else:
            raise ProfileError(
                f"lock input is not a regular file or directory: {relative}"
            )
    return records


def _verify_lock(project: Project, desired: Mapping[str, Any]) -> None:
    lock_path = _lock_path(project)
    if lock_path.is_symlink() or not lock_path.is_file():
        raise ProfileError("missing regular .cap/lock.json; run profile lock")
    actual = _strict_json(lock_path)
    if actual != desired:
        raise ProfileError(
            "capability lock drift detected; run profile lock after reviewing changes"
        )


def _render_tree(
    project: Project, client: str, profile: Profile
) -> dict[str, RenderedFile]:
    _validate_client(client)
    tree: dict[str, RenderedFile] = {}
    folded_paths: dict[str, str] = {}

    def put(path: str, rendered: RenderedFile, source: str) -> None:
        relative = _safe_relative(path, f"render path from {source}").as_posix()
        folded = relative.casefold()
        if relative in tree or folded in folded_paths:
            prior = folded_paths.get(folded, relative)
            raise ProfileError(
                f"render path conflict: {relative} from {source} conflicts with {prior}"
            )
        tree[relative] = rendered
        folded_paths[folded] = relative

    prompt = _profile_prompt(profile)
    mcp_definitions = [project.mcps[name] for name in profile.mcps]
    if client == "codex":
        put(
            "config.toml",
            RenderedFile(_codex_config(mcp_definitions)),
            "codex renderer",
        )
        put("AGENTS.md", RenderedFile(prompt), "codex renderer")
    elif client == "qoder":
        put("settings.json", RenderedFile(b"{}\n"), "qoder renderer")
        put("mcp.json", RenderedFile(_qoder_mcp(mcp_definitions)), "qoder renderer")
        put("system-prompt.md", RenderedFile(prompt), "qoder renderer")
    elif client == "claude":
        # `claude-config.yaml` is the CAP-owned intermediate, not a Claude
        # native file. It stays empty in the portable render for the same
        # reason OMP's `config.yml` does: effective policy and machine
        # binding belong to the adapter, not to the reproducible tree.
        put("claude-config.yaml", RenderedFile(b"{}\n"), "claude renderer")
        put(
            "mcp.json",
            RenderedFile(_claude_mcp(mcp_definitions)),
            "claude renderer",
        )
        put("system-prompt.md", RenderedFile(prompt), "claude renderer")
    elif client == "omp":
        put("config.yml", RenderedFile(b"{}\n"), "omp renderer")
        put("mcp.json", RenderedFile(_omp_mcp(mcp_definitions)), "omp renderer")
        put("system-prompt.md", RenderedFile(prompt), "omp renderer")
    else:
        raise ProfileError(f"client {client} has no renderer")

    for skill in profile.skills:
        source_root = profile.origins["skills"].get(skill)
        if source_root is None:
            raise ProfileError(f"skill {skill} has no verified source")
        rendered = 0
        for source in sorted(
            source_root.rglob("*"),
            key=lambda path: path.relative_to(source_root).as_posix(),
        ):
            if source.is_file():
                relative = source.relative_to(source_root).as_posix()
                put(
                    f"skills/{skill}/{relative}",
                    RenderedFile(
                        _redacted_file_bytes(source), _canonical_mode(source)
                    ),
                    f"skill {skill}",
                )
                rendered += 1
        if not rendered:
            # rglob() yields nothing for a missing or empty directory, so a
            # declared skill whose origin resolves to the wrong place would
            # otherwise be dropped without any error: lock, verify and render
            # all keep passing while the client receives no skill at all.
            raise ProfileError(
                f"skill {skill} rendered no files from {source_root}"
            )

    for kind, names in (("hooks", profile.hooks), ("plugins", profile.plugins)):
        for name in names:
            source_root = profile.origins[kind].get(name)
            if source_root is None:
                raise ProfileError(f"{kind[:-1]} {name} has no verified source")
            target = source_root / "targets" / client
            if not target.is_dir() or target.is_symlink():
                raise ProfileError(f"{kind[:-1]} {name} lacks required {client} target")
            for source in sorted(
                target.rglob("*"), key=lambda path: path.relative_to(target).as_posix()
            ):
                if source.is_file():
                    relative = source.relative_to(target).as_posix()
                    put(
                        relative,
                        RenderedFile(
                            _redacted_file_bytes(source),
                            _canonical_mode(source),
                        ),
                        f"{kind[:-1]} {name}",
                    )
    return dict(sorted(tree.items()))


def _read_nonempty_text(path: Path, context: str) -> str:
    """Read one required non-empty UTF-8 project source file."""

    try:
        value = path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as error:
        raise ProfileError(f"{context} must be readable UTF-8 text: {error}") from error
    if not value:
        raise ProfileError(f"{context} must be non-empty")
    return value


def _profile_prompt(profile: Profile) -> bytes:
    texts = [
        _read_nonempty_text(path, f"profile {profile.name} prompt")
        for path in profile.prompt_chain
    ]
    return ("\n\n".join(texts) + "\n").encode("utf-8")


def _codex_config(definitions: Sequence[McpDefinition]) -> bytes:
    lines = ['cli_auth_credentials_store = "file"']
    for definition in definitions:
        if lines:
            lines.append("")
        lines.extend(
            [
                f"[mcp_servers.{definition.name}]",
                f"command = {_toml_string(definition.command)}",
                f"args = {_toml_array(definition.args)}",
                "required = true",
            ]
        )
        if definition.env:
            lines.append("")
            lines.append(f"[mcp_servers.{definition.name}.env]")
            for key, value in sorted(definition.env.items()):
                lines.append(f"{_toml_key(key)} = {_toml_string(value)}")
    return (("\n".join(lines) + "\n") if lines else "").encode("utf-8")


def _qoder_mcp(definitions: Sequence[McpDefinition]) -> bytes:
    servers = {
        definition.name: {
            "command": definition.command,
            "args": list(definition.args),
            "env": dict(definition.env),
        }
        for definition in definitions
    }
    return _canonical_json({"mcpServers": servers})


def _claude_mcp(definitions: Sequence[McpDefinition]) -> bytes:
    """Render the CAP-side MCP tree consumed by the Claude adapter.

    Claude reads `mcpServers` with the same stdio shape as OMP, so the
    portable bytes are identical today. It is kept separate anyway: the two
    clients version their native schemas independently, and sharing one
    renderer would silently couple them.
    """

    servers = {
        definition.name: {
            "type": "stdio",
            "command": definition.command,
            "args": list(definition.args),
            "env": dict(definition.env),
        }
        for definition in definitions
    }
    return _canonical_json({"mcpServers": servers})


def _omp_mcp(definitions: Sequence[McpDefinition]) -> bytes:
    servers = {
        definition.name: {
            "type": "stdio",
            "command": definition.command,
            "args": list(definition.args),
            "env": dict(definition.env),
        }
        for definition in definitions
    }
    return _canonical_json({"mcpServers": servers})


def _toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _toml_array(values: Sequence[str]) -> str:
    return "[" + ", ".join(_toml_string(value) for value in values) + "]"


def _toml_key(value: str) -> str:
    return value if re.fullmatch(r"[A-Za-z0-9_-]+", value) else _toml_string(value)


def _tree_hash(tree: Mapping[str, RenderedFile]) -> str:
    records = {
        path: {
            "mode": f"{rendered.mode:04o}",
            "sha256": _sha256(rendered.content),
        }
        for path, rendered in sorted(tree.items())
    }
    return f"sha256:{_sha256(_canonical_json(records))}"


def _evidence_root() -> Path:
    configured = os.environ.get("CAP_EVIDENCE_ROOT")
    return Path(configured).expanduser().absolute() if configured else (
        Path.home() / ".agent-system-state" / "evidence"
    )


def _evidence_source_path(project: Project, relative: str) -> Path:
    if relative.startswith("public/"):
        return project.root / relative.removeprefix("public/")
    if project.overlay is None or not relative.startswith("private/"):
        raise ProfileError(f"unknown evidence source: {relative}")
    return project.overlay.root / relative.removeprefix("private/")


def _evidence_entries(tree: Mapping[str, RenderedFile]) -> list[dict[str, Any]]:
    return [
        {
            "path": path,
            "mode": f"{rendered.mode:04o}",
            "size": len(rendered.content),
            "sha256": _sha256(rendered.content),
        }
        for path, rendered in sorted(tree.items())
    ]


def _write_evidence_json(root: Path, payload: Mapping[str, Any]) -> None:
    _atomic_write(root / "evidence.json", _canonical_json(dict(payload)), mode=0o600)


def _write_evidence_entries(root: Path, entries: Sequence[Mapping[str, Any]]) -> None:
    content = b"".join(
        _canonical_json(dict(entry)) for entry in entries
    )
    _atomic_write(root / "entries.jsonl", content, mode=0o600)


def _materialize_evidence(project: Project, desired: Mapping[str, Any]) -> None:
    """Materialize non-secret source and render evidence for an overlay lock."""

    if project.overlay is None:
        return
    root = _evidence_root()
    if root.is_symlink():
        raise ProfileError("evidence root must not be a symlink")
    root.mkdir(parents=True, exist_ok=True)
    source_digest = f"sha256:{_sha256(_canonical_json(_input_records(project)))}"
    source_root = root / "sources" / source_digest
    source_entries: list[dict[str, Any]] = []
    for relative, record in _input_records(project).items():
        if record["type"] != "file":
            continue
        source = _evidence_source_path(project, relative)
        content = _redacted_file_bytes(source)
        target = source_root / "tree" / relative
        _atomic_write(target, content, mode=_canonical_mode(source))
        source_entries.append(
            {
                "path": relative,
                "mode": record["mode"],
                "size": len(content),
                "sha256": _sha256(content),
            }
        )
    _write_evidence_entries(source_root, source_entries)
    _write_evidence_json(
        source_root,
        {
            "version": EVIDENCE_VERSION,
            "kind": "source",
            "digest": source_digest,
            "entries": source_entries,
            "excluded": ["secret", "auth", "session", "history", "cache"],
        },
    )
    for profile_name, profile_data in desired["profiles"].items():
        closure_digest = profile_data["layer_digest"]
        closure_root = root / "closures" / closure_digest
        _write_evidence_json(
            closure_root,
            {
                "version": EVIDENCE_VERSION,
                "kind": "closure",
                "digest": closure_digest,
                "profile": profile_name,
                "source_digest": source_digest,
                "inventory": profile_data["inventory"],
            },
        )
        for client in CLIENTS:
            tree = _render_tree(project, client, project.profiles[profile_name])
            tree_hash = profile_data["clients"][client]["tree_hash"]
            render_root = root / "renders" / tree_hash / profile_name / client
            entries = _evidence_entries(tree)
            for relative, rendered in tree.items():
                _atomic_write(
                    render_root / "tree" / relative,
                    rendered.content,
                    mode=rendered.mode,
                )
            _write_evidence_entries(render_root, entries)
            _write_evidence_json(
                render_root,
                {
                    "version": EVIDENCE_VERSION,
                    "kind": "render",
                    "digest": tree_hash,
                    "profile": profile_name,
                    "client": client,
                    "source_digest": source_digest,
                    "closure_digest": closure_digest,
                    "entries": entries,
                },
            )


def _verify_evidence(project: Project, desired: Mapping[str, Any]) -> None:
    if project.overlay is None:
        return
    root = _evidence_root()
    source_digest = f"sha256:{_sha256(_canonical_json(_input_records(project)))}"
    source_root = root / "sources" / source_digest
    source_payload = _strict_json(source_root / "evidence.json")
    if source_payload.get("digest") != source_digest:
        raise ProfileError("source evidence digest mismatch")
    for profile_name, profile_data in desired["profiles"].items():
        closure_root = root / "closures" / profile_data["layer_digest"]
        closure = _strict_json(closure_root / "evidence.json")
        if closure.get("source_digest") != source_digest:
            raise ProfileError(f"profile {profile_name} closure evidence is stale")
        for client in CLIENTS:
            tree_hash = profile_data["clients"][client]["tree_hash"]
            render_root = root / "renders" / tree_hash / profile_name / client
            payload = _strict_json(render_root / "evidence.json")
            tree = _render_tree(project, client, project.profiles[profile_name])
            if payload.get("digest") != tree_hash or _tree_hash(tree) != tree_hash:
                raise ProfileError(
                    f"profile {profile_name}/{client} render evidence is stale"
                )
            for relative, rendered in tree.items():
                path = render_root / "tree" / relative
                if not path.is_file() or path.read_bytes() != rendered.content:
                    raise ProfileError(
                        f"profile {profile_name}/{client} render evidence is missing or modified"
                    )


def _write_all(descriptor: int, content: bytes) -> None:
    """Write every byte to one already-open file descriptor."""

    remaining = memoryview(content)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            raise OSError("file write made no progress")
        remaining = remaining[written:]


def _fsync_directory(path: Path) -> None:
    """Flush one directory entry where the host can open a directory for reading."""

    if not hasattr(os, "O_DIRECTORY"):
        return
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _stage_tree(staging: Path, tree: Mapping[str, RenderedFile]) -> list[str]:
    """Write one complete rendered tree into a private staging directory."""

    published: list[str] = []
    for relative, rendered in sorted(tree.items()):
        relative_path = PurePosixPath(relative)
        if (
            relative_path.is_absolute()
            or not relative_path.parts
            or any(part in {"", ".", ".."} for part in relative_path.parts)
        ):
            raise ProfileError(
                f"render path must be normalized and relative: {relative}"
            )
        if relative_path.parts[0] not in published:
            published.append(relative_path.parts[0])
        parent = staging
        for part in relative_path.parts[:-1]:
            parent = parent / part
            if not parent.is_dir():
                os.mkdir(parent, 0o700)
        target = parent / relative_path.parts[-1]
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        for name in ("O_CLOEXEC", "O_NOFOLLOW", "O_BINARY"):
            flags |= getattr(os, name, 0)
        descriptor = os.open(target, flags, rendered.mode)
        try:
            if hasattr(os, "fchmod"):
                os.fchmod(descriptor, rendered.mode)
            _write_all(descriptor, rendered.content)
            os.fsync(descriptor)
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise ProfileError(f"staged file is not private: {relative}")
        finally:
            os.close(descriptor)
    return published


def _publish_staged_entry(source: Path, target: Path) -> None:
    """Move one staged top-level entry into the target directory."""

    if target.exists() or target.is_symlink():
        raise ProfileError(f"materialize target already exists: {target.name}")
    try:
        os.replace(source, target)
    except OSError as error:
        if getattr(error, "errno", None) != errno.EXDEV:
            raise
        shutil.move(str(source), str(target))


def _materialize_tree(
    directory: StableDirectory, tree: Mapping[str, RenderedFile]
) -> None:
    """Stage the whole tree outside the target, then publish it entry by entry.

    Writing straight into the target would let a directory swap capture every
    intermediate ``mkdir`` and ``open``. Staging first confines the tree to a
    directory only this process can name, so the target is touched once per
    top-level entry, each time immediately after re-verifying its identity.
    """

    try:
        _validate_stable_directory(directory)
        with tempfile.TemporaryDirectory(prefix="cap-staged-tree-") as staging_root:
            staging = Path(staging_root)
            published = _stage_tree(staging, tree)
            for name in published:
                _validate_stable_directory(directory)
                _publish_staged_entry(staging / name, directory.path / name)
        _validate_stable_directory(directory)
        for relative in sorted(tree):
            live = os.lstat(directory.path / PurePosixPath(relative))
            if (
                not stat.S_ISREG(live.st_mode)
                or live.st_nlink != 1
                or _is_link_component(live)
            ):
                raise ProfileError(f"materialized file changed: {relative}")
        _fsync_directory(directory.path)
        _validate_stable_directory(directory)
    except ProfileError:
        raise
    except (OSError, NotImplementedError) as error:
        raise ProfileError(f"could not materialize tree: {error}") from error


def _select_profile(project: Project, profile_name: str) -> Profile:
    if not profile_name:
        raise ProfileError("profile is required; there is no default profile")
    try:
        return project.profiles[profile_name]
    except KeyError as error:
        raise ProfileError(f"unknown profile: {profile_name}") from error


def _client_adapter_version(client: str) -> int:
    try:
        return CLIENT_ADAPTER_VERSION[client]
    except KeyError as error:
        raise ProfileError(f"client {client} has no adapter version") from error


def _validate_client(client: str) -> None:
    if client not in CLIENTS:
        raise ProfileError(f"unknown client: {client}")


def _validate_forwarded_args(client: str, args: Sequence[str]) -> None:
    try:
        forbidden = FORBIDDEN_CLIENT_ARGUMENTS[client]
        compact_prefixes = FORBIDDEN_CLIENT_ARGUMENT_PREFIXES[client]
    except KeyError as error:
        # A registered client with no forbidden-argument policy would otherwise
        # raise KeyError here and accept every forwarded flag, including ones
        # that reopen gates the adapter closed.
        raise ProfileError(
            f"client {client} has no forwarded-argument policy"
        ) from error
    for argument in args:
        if not isinstance(argument, str) or "\x00" in argument:
            raise ProfileError("forwarded arguments must be NUL-free strings")
        key = argument.split("=", 1)[0]
        compact_override = any(
            argument.startswith(prefix) for prefix in compact_prefixes
        )
        if key in forbidden or compact_override:
            raise ProfileError(
                f"forwarded argument may override the {client} capability root: {argument}"
            )


def _require_git_root(root: Path) -> None:
    completed = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--show-toplevel"],
        capture_output=True,
        check=False,
        text=True,
    )
    if completed.returncode != 0:
        raise ProfileError("run requires the profile project to be a Git worktree root")
    try:
        discovered = Path(completed.stdout.strip()).resolve(strict=True)
    except OSError as error:
        raise ProfileError("Git reported an invalid worktree root") from error
    if discovered != root:
        raise ProfileError(
            f"profile project must equal the Git worktree root; discovered {discovered}"
        )


def _contains_mapping_key(value: Any, keys: set[str]) -> bool:
    """Return whether a nested mapping contains any capability-bearing key."""

    if isinstance(value, Mapping):
        return any(
            key in keys or _contains_mapping_key(item, keys)
            for key, item in value.items()
        )
    if isinstance(value, list):
        return any(_contains_mapping_key(item, keys) for item in value)
    return False


def _text_has_top_level_key(path: Path, keys: set[str]) -> bool:
    """Detect capability-bearing top-level keys in YAML or JSONC configuration."""

    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise ProfileError(
            f"global config must be readable UTF-8 text: {path}: {error}"
        ) from error
    stripped = text.lstrip()
    if stripped.startswith("{"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            alternatives = "|".join(re.escape(key) for key in sorted(keys))
            return (
                re.search(
                    rf"(?m)^[ \t]*(?:\"(?:{alternatives})\"|'(?:{alternatives})'|(?:{alternatives}))\s*:",
                    text,
                )
                is not None
            )
        return isinstance(data, dict) and any(key in data for key in keys)
    alternatives = "|".join(re.escape(key) for key in sorted(keys))
    return (
        re.search(
            rf"(?m)^(?:\"(?:{alternatives})\"|'(?:{alternatives})'|(?:{alternatives}))\s*:",
            text,
        )
        is not None
    )


def _prepare_receipt_path(value: Path | str) -> Path:
    """Normalize one lexical receipt target without resolving mutable ancestors."""

    path = Path(value).expanduser().absolute()
    if not path.name:
        raise ProfileError("receipt target must name a file")
    parent = _normalize_root_alias(path.parent, "receipt parent")
    return parent / path.name


def _reserve_receipt(
    project: Project,
    path: Path,
    *,
    parent_directory: StableDirectory | None = None,
) -> ReceiptReservation:
    """Exclusively create an external receipt under one verified parent directory."""

    if parent_directory is not None:
        if path.parent != parent_directory.path:
            raise ProfileError("receipt parent handle does not match the target path")
        _validate_stable_directory(parent_directory)
        _require_external_directory(project, parent_directory, "receipt")
        parent_info = os.lstat(parent_directory.path)
    else:
        with _stable_directory(path.parent, "receipt parent") as stable_parent:
            _require_external_directory(project, stable_parent, "receipt")
            parent_info = os.lstat(stable_parent.path)
    descriptor: int | None = None
    try:
        live_parent = os.lstat(path.parent)
        if (
            not stat.S_ISDIR(live_parent.st_mode)
            or _is_link_component(live_parent)
            or not _same_file_identity(
                live_parent, parent_info.st_dev, parent_info.st_ino
            )
        ):
            raise ProfileError("receipt parent changed before reservation")

        target_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        for name in ("O_CLOEXEC", "O_NOFOLLOW", "O_BINARY"):
            target_flags |= getattr(os, name, 0)
        try:
            descriptor = os.open(path, target_flags, 0o600)
        except FileExistsError as error:
            raise ProfileError(f"receipt target already exists: {path}") from error
        except (OSError, NotImplementedError) as error:
            raise ProfileError(f"could not reserve receipt target: {error}") from error
        if hasattr(os, "fchmod"):
            os.fchmod(descriptor, 0o600)
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ProfileError("reserved receipt must be a private regular file")
        return ReceiptReservation(
            path=path,
            descriptor=descriptor,
            parent_device=parent_info.st_dev,
            parent_inode=parent_info.st_ino,
            device=info.st_dev,
            inode=info.st_ino,
        )
    except BaseException:
        if descriptor is not None:
            recorded = os.fstat(descriptor)
            os.close(descriptor)
            _unlink_reserved_receipt(path, recorded.st_dev, recorded.st_ino)
        raise


def _validate_receipt_reservation(reservation: ReceiptReservation) -> None:
    try:
        if any(
            _is_link_component(os.lstat(candidate))
            for candidate in (reservation.path.parent, *reservation.path.parent.parents)
        ):
            raise ProfileError("receipt parent changed to a symlink")
        parent_info = os.lstat(reservation.path.parent)
        target_info = os.lstat(reservation.path)
        descriptor_info = os.fstat(reservation.descriptor)
    except (OSError, NotImplementedError) as error:
        raise ProfileError(
            f"receipt reservation is no longer stable: {error}"
        ) from error
    if not stat.S_ISDIR(parent_info.st_mode) or not _same_file_identity(
        parent_info,
        reservation.parent_device,
        reservation.parent_inode,
    ):
        raise ProfileError("receipt parent changed after reservation")
    if (
        target_info.st_nlink != 1
        or descriptor_info.st_nlink != 1
        or not stat.S_ISREG(target_info.st_mode)
        or not stat.S_ISREG(descriptor_info.st_mode)
        or not _same_file_identity(
            target_info,
            reservation.device,
            reservation.inode,
        )
        or not _same_file_identity(
            descriptor_info,
            reservation.device,
            reservation.inode,
        )
    ):
        raise ProfileError("receipt target changed or gained a hard-link alias")


def _commit_receipt(reservation: ReceiptReservation, content: bytes) -> None:
    """Commit bytes to the reserved inode without resolving the receipt path again."""

    _validate_receipt_reservation(reservation)
    try:
        os.lseek(reservation.descriptor, 0, os.SEEK_SET)
        os.ftruncate(reservation.descriptor, 0)
        _write_all(reservation.descriptor, content)
        os.fsync(reservation.descriptor)
    except OSError as error:
        raise ProfileError(f"could not commit receipt: {error}") from error
    _validate_receipt_reservation(reservation)


def _unlink_reserved_receipt(path: Path, device: int, inode: int) -> None:
    """Remove a reserved receipt only when the name still holds that object.

    The descriptor must already be closed: Windows refuses to unlink a file
    that is still open, so identity is confirmed against the values recorded
    at reservation time rather than against a live fstat.
    """

    try:
        target_info = os.lstat(path)
        if _same_file_identity(target_info, device, inode):
            os.unlink(path)
    except (FileNotFoundError, NotImplementedError):
        return


def _release_receipt(reservation: ReceiptReservation, *, remove: bool) -> None:
    os.close(reservation.descriptor)
    if remove:
        _unlink_reserved_receipt(
            reservation.path, reservation.device, reservation.inode
        )


def _atomic_write(path: Path, content: bytes, *, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(mode)
        os.replace(temporary, path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _canonical_json(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    ).encode("utf-8")


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _print_json(value: Any) -> None:
    sys.stdout.buffer.write(_canonical_json(value))


if __name__ == "__main__":
    raise SystemExit(main())
