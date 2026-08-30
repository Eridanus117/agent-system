"""Launch Claude against a verified generation.

The generation is referenced read-only: skills, MCP servers, settings and the
system prompt are all passed as command-line flags pointing into the
content-addressed store. Only credentials and session state live somewhere
writable, and that place is CAP's own runtime namespace -- never the user's own
Claude configuration directory, which this adapter neither reads, writes nor
migrates.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
from collections.abc import Mapping
from pathlib import Path

from agent_system.adapter.common import (
    _assert_managed_path,
    _tree_digest,
    _validate_private_runtime,
)
from agent_system.cap.config import AMBIENT_CONFIG_ENV
from agent_system.cap.support import _run_path, _workdir
from agent_system.claude import native
from agent_system.claude.generation import (
    claude_runtime_dir,
    claude_runtime_id,
    claude_state_root,
    materialize_claude_generation,
)
from agent_system.claude.runtime import ClaudeError

# Provider credentials that would otherwise let the surrounding shell decide who
# the client authenticates as. Under `subscription` they are blanked so the CAP
# runtime's own login is the single source. Under `bare` the client reads only
# ANTHROPIC_API_KEY or an apiKeyHelper, so that one name is left alone -- taking
# it away would leave no way to authenticate at all.
CLAUDE_AMBIENT_AUTH_ENV = frozenset(
    {
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_CUSTOM_HEADERS",
        "ANTHROPIC_MODEL",
        "ANTHROPIC_SEARCH_BASE_URL",
        "AWS_BEARER_TOKEN_BEDROCK",
        "CLAUDE_CODE_CLIENT_CERT",
        "CLAUDE_CODE_CLIENT_KEY",
        "CLAUDE_CODE_USE_BEDROCK",
        "CLAUDE_CODE_USE_FOUNDRY",
        "CLAUDE_CODE_USE_VERTEX",
    }
)

BARE_MODE_KEPT_ENV = frozenset({"ANTHROPIC_API_KEY"})

# Set by the client itself; leaving an inherited value in place would point the
# run at a configuration directory CAP did not build.
CLAUDE_AMBIENT_CONFIG_ENV = frozenset({"CLAUDE_CONFIG_DIR"})

RUNTIME_MARKER = ".cap-claude-runtime.json"


def require_claude_runtime_ready(args: argparse.Namespace) -> Path:
    """Ensure CAP's own Claude runtime namespace exists and is private.

    This directory holds credentials and session state. It is deliberately not
    the user's `~/.claude`: CAP never reads or migrates that, so the first run
    under CAP asks for its own login and everything afterwards is CAP's.
    """

    runtime_dir = claude_runtime_dir(args)
    real_home = Path(
        getattr(args, "_real_home", getattr(args, "home", Path.home()))
    ).expanduser().absolute()
    for private in (claude_state_root(args), runtime_dir.parent, runtime_dir):
        private.mkdir(parents=True, exist_ok=True, mode=0o700)
        private.chmod(0o700)
        _validate_private_runtime(
            private, "Claude runtime directory", private_root=real_home
        )
    _assert_managed_path(real_home, runtime_dir, "Claude runtime directory")
    marker = runtime_dir / RUNTIME_MARKER
    if not marker.is_file():
        marker.write_text(
            '{"version": 1, "client": "claude"}\n', encoding="utf-8"
        )
        marker.chmod(0o600)
    return runtime_dir


def claude_env(
    base_env: Mapping[str, str],
    runtime_dir: Path,
    real_home: Path,
    login_mode: str,
) -> dict[str, str]:
    """Build the launch environment for one Claude run."""

    env = dict(base_env)
    for name in AMBIENT_CONFIG_ENV | CLAUDE_AMBIENT_CONFIG_ENV:
        env.pop(name, None)
    kept = BARE_MODE_KEPT_ENV if login_mode == "bare" else frozenset()
    for name in CLAUDE_AMBIENT_AUTH_ENV - kept:
        if name in env:
            env[name] = ""
    # The host context stays real so Git, SSH and language toolchains keep
    # working; only the Agent-facing configuration is redirected.
    env["HOME"] = str(real_home)
    env["CLAUDE_CONFIG_DIR"] = str(runtime_dir)
    return env


def claude_command(
    generation: Path,
    skill_names: tuple[str, ...],
    login_mode: str,
    forwarded: list[str],
) -> list[str]:
    """Build the argv that points Claude at one verified generation."""

    executable = shutil.which("claude") or "claude"
    prompt_path = generation / "system-prompt.md"
    prompt = prompt_path.read_text(encoding="utf-8").strip() + "\n"

    argv = [executable]
    if login_mode == "bare":
        argv.append("--bare")
    argv += [
        "--settings",
        str(generation / native.SETTINGS_PATH),
        # Empty on purpose: user, project and local setting sources are all off.
        "--setting-sources",
        "",
        "--mcp-config",
        str(generation / native.MCP_PATH),
        "--strict-mcp-config",
        "--append-system-prompt",
        prompt,
    ]
    if skill_names:
        argv += ["--plugin-dir", str(generation / native.PLUGIN_ROOT)]
    return [*argv, *forwarded]


def run_claude(
    args: argparse.Namespace,
    env: dict[str, str],
    forwarded: list[str],
    *,
    runner=subprocess.run,
) -> tuple[int, Path, Path, dict[str, object]]:
    """Verify, launch, then re-check that the generation was not written to."""

    runtime_dir = require_claude_runtime_ready(args)
    generation, portable_hash, effective_hash, skill_names = (
        materialize_claude_generation(args, env)
    )
    login_mode = _generation_login_mode(generation)

    real_home = Path(
        getattr(args, "_real_home", getattr(args, "home", Path.home()))
    ).expanduser().absolute()
    completed = runner(
        claude_command(generation, skill_names, login_mode, forwarded),
        cwd=str(_workdir(args)),
        env=claude_env(env, runtime_dir, real_home, login_mode),
        check=False,
    )

    # The generation must still verify after the run: a read-only reference is
    # the whole reason no hydration step exists. A failure here means the client
    # wrote into the store, which would invalidate the read-only claim.
    materialize_claude_generation(args, env)
    post_run_content_digest = _tree_digest(
        generation, exclude={".cap-generation.json"}
    )

    receipt_path = (
        Path(args.receipt).expanduser()
        if getattr(args, "receipt", None)
        else Path(_run_path(args, "receipt.json"))
    )
    payload = write_claude_receipt(
        args,
        receipt_path,
        return_code=completed.returncode,
        generation=generation,
        runtime_dir=runtime_dir,
        portable_hash=portable_hash,
        effective_hash=effective_hash,
        post_run_content_digest=post_run_content_digest,
        forwarded=forwarded,
    )
    return completed.returncode, generation, receipt_path, payload


# Dimensions whose real state this adapter cannot establish. They are listed
# here rather than computed so that "we did not check" can never be mistaken for
# "we checked and it was clean".
CLIENT_LIMITED_DIMENSIONS = ("hooks", "plugins", "bundled_skills")


def effective_observations(login_mode: str) -> dict[str, str]:
    """Classify what one run can and cannot establish about the live client.

    `mcps` is pinned to `reported_client_limited` under `subscription`: the
    account-level claude.ai connectors load regardless of `--strict-mcp-config`,
    which was reproduced twice against a real client. No code path may raise
    this to `observed`, because the closure genuinely is not closed there.
    """

    observations = {
        "skills": "unknown",
        "context": "unknown",
        "managed_settings": "unknown",
    }
    for name in CLIENT_LIMITED_DIMENSIONS:
        observations[name] = "reported_client_limited"
    observations["mcps"] = (
        "unknown" if login_mode == "bare" else "reported_client_limited"
    )
    return observations


def write_claude_receipt(
    args: argparse.Namespace,
    receipt: Path,
    *,
    return_code: int,
    generation: Path,
    runtime_dir: Path,
    portable_hash: str,
    effective_hash: str,
    post_run_content_digest: str,
    forwarded: list[str],
) -> dict[str, object]:
    """Record what ran, at the evidence level the run actually supports.

    Only digests, paths, states and counts: never a token, a session body, or
    the value of a forwarded argument.
    """

    import json

    manifest = json.loads(
        (generation / ".cap-generation.json").read_text(encoding="utf-8")
    )
    binding_path = (
        Path(args.binding_dir).expanduser() / f"{args.profile}.binding.json"
    )
    binding = json.loads(binding_path.read_text(encoding="utf-8"))
    login_mode = str(manifest["login_mode"])

    payload: dict[str, object] = {
        "version": 1,
        "client": "claude",
        "profile": args.profile,
        "runtime_id": claude_runtime_id(args),
        "global_runtime_root": str(runtime_dir),
        "global_generation": str(generation),
        "login_mode": login_mode,
        "project_root": str(Path(args.project).expanduser().absolute()),
        "project_source_context": manifest["source_context"],
        "project_source_digest": manifest["source_digest"],
        "runtime_policy": manifest.get("runtime_policy", {}),
        "native_projection": manifest.get("native_projection", {}),
        "base_digest": binding.get(
            "base_digest", binding.get("machine_context_digest")
        ),
        "layer_digest": binding.get("layer_digest"),
        "effective_digest": binding.get("effective_digest"),
        "portable_tree_hash": portable_hash,
        "effective_render_hash": effective_hash,
        "post_run_content_digest": post_run_content_digest,
        "skills": list(manifest.get("skills", ())),
        "workdir": str(_workdir(args)),
        "exit_code": return_code,
        "forwarded_argument_count": len(forwarded),
        "evidence": {
            "declared": "ok",
            "configured": "generation-verified",
            # A generation that verifies says nothing about what the client
            # then loaded; only a probe could, and this adapter has none.
            "effective": "unknown",
        },
        "effective_observations": effective_observations(login_mode),
    }
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + chr(10),
        encoding="utf-8",
    )
    return payload


def _generation_login_mode(generation: Path) -> str:
    import json

    payload = json.loads(
        (generation / ".cap-generation.json").read_text(encoding="utf-8")
    )
    mode = payload.get("login_mode")
    if mode not in {"subscription", "bare"}:
        raise ClaudeError("Claude generation has no usable login_mode")
    return str(mode)

