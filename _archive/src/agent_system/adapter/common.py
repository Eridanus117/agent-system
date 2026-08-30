"""Client-agnostic primitives shared by every CAP client adapter.

These moved out of `agent_system.omp.runtime` unchanged. They encode CAP-wide
invariants -- canonical digests, content-addressed tree hashing, and the path
safety rules for the managed state root -- so a second adapter must reuse them
rather than restate them. Anything that depends on one client's native schema
stays in that client's module.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path


class AdapterError(ValueError):
    """Report a fail-closed adapter error."""


def _digest_bytes(payload: bytes) -> str:
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"

def _digest_json(value: object) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return _digest_bytes(payload)

def _assert_managed_path(
    root: Path, candidate: Path, label: str, *, allow_missing: bool = False
) -> Path:
    root = root.expanduser().absolute()
    candidate = candidate.expanduser().absolute()
    try:
        relative = candidate.relative_to(root)
    except ValueError as error:
        raise AdapterError(f"{label} is outside the CAP state root") from error
    if not relative.parts:
        raise AdapterError(f"{label} must not be the CAP state root")
    current = root
    for part in relative.parts:
        current = current / part
        if not current.exists() and not current.is_symlink():
            if allow_missing:
                continue
            raise AdapterError(f"{label} does not exist")
        info = current.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise AdapterError(f"{label} contains a symlink")
    return candidate

def _validate_private_runtime(
    root: Path, label: str, *, private_root: Path
) -> None:
    info = root.stat()
    if not stat.S_ISDIR(info.st_mode):
        raise AdapterError(
            f"{label} must be a directory"
        )
    if hasattr(os, "geteuid"):
        if info.st_uid != os.geteuid():
            raise AdapterError(
                f"{label} must be a current-user directory"
            )
        if stat.S_IMODE(info.st_mode) & 0o077:
            raise AdapterError(
                f"{label} must not grant group or other access"
            )
        return

    # Windows has no geteuid, and POSIX mode bits are a no-op there, so the
    # two checks above cannot run. Substitute the constraints that are
    # enforceable: the directory must stay inside the CAP-managed root, and
    # no component may be a symlink or junction pointing elsewhere.
    # This is a weaker guarantee than the POSIX branch -- it does not read
    # ACLs, so a managed root that grants other principals write access
    # still passes. Tracked in Eridanus117/agent-system#83.
    managed = private_root.expanduser().absolute()
    candidate = root.expanduser().absolute()
    try:
        relative = candidate.relative_to(managed)
    except ValueError as error:
        raise AdapterError(
            f"{label} must stay inside the CAP-managed root"
        ) from error
    current = managed
    for part in relative.parts:
        current = current / part
        entry = current.lstat()
        reparse = getattr(entry, "st_file_attributes", 0) & (
            stat.FILE_ATTRIBUTE_REPARSE_POINT
        )
        if stat.S_ISLNK(entry.st_mode) or reparse:
            raise AdapterError(
                f"{label} contains a symlink or junction"
            )

def _reject_unsafe_tree(root: Path, label: str) -> None:
    for path in [root, *root.rglob("*")]:
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise AdapterError(f"{label} contains a symlink")
        if stat.S_ISREG(info.st_mode) and info.st_nlink != 1:
            raise AdapterError(f"{label} contains a hard-linked file")
        if not stat.S_ISDIR(info.st_mode) and not stat.S_ISREG(info.st_mode):
            raise AdapterError(f"{label} contains a special file")

def _safe_remove_tree(
    root: Path,
    candidate: Path,
    label: str,
    *,
    protected: tuple[Path, ...] = (),
) -> bool:
    if not candidate.exists() and not candidate.is_symlink():
        return False
    _assert_managed_path(root, candidate, label)
    resolved = candidate.expanduser().absolute()
    for guarded in protected:
        guarded = guarded.expanduser().absolute()
        if guarded == resolved or guarded.is_relative_to(resolved):
            # `_assert_managed_path` only rejects escaping the CAP state root;
            # it cannot tell that a legitimate in-root target is an ancestor of
            # live state. Without this check a cleanup entry that names a parent
            # directory silently takes the global render CAS with it.
            raise AdapterError(
                f"{label} would remove preserved state: {guarded}"
            )
    _reject_unsafe_tree(candidate, label)
    shutil.rmtree(candidate)
    return True

def _tree_digest(root: Path, *, exclude: set[str] | None = None) -> str:
    excluded = exclude or set()
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if relative in excluded:
            continue
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise AdapterError("profile generation contains a symlink")
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        if stat.S_ISDIR(info.st_mode):
            digest.update(b"d\0")
        elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
            digest.update(b"f\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
        else:
            raise AdapterError(
                "profile generation contains an unsafe file"
            )
    return f"sha256:{digest.hexdigest()}"

def _deep_overlay(
    base: Mapping[str, object], override: Mapping[str, object]
) -> dict[str, object]:
    merged = dict(base)
    for key, value in override.items():
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = _deep_overlay(existing, value)
        else:
            merged[key] = value
    return merged

def _replace_generation_placeholder(
    value: object, generation: Path
) -> object:
    if isinstance(value, str):
        return value.replace(
            "<PROFILE_GENERATION>", str(generation)
        )
    if isinstance(value, list):
        return [
            _replace_generation_placeholder(item, generation)
            for item in value
        ]
    if isinstance(value, dict):
        return {
            key: _replace_generation_placeholder(item, generation)
            for key, item in value.items()
        }
    return value


def render_portable_tree(
    *,
    command: Sequence[str],
    env: Mapping[str, str],
    output: Path,
    client: str,
) -> tuple[str, tuple[str, ...]]:
    """Run the profile engine's materialize step and read its portable result.

    Returns the portable tree hash and the rendered skill names. The skill names
    come from the tree rather than from the declaration on purpose: they must
    describe what was actually rendered, because that is what the client will be
    handed.
    """

    completed = subprocess.run(
        list(command),
        capture_output=True,
        check=False,
        env=dict(env),
        text=True,
    )
    if completed.returncode != 0:
        print(
            completed.stderr.strip() or completed.stdout.strip(),
            file=sys.stderr,
        )
        raise SystemExit(completed.returncode)
    try:
        portable_hash = json.loads(completed.stdout)["tree_hash"]
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        raise AdapterError(
            f"{client} materialize output has no tree_hash"
        ) from error
    if not isinstance(portable_hash, str):
        raise AdapterError(f"{client} materialize tree_hash must be a string")

    skills_root = output / "skills"
    skill_names = (
        tuple(
            sorted(
                path.name
                for path in skills_root.iterdir()
                if path.is_dir() and not path.is_symlink()
            )
        )
        if skills_root.is_dir()
        else ()
    )
    return portable_hash, skill_names


def generation_source_context(
    *,
    profile: str,
    client: str,
    project: Path,
    binding_dir: Path,
    portable_hash: str,
) -> tuple[dict[str, object], str]:
    """Bind one generation to the project lock and the approved machine context.

    `adapter_version` is read per client, so bumping one adapter cannot quietly
    invalidate another client's cached generations.
    """

    binding_path = binding_dir.expanduser() / f"{profile}.binding.json"
    lock_path = project.expanduser() / ".cap" / "lock.json"
    try:
        binding = json.loads(binding_path.read_text(encoding="utf-8"))
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        adapter_version = lock["clients"][client]["adapter_version"]
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise AdapterError(
            "current project binding/lock context is invalid"
        ) from error
    context = {
        "profile": profile,
        "layer_digest": binding.get("layer_digest"),
        "effective_digest": binding.get("effective_digest"),
        "portable_tree_hash": portable_hash,
        "adapter_version": adapter_version,
    }
    if not all(
        isinstance(context[key], (str, int))
        for key in (
            "layer_digest",
            "effective_digest",
            "portable_tree_hash",
            "adapter_version",
        )
    ):
        raise AdapterError(
            "current project binding/adapter context is incomplete"
        )
    return context, _digest_json(context)


GENERATION_MANIFEST_NAME = ".cap-generation.json"


def verify_generation(
    generation: Path, expected: Mapping[str, object]
) -> dict[str, object]:
    """Re-check one cached generation before it is used.

    Two separate failures are distinguished on purpose. Metadata drift means the
    generation was built for different inputs than the ones in hand; content
    drift means the directory was edited after it was built. Both are fatal, but
    only the second implies tampering with an already-verified render.
    """

    manifest = generation / GENERATION_MANIFEST_NAME
    try:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise AdapterError("profile generation manifest is invalid") from error
    for key, value in expected.items():
        if payload.get(key) != value:
            raise AdapterError("profile generation metadata drifted")
    content_digest = _tree_digest(
        generation, exclude={GENERATION_MANIFEST_NAME}
    )
    if payload.get("content_digest") != content_digest:
        raise AdapterError("profile generation content drifted")
    return payload


def materialize_generation(
    *,
    parent: Path,
    generation: Path,
    source_tree: Path,
    state_root: Path,
    private_root: Path,
    write_payload: Callable[[Path], None],
    manifest_base: Mapping[str, object],
    verify: Callable[[Path], object],
) -> Path:
    """Place one content-addressed generation, or reuse an identical one.

    The write is staged and promoted with a single rename so a crash can never
    leave a half-built generation that later looks cached. A losing race is not
    an error: the winner's directory is verified instead, which is the same
    check the cache-hit path performs.
    """

    if generation.exists():
        verify(generation)
        return generation

    for private in (state_root, parent):
        private.mkdir(parents=True, exist_ok=True, mode=0o700)
        private.chmod(0o700)
        _validate_private_runtime(
            private,
            "global CAP render directory",
            private_root=private_root,
        )
    _assert_managed_path(private_root, parent, "global render CAS")

    stage = parent / f".stage-{os.getpid()}-{time.time_ns()}"
    try:
        shutil.copytree(source_tree, stage)
        write_payload(stage)
        # Computed before the manifest exists, which is why the verifier
        # excludes the manifest rather than including it.
        content_digest = _tree_digest(stage)
        manifest = {**dict(manifest_base), "content_digest": content_digest}
        (stage / GENERATION_MANIFEST_NAME).write_text(
            json.dumps(manifest, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        try:
            os.rename(stage, generation)
        except OSError:
            if not generation.exists():
                raise
            shutil.rmtree(stage)
            verify(generation)
    except BaseException:
        if stage.exists():
            shutil.rmtree(stage)
        raise
    return generation
