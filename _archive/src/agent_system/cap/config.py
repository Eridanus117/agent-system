"""Stable CAP project configuration and ambient capability gates."""

from __future__ import annotations

import os
import re
from pathlib import Path

from agent_system.profile import cli as profile_cli


def _is_project_root(path: Path) -> bool:
    return (path / ".cap" / "manifest.toml").is_file() and (path / "AGENTS.md").is_file()


def _default_project() -> Path:
    configured = os.environ.get("AGENT_SYSTEM_PROJECT")
    if configured:
        return Path(configured).expanduser().resolve()

    canonical = Path.home() / "work" / "agent-system"
    source_project = Path(__file__).resolve().parents[3]
    for candidate in (canonical, source_project):
        if _is_project_root(candidate):
            return candidate
    return canonical


DEFAULT_PROJECT = _default_project()

def _default_profile_tool() -> Path:
    configured = os.environ.get("AGENT_SYSTEM_PROFILE_TOOL")
    return Path(configured).expanduser() if configured else Path(profile_cli.__file__).resolve()

DEFAULT_PROFILE_TOOL = _default_profile_tool()
DEFAULT_REAL_HOME = Path.home()
DEFAULT_AGENT_STATE_ROOT = DEFAULT_REAL_HOME / ".agent-system-state"
DEFAULT_MACHINE_CONTEXT_MANIFEST = (
    DEFAULT_AGENT_STATE_ROOT / "machine-context" / "manifest.json"
)
DEFAULT_MACHINE_CONTEXT_PIN = (
    DEFAULT_AGENT_STATE_ROOT / "machine-context" / "pin.json"
)
DEFAULT_ASSEMBLY_BINDING_DIR = DEFAULT_AGENT_STATE_ROOT / "bindings"
DEFAULT_AUTH_ROOT = DEFAULT_PROJECT.with_name(f"{DEFAULT_PROJECT.name}.auth")
DEFAULT_PROFILE = "general"
RUNNABLE_PROFILES = ("general", "agent-assembler")
CLIENTS = ("codex", "qoder", "omp", "claude")
DEFAULT_CLI = "omp"
DEFAULT_OMP_RUNTIME_ID = "default"
SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CAPABILITY_KINDS = ("skills", "mcp", "hooks", "plugins")

AMBIENT_CONFIG_ENV = {
    "CODEX_HOME",
    "OMP_PROFILE",
    "PI_CODING_AGENT_DIR",
    "PI_CONFIG_DIR",
    "PI_CONFIG_FILES",
    "PI_PROFILE",
    "QODER_CONFIG_DIR",
    "QODER_WORKING_DIR",
}

OMP_AMBIENT_AUTH_ENV = {
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_CUSTOM_HEADERS",
    "ANTHROPIC_SEARCH_BASE_URL",
    "AWS_CONFIG_FILE",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "AWS_EC2_METADATA_DISABLED",
    "AWS_EC2_METADATA_SERVICE_ENDPOINT",
    "AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE",
    "AWS_PROFILE",
    "AWS_ROLE_ARN",
    "AWS_ROLE_SESSION_NAME",
    "AWS_SHARED_CREDENTIALS_FILE",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_DEPLOYMENT_NAME_MAP",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_RESOURCE_NAME",
    "CLAUDE_CODE_CLIENT_CERT",
    "CLAUDE_CODE_CLIENT_KEY",
    "CLAUDE_CODE_USE_FOUNDRY",
    "CLOUDSDK_CONFIG",
    "COPILOT_GITHUB_TOKEN",
    "FOUNDRY_BASE_URL",
    "FUGU_BASE_URL",
    "GCLOUD_PROJECT",
    "GCP_PROJECT",
    "GITLAB_TOKEN",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CLOUD_LOCATION",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_PROJECT_ID",
    "GOOGLE_VERTEX_LOCATION",
    "HF_TOKEN",
    "KIMI_CODE_BASE_URL",
    "KIMI_CODE_OAUTH_HOST",
    "KIMI_OAUTH_HOST",
    "LITELLM_BASE_URL",
    "LLAMA_CPP_BASE_URL",
    "LM_STUDIO_BASE_URL",
    "MOONSHOT_BASE_URL",
    "NODE_EXTRA_CA_CERTS",
    "OLLAMA_BASE_URL",
    "OLLAMA_HOST",
    "OMP_AUTH_BROKER_TOKEN",
    "OMP_AUTH_BROKER_URL",
    "OPENAI_BASE_URL",
    "PERPLEXITY_COOKIES",
    "SAKANA_BASE_URL",
    "UMANS_WEBSEARCH_PROVIDER",
    "VERTEX_LOCATION",
}
OMP_AMBIENT_CREDENTIAL_SUFFIXES = (
    "_API_KEY",
    "_ACCESS_TOKEN",
    "_OAUTH_TOKEN",
    "_BEARER_TOKEN",
    "_HUB_TOKEN",
    "_SECRET_ACCESS_KEY",
    "_SESSION_TOKEN",
)

OMP_AMBIENT_MCP_DENYLIST = ("codegraph",)

def _is_ambient_credential_name(name: str) -> bool:
    return name.endswith(OMP_AMBIENT_CREDENTIAL_SUFFIXES)
