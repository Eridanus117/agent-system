from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest
from agent_system.omp import runtime
from agent_system.profile import cli as profile_cli


def _args(project: Path, home: Path) -> argparse.Namespace:
    return argparse.Namespace(
        project=str(project),
        agent_home_root=str(home / "state"),
        _real_home=home,
    )


def test_shared_preference_projects_only_allowlisted_fields(tmp_path: Path) -> None:
    (tmp_path / ".cap" / "runtime").mkdir(parents=True)
    (tmp_path / ".cap" / "runtime" / "omp.toml").write_text(
        'version = 1\nclient = "omp"\n\n[policy]\n'
        'memory_backend = "off"\n'
        'enable_project_mcp = false\n'
        'future_field = "untouched"\n',
        encoding="utf-8",
    )
    preference = tmp_path / ".omp" / "agent"
    preference.mkdir(parents=True)
    (preference / "config.yml").write_text(
        "modelRoles:\n"
        "  default: openai-codex/gpt-5.6-terra\n"
        "extendedContext: false\n"
        "advisor:\n"
        "  enabled: true\n"
        "mcp:\n"
        "  enableProjectConfig: true\n"
        "skills:\n"
        "  enablePiUser: true\n"
        "worktree:\n"
        "  base: C:/unsafe\n",
        encoding="utf-8",
    )
    args = _args(tmp_path, tmp_path)
    policy = runtime._read_omp_runtime_policy(args)
    preference_value = runtime._read_global_omp_preference(args)
    rendered = runtime._effective_config_template({}, [], policy, preference_value)
    assert preference_value == {
        "advisor": {"enabled": True},
        "extendedContext": False,
        "modelRoles": {"default": "openai-codex/gpt-5.6-terra"},
    }
    assert policy["future_field"] == "untouched"
    assert rendered["modelRoles"]["default"] == "openai-codex/gpt-5.6-terra"
    assert rendered["extendedContext"] is False
    assert rendered["advisor"]["enabled"] is True
    assert rendered["memory"]["backend"] == "off"
    assert rendered["mcp"]["enableProjectConfig"] is False
    assert rendered["skills"]["enablePiUser"] is False
    assert "worktree" not in rendered


def test_project_policy_overrides_unsafe_global_preference(
    tmp_path: Path,
) -> None:
    rendered = runtime._effective_config_template(
        {}, [],
        {"memory_backend": "off", "enable_project_mcp": False},
        {"theme": {"dark": "titanium"}},
    )
    assert rendered["memory"]["backend"] == "off"
    assert rendered["theme"]["dark"] == "titanium"


def test_shared_broker_auth_uses_token_file_without_serializing_secret(
    tmp_path: Path,
) -> None:
    preference = tmp_path / ".omp" / "agent"
    preference.mkdir(parents=True)
    (preference / "config.yml").write_text(
        "auth:\n"
        "  broker:\n"
        "    url: http://127.0.0.1:8765\n",
        encoding="utf-8",
    )
    (preference / "auth-broker.token").write_text(
        "secret-token\n", encoding="utf-8"
    )
    auth, state = runtime._shared_omp_auth(_args(tmp_path, tmp_path))
    assert auth == {
        "OMP_AUTH_BROKER_URL": "http://127.0.0.1:8765",
        "OMP_AUTH_BROKER_TOKEN": "secret-token",
    }
    assert state["configured"] is True
    assert "secret-token" not in json.dumps(state)


def test_shared_broker_auth_rejects_unapproved_http_endpoint(
    tmp_path: Path,
) -> None:
    preference = tmp_path / ".omp" / "agent"
    preference.mkdir(parents=True)
    (preference / "config.yml").write_text(
        "auth:\n"
        "  broker:\n"
        "    url: http://broker.example.test\n"
        "    token: secret-token\n",
        encoding="utf-8",
    )
    with pytest.raises(runtime._MigrationError, match="https or loopback"):
        runtime._shared_omp_auth(_args(tmp_path, tmp_path))


def test_shared_provider_endpoint_is_redacted_in_state() -> None:
    endpoints, state = runtime._shared_provider_endpoints(
        {"OPENAI_BASE_URL": "https://gateway.example.test/v1"}
    )
    assert endpoints == {"OPENAI_BASE_URL": "https://gateway.example.test/v1"}
    assert state["names"] == ["OPENAI_BASE_URL"]
    assert "gateway.example.test" not in json.dumps(state)


def test_shared_provider_endpoint_rejects_query_credentials() -> None:
    with pytest.raises(runtime._MigrationError, match="credential-free"):
        runtime._shared_provider_endpoints(
            {"OPENAI_BASE_URL": "https://gateway.example.test/v1?key=secret"}
        )


def test_profiles_share_omp_runtime_and_native_resume_root(tmp_path: Path) -> None:
    general = _args(tmp_path, tmp_path)
    general.profile = "general"
    assembler = _args(tmp_path, tmp_path)
    assembler.profile = "agent-assembler"
    (tmp_path / "system-prompt.md").write_text("prompt", encoding="utf-8")
    assert runtime._agent_home_dir(general) == runtime._agent_home_dir(assembler)
    command = runtime._omp_command(
        tmp_path, ["example-skill"], ["--resume", "session-id"]
    )
    assert "--session-dir" not in command
    assert command[-2:] == ["--resume", "session-id"]


def test_cap_environment_replaces_ambient_credentials_with_shared_broker(
    tmp_path: Path,
) -> None:
    home = tmp_path / "home"
    agent_home = home / ".agent-system-state" / "runtimes" / "omp" / "default"
    env = runtime._agent_home_env(
        {"OPENAI_API_KEY": "ambient-secret", "OMP_AUTH_BROKER_TOKEN": "old"},
        agent_home,
        tmp_path,
        home,
        {
            "OMP_AUTH_BROKER_URL": "http://127.0.0.1:8765",
            "OMP_AUTH_BROKER_TOKEN": "shared-secret",
        },
    )
    assert env["OPENAI_API_KEY"] == ""
    assert env["OMP_AUTH_BROKER_TOKEN"] == "shared-secret"

def test_external_import_requires_approved_profile_and_digest() -> None:
    project = type(
        "Project",
        (),
        {
            "external_imports": (
                {
                    "name": "review-skill",
                    "source": "user-home",
                    "digest": "sha256:asset",
                    "approved": True,
                    "profiles": ("agent-assembler",),
                },
            )
        },
    )()
    profile = type("Profile", (), {"name": "agent-assembler"})()
    inventory = {
        "capability_entries": [
            {
                "digest": "sha256:asset",
                "capabilities": {"skills": ["review-skill"]},
            }
        ],
        "instruction_entries": [],
    }
    assert profile_cli._validate_external_imports(
        project, profile, inventory
    ) == ("review-skill",)

    general = type("Profile", (), {"name": "general"})()
    assert profile_cli._validate_external_imports(
        project, general, inventory
    ) == ()

@pytest.mark.parametrize(
    ("approved", "digest", "message"),
    (
        (False, "sha256:asset", "not approved"),
        (True, "sha256:other", "does not match"),
    ),
)
def test_external_import_rejects_unapproved_or_mismatched_assets(
    approved: bool, digest: str, message: str
) -> None:
    project = type(
        "Project",
        (),
        {
            "external_imports": (
                {
                    "name": "review-skill",
                    "source": "user-home",
                    "digest": digest,
                    "approved": approved,
                    "profiles": ("agent-assembler",),
                },
            )
        },
    )()
    profile = type("Profile", (), {"name": "agent-assembler"})()
    inventory = {
        "capability_entries": [
            {
                "digest": "sha256:asset",
                "capabilities": {"skills": ["review-skill"]},
            }
        ],
        "instruction_entries": [],
    }
    with pytest.raises(profile_cli.ProfileError, match=message):
        profile_cli._validate_external_imports(project, profile, inventory)

def test_generation_rejects_runtime_policy_metadata_drift(tmp_path: Path) -> None:
    generation = tmp_path / "generation"
    generation.mkdir()
    (generation / "config.yml").write_text("memory: {}\n", encoding="utf-8")
    policy = {"effective": {"memory_backend": "off"}}
    manifest = {
        "version": 2,
        "profile": "general",
        "portable_tree_hash": "sha256:portable",
        "effective_render_hash": "sha256:render",
        "source_context": {"profile": "general"},
        "source_digest": "sha256:source",
        "runtime_policy": {"effective": {"memory_backend": "sqlite"}},
        "content_digest": runtime._tree_digest(
            generation, exclude={".cap-generation.json"}
        ),
    }
    (generation / ".cap-generation.json").write_text(
        json.dumps(manifest), encoding="utf-8"
    )
    with pytest.raises(runtime._MigrationError, match="metadata drifted"):
        runtime._verify_profile_generation(
            generation,
            "general",
            "sha256:portable",
            "sha256:render",
            {"profile": "general"},
            "sha256:source",
            policy,
        )
