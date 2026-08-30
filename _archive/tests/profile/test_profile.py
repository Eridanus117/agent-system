from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import tomllib
from agent_system.profile import cli as profile

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "multi-profile"

def copy_fixture(target: Path) -> Path:
    shutil.copytree(FIXTURE, target)
    (target / "CONTEXT.md").replace(target / "AGENTS.md")
    return target

def configure_skill_import(project: Path, name: str, source: str) -> None:
    manifest_path = project / ".cap" / "manifest.toml"
    manifest = manifest_path.read_text(encoding="utf-8")
    updated_manifest = manifest.replace(
        'defaults = ".cap/project-defaults.toml"\n',
        'defaults = ".cap/project-defaults.toml"\n'
        'skill_imports = ".cap/skill-imports.toml"\n',
        1,
    )
    if updated_manifest == manifest:
        raise AssertionError("fixture manifest defaults declaration changed")
    manifest_path.write_text(updated_manifest, encoding="utf-8")
    (project / ".cap" / "skill-imports.toml").write_text(
        f'version = 1\n\n[[imports]]\nname = "{name}"\nsource = "{source}"\n',
        encoding="utf-8",
    )
    profile_path = project / ".cap" / "profiles" / "review.toml"
    profile_text = profile_path.read_text(encoding="utf-8")
    updated_profile = profile_text.replace(
        'allow = ["review-skill"]',
        f'allow = ["review-skill", "{name}"]',
        1,
    )
    if updated_profile == profile_text:
        raise AssertionError("fixture review Skill declaration changed")
    profile_path.write_text(updated_profile, encoding="utf-8")


class ProfileTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.project = self.root / "project"
        copy_fixture(self.project)
        self.home = self.root / "home"
        self.home.mkdir()
        self.home_patch = mock.patch.dict(os.environ, {"HOME": str(self.home)})
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)
        self.auth_root = self.root / "auth"
        self.auth_root.mkdir(mode=0o700)
        codex_auth = self.auth_root / "codex"
        codex_auth.mkdir(mode=0o700)
        (codex_auth / "auth.json").write_text(
            '{"auth_mode":"chatgpt","tokens":{"access_token":"test"}}',
            encoding="utf-8",
        )
        qoder_auth = self.auth_root / "qoder" / ".auth"
        qoder_auth.mkdir(parents=True, mode=0o700)
        (qoder_auth / "user").write_text('{"id":"test"}', encoding="utf-8")
        omp_auth = self.auth_root / "omp"
        omp_auth.mkdir(mode=0o700)
        (omp_auth / "broker.json").write_text(
            '{"version":1,"url":"http://127.0.0.1:43129"}',
            encoding="utf-8",
        )
        (omp_auth / "token").write_text("test-broker-token", encoding="utf-8")
        for credential in self.auth_root.rglob("*"):
            credential.chmod(0o700 if credential.is_dir() else 0o600)

        self.machine_context_manifest = self.root / "machine-context.json"
        self.machine_context_pin = self.root / "machine-context.pin.json"
        self.binding_dir = self.root / "bindings"
        profile.create_base_manifest(
            self.home, self.machine_context_manifest
        )
        profile.approve_base_manifest(
            self.machine_context_manifest, self.machine_context_pin
        )
        for profile_name in ("review", "implementation"):
            profile.bind_profile(
                self.project,
                profile_name,
                self.machine_context_manifest,
                self.machine_context_pin,
                self.binding_dir,
            )
    def _machine_context_kwargs(self) -> dict[str, Path]:
        return {
            "base_manifest": self.machine_context_manifest,
            "base_pin": self.machine_context_pin,
            "binding_dir": self.binding_dir,
        }

    def materialize_profile(self, *args: object, **kwargs: object) -> str:
        options = self._machine_context_kwargs()
        options.update(kwargs)
        return profile.materialize_profile(*args, **options)

    def verify_project(self, *args: object, **kwargs: object) -> dict[str, object]:
        options = self._machine_context_kwargs()
        options.update(kwargs)
        return profile.verify_project(*args, **options)

    def probe_profile(self, *args: object, **kwargs: object) -> dict[str, object]:
        options = self._machine_context_kwargs()
        options.update(kwargs)
        return profile.probe_profile(*args, **options)

    def run_client(self, *args: object, **kwargs: object) -> int:
        options = self._machine_context_kwargs()
        options.update(kwargs)
        return profile.run_client(*args, **options)

    def run_observed(self, *args: object, **kwargs: object) -> int:
        options = self._machine_context_kwargs()
        options.update(kwargs)
        return profile.run_observed(*args, **options)

    def diff_profile(self, *args: object, **kwargs: object) -> int:
        options = self._machine_context_kwargs()
        options.update(kwargs)
        return profile.diff_profile(*args, **options)
    def output_directory(self, name: str) -> Path:
        """Create and return one empty render output directory."""

        output = self.root / name
        output.mkdir()
        return output


class MaterializationTests(ProfileTestCase):
    def test_renders_both_profiles_for_all_clients_without_cross_profile_capabilities(
        self,
    ) -> None:
        for profile_name in ("review", "implementation"):
            other = "implementation" if profile_name == "review" else "review"
            for client in profile.CLIENTS:
                with self.subTest(profile=profile_name, client=client):
                    output = self.output_directory(f"{profile_name}-{client}")
                    tree_hash = self.materialize_profile(self.project, client, profile_name, output)
                    self.assertTrue(tree_hash.startswith("sha256:"))
                    rendered = "\n".join(
                        path.relative_to(output).as_posix()
                        + "\n"
                        + path.read_text(encoding="utf-8")
                        for path in sorted(output.rglob("*"))
                        if path.is_file()
                    )
                    self.assertIn(f"{profile_name}-skill-sentinel", rendered)
                    self.assertIn(f"{profile_name}-mcp-sentinel", rendered)
                    self.assertIn(f"{profile_name}-hook-{client}-sentinel", rendered)
                    self.assertIn(f"{profile_name}-plugin-{client}-sentinel", rendered)
                    self.assertNotIn(f"{other}-skill", rendered)
                    self.assertNotIn(f"{other}-mcp", rendered)
                    self.assertNotIn(f"{other}-hook", rendered)
                    self.assertNotIn(f"{other}-plugin", rendered)

    def test_project_skill_import_is_locked_explained_and_rendered_from_one_source(
        self,
    ) -> None:
        source = self.project / "plugins" / "sample" / "skills" / "imported-skill"
        source.mkdir(parents=True)
        skill_file = source / "SKILL.md"
        skill_file.write_text(
            "---\nname: imported-skill\n"
            "description: Imported fixture Skill.\n---\n\n"
            "imported-skill-sentinel\n",
            encoding="utf-8",
        )
        configure_skill_import(
            self.project,
            "imported-skill",
            "plugins/sample/skills/imported-skill",
        )
        profile.create_lock(self.project)
        profile.bind_profile(
            self.project,
            "review",
            self.machine_context_manifest,
            self.machine_context_pin,
            self.binding_dir,
        )

        explanation = profile.explain_profile(self.project, "review")
        self.assertEqual(
            explanation["skill_imports"],
            [
                {
                    "name": "imported-skill",
                    "source": "plugins/sample/skills/imported-skill",
                }
            ],
        )
        locked = json.loads(
            (self.project / ".cap" / "lock.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            locked["project_skill_imports"],
            [
                {
                    "name": "imported-skill",
                    "source": "plugins/sample/skills/imported-skill",
                }
            ],
        )
        self.assertIn(
            "plugins/sample/skills/imported-skill/SKILL.md",
            locked["inputs"],
        )
        self.assertIn(".cap/project-defaults.toml", locked["inputs"])
        self.assertIn(".cap/runtime/omp.toml", locked["inputs"])

        output = self.output_directory("imported-skill-render")
        self.materialize_profile(self.project, "omp", "review", output)
        rendered_skill = output / "skills" / "imported-skill" / "SKILL.md"
        self.assertIn(
            "imported-skill-sentinel",
            rendered_skill.read_text(encoding="utf-8"),
        )
        self.assertFalse(
            (
                self.project / ".cap" / "capabilities" / "skills" / "imported-skill"
            ).exists()
        )

        with skill_file.open("a", encoding="utf-8") as stream:
            stream.write("changed\n")
        with self.assertRaisesRegex(profile.ProfileError, "lock drift"):
            self.verify_project(self.project)

    def test_project_skill_import_rejects_escape_and_symlink_sources(self) -> None:
        external = self.root / "external" / "imported-skill"
        external.mkdir(parents=True)
        (external / "SKILL.md").write_text(
            "---\nname: imported-skill\ndescription: Imported fixture Skill.\n---\n",
            encoding="utf-8",
        )

        escaped = self.root / "escaped-import"
        copy_fixture(escaped)
        configure_skill_import(escaped, "imported-skill", "../external/imported-skill")
        with self.assertRaisesRegex(
            profile.ProfileError, "normalized POSIX relative path"
        ):
            profile.load_project(escaped)

        linked = self.root / "linked-import"
        copy_fixture(linked)
        link = linked / "plugins" / "sample" / "skills" / "imported-skill"
        link.parent.mkdir(parents=True)
        link.symlink_to(external, target_is_directory=True)
        configure_skill_import(
            linked,
            "imported-skill",
            "plugins/sample/skills/imported-skill",
        )
        with self.assertRaisesRegex(
            profile.ProfileError, "must not traverse a symlink"
        ):
            profile.load_project(linked)

    def test_renders_native_mcp_shapes_and_fixed_environment_values(self) -> None:
        codex = self.output_directory("codex")
        qoder = self.output_directory("qoder")
        omp = self.output_directory("omp")
        self.materialize_profile(self.project, "codex", "review", codex)
        self.materialize_profile(self.project, "qoder", "review", qoder)
        self.materialize_profile(self.project, "omp", "review", omp)

        codex_config = tomllib.loads(
            (codex / "config.toml").read_text(encoding="utf-8")
        )
        codex_server = codex_config["mcp_servers"]["review-mcp"]
        self.assertTrue(codex_server["required"])
        self.assertEqual(codex_server["env"], {"CAPRUN_SENTINEL": "review-mcp"})

        qoder_config = json.loads((qoder / "mcp.json").read_text(encoding="utf-8"))
        self.assertEqual(
            qoder_config["mcpServers"]["review-mcp"]["env"],
            {"CAPRUN_SENTINEL": "review-mcp"},
        )
        omp_config = json.loads((omp / "mcp.json").read_text(encoding="utf-8"))

        self.assertEqual(omp_config["mcpServers"]["review-mcp"]["type"], "stdio")
        self.assertEqual(
            omp_config["mcpServers"]["review-mcp"]["env"],
            {"CAPRUN_SENTINEL": "review-mcp"},
        )
        for prompt_file in (
            codex / "AGENTS.md",
            qoder / "system-prompt.md",
            omp / "system-prompt.md",
        ):
            prompt = prompt_file.read_text(encoding="utf-8")
            self.assertIn("Review session profile", prompt)
            self.assertNotIn("Multi-profile fixture baseline", prompt)

    def test_case_alias_cannot_place_outputs_inside_project(self) -> None:
        alias_text = str(self.project).replace("/private/var/", "/private/VAR/", 1)
        alias_root = Path(alias_text)
        if alias_root == self.project or not alias_root.exists():
            self.skipTest("test requires a case-insensitive /private/var filesystem")
        if not os.path.samefile(alias_root, self.project):
            self.skipTest("test requires a case-insensitive /private/var filesystem")

        output = self.project / "case-output"
        output.mkdir()
        output_alias = alias_root / output.name
        with self.assertRaisesRegex(profile.ProfileError, "outside the project root"):
            self.materialize_profile(self.project, "codex", "review", output_alias)

        state = self.project / "case-state"
        state.mkdir()
        state_alias = alias_root / state.name
        with self.assertRaisesRegex(profile.ProfileError, "outside the project root"):
            self.probe_profile(self.project, "codex", "review", state_alias)

        receipt_parent = self.project / "case-receipt"
        receipt_parent.mkdir()
        runner = mock.Mock()
        subprocess.run(["git", "init", "-q", str(self.project)], check=True)
        with self.assertRaisesRegex(profile.ProfileError, "outside the project root"):
            self.run_client(self.project,
            "codex",
            "review",
            receipt_path=alias_root / receipt_parent.name / "receipt.json",
            runner=runner,
            auth_root=self.auth_root,)
        runner.assert_not_called()

    def test_concurrent_profiles_render_to_independent_trees(self) -> None:
        review = self.output_directory("concurrent-review")
        implementation = self.output_directory("concurrent-implementation")
        with ThreadPoolExecutor(max_workers=2) as executor:
            review_future = executor.submit(
                self.materialize_profile, self.project, "qoder", "review", review
            )
            implementation_future = executor.submit(
                self.materialize_profile,
                self.project,
                "qoder",
                "implementation",
                implementation,
            )
        self.assertNotEqual(review_future.result(), implementation_future.result())
        self.assertTrue((review / "skills" / "review-skill" / "SKILL.md").is_file())
        self.assertFalse((review / "skills" / "implementation-skill").exists())
        self.assertTrue(
            (implementation / "skills" / "implementation-skill" / "SKILL.md").is_file()
        )
        self.assertFalse((implementation / "skills" / "review-skill").exists())

    def test_render_rejects_symlink_ancestor(self) -> None:
        target = self.root / "ancestor-target"
        output = target / "output"
        output.mkdir(parents=True)
        linked_ancestor = self.root / "linked-ancestor"
        linked_ancestor.symlink_to(target, target_is_directory=True)
        with self.assertRaisesRegex(profile.ProfileError, "non-symlink directory"):
            self.materialize_profile(self.project, "codex", "review", linked_ancestor / "output")

    def test_render_requires_an_existing_empty_non_symlink_directory(self) -> None:
        missing = self.root / "missing"
        with self.assertRaisesRegex(profile.ProfileError, "existing non-symlink"):
            self.materialize_profile(self.project, "codex", "review", missing)
        occupied = self.output_directory("occupied")
        (occupied / "keep.txt").write_text("occupied", encoding="utf-8")
        with self.assertRaisesRegex(profile.ProfileError, "must be empty"):
            self.materialize_profile(self.project, "codex", "review", occupied)

    def test_render_rejects_output_inside_project(self) -> None:
        output = self.project / "runtime"
        output.mkdir()
        with self.assertRaisesRegex(profile.ProfileError, "outside the project root"):
            self.materialize_profile(self.project, "codex", "review", output)
        self.assertEqual(list(output.iterdir()), [])

    def test_render_rejects_global_native_root(self) -> None:
        output = self.home / ".codex"
        output.mkdir()
        with self.assertRaisesRegex(
            profile.ProfileError, "outside global capability roots"
        ):
            self.materialize_profile(self.project, "codex", "review", output)
        self.assertEqual(list(output.iterdir()), [])

    def test_render_directory_swap_cannot_redirect_materialized_files(self) -> None:
        output = self.output_directory("stable-output")
        moved = self.root / "moved-output"
        redirect = self.root / "redirect-output"
        redirect.mkdir()
        original_mkdir = os.mkdir
        swapped = False

        def swapping_mkdir(
            path: str | bytes,
            mode: int = 0o777,
            *,
            dir_fd: int | None = None,
        ) -> None:
            # The tree is written while the target is swapped underneath us. The
            # staged tree never touches the target, so nothing reaches redirect.
            nonlocal swapped
            if not swapped:
                output.rename(moved)
                output.symlink_to(redirect, target_is_directory=True)
                swapped = True
            original_mkdir(path, mode, dir_fd=dir_fd)

        with mock.patch.object(
            profile.os, "mkdir", side_effect=swapping_mkdir
        ), self.assertRaisesRegex(
            profile.ProfileError, "stable directory changed"
        ):
            self.materialize_profile(self.project, "codex", "review", output)
        self.assertEqual(list(redirect.iterdir()), [])


class GateAndLockTests(ProfileTestCase):
    def test_machine_context_active_assets_are_rejected(self) -> None:
        path = self.home / ".agents" / "skills" / "global-skill" / "SKILL.md"
        path.parent.mkdir(parents=True)
        path.write_text("pollution", encoding="utf-8")
        with self.assertRaisesRegex(
            profile.ProfileError, "active machine-context drift"
        ):
            self.verify_project(self.project)

    def test_runtime_only_global_configs_are_allowed(self) -> None:
        configs = {
            ".claude.json": '{"theme": "dark"}',
            ".codex/config.toml": (
                'model = "gpt-5.6"\nsandbox_mode = "read-only"\n'
                '[projects."/tmp/runtime"]\ntrust_level = "trusted"\n'
                "[agents]\nenabled = false\n"
                '[agents.reviewer]\ndescription = "cached role"\n'
                "[analytics]\nenabled = false\n"
                "[feedback]\nenabled = false\n"
            ),
            ".config/opencode/opencode.json": '{"model": "openai/gpt-5.6"}',
            ".gemini/settings.json": '{"theme": "dark"}',
            ".omp/agent/config.yml": "model: openai/gpt-5.6\n",
            ".pi/agent/config.yml": "model: openai/gpt-5.6\n",
            ".qoder/settings.json": '{"theme": "dark"}',
        }
        for relative, content in configs.items():
            path = self.home / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        self.verify_project(self.project)

    def test_only_known_qoder_host_hooks_are_ignored(self) -> None:
        qoder_settings = self.home / ".qoder" / "settings.json"
        qoder_settings.parent.mkdir(parents=True)
        hooks = {
            "PreToolUse": [
                {
                    "matcher": "*",
                    "hooks": [
                        {
                            "type": "command",
                            "command": (
                                f"{self.home}/.yunke/aah_hooks/hook_entry "
                                "--agent-type=qoder"
                            ),
                            "_yunke_managed": True,
                            "timeout": 10,
                        },
                        {
                            "type": "command",
                            "command": (
                                f"bash {self.home}/.r2c/scripts/qoder-cli-hook.sh"
                            ),
                            "timeout": 15,
                        },
                    ],
                }
            ],
            "SessionEnd": [],
        }
        qoder_settings.write_text(json.dumps({"hooks": hooks}), encoding="utf-8")
        self.verify_project(self.project)

        hooks["PreToolUse"][0]["hooks"].append(
            {
                "type": "command",
                "command": f"{self.home}/rogue-hook",
                "timeout": 10,
            }
        )
        qoder_settings.write_text(json.dumps({"hooks": hooks}), encoding="utf-8")
        with self.assertRaisesRegex(
            profile.ProfileError, "active machine-context drift"
        ):
            self.verify_project(self.project)

    def test_minimal_host_floor_and_disabled_global_caches_are_allowed(self) -> None:
        codex_skills = self.home / ".codex" / "skills" / ".system"
        for name in ("skill-creator", "skill-installer"):
            skill = codex_skills / name / "SKILL.md"
            skill.parent.mkdir(parents=True, exist_ok=True)
            skill.write_text(f"# {name}\n", encoding="utf-8")
        (self.home / ".codex" / "plugins" / "cache").mkdir(parents=True)
        (self.home / ".codex" / "hooks").mkdir(parents=True)
        (self.home / ".agents" / "skills").mkdir(parents=True)
        for client_root in (".omp/agent", ".pi/agent"):
            for name in profile.ORCA_MANAGED_EXTENSION_NAMES:
                extension = self.home / client_root / "extensions" / name
                extension.parent.mkdir(parents=True, exist_ok=True)
                extension.write_text(
                    "// @orca-managed-pi-extension\n", encoding="utf-8"
                )
        codex_config = self.home / ".codex" / "config.toml"
        codex_config.write_text(
            "\n".join(
                [
                    "[features]",
                    "hooks = false",
                    "plugins = false",
                    "skill_search = false",
                    "",
                    "[[skills.config]]",
                    "enabled = false",
                    f'path = "{codex_skills / "skill-creator" / "SKILL.md"}"',
                    "",
                    "[[skills.config]]",
                    "enabled = false",
                    f'path = "{codex_skills / "skill-installer" / "SKILL.md"}"',
                    "",
                ]
            ),
            encoding="utf-8",
        )
        for relative in (".codex/AGENTS.md", ".qoder/AGENTS.md"):
            floor = self.home / relative
            floor.parent.mkdir(parents=True, exist_ok=True)
            floor.write_text(profile.HOST_FLOOR_TEXT, encoding="utf-8")
        qoder_plugin = (
            self.home
            / ".qoder"
            / "plugins"
            / "cache"
            / "test-marketplace"
            / "cached-plugin"
            / "1.0.0"
        )
        qoder_plugin.mkdir(parents=True)
        (self.home / ".qoder" / "plugins" / "data" / "security-scan").mkdir(
            parents=True
        )
        (self.home / ".qoder" / "settings.json").write_text(
            '{"enabledPlugins": {"cached-plugin@test-marketplace": false}}',
            encoding="utf-8",
        )
        self.verify_project(self.project)

    def test_codex_skill_symlink_alias_is_not_treated_as_disabled(self) -> None:
        actual = self.home / "outside-skill" / "SKILL.md"
        actual.parent.mkdir(parents=True)
        actual.write_text("# rogue\n", encoding="utf-8")
        alias = self.home / ".codex" / "skills" / ".system" / "rogue" / "SKILL.md"
        alias.parent.mkdir(parents=True)
        alias.symlink_to(actual)
        config = self.home / ".codex" / "config.toml"
        config.write_text(
            "\n".join(
                [
                    "[features]",
                    "skill_search = false",
                    "",
                    "[[skills.config]]",
                    "enabled = false",
                    f'path = "{alias}"',
                    "",
                ]
            ),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(
            profile.ProfileError, "active machine-context drift"
        ):
            self.verify_project(self.project)

    def test_qoder_cache_requires_matching_disabled_plugin_identity(self) -> None:
        rogue = (
            self.home
            / ".qoder"
            / "plugins"
            / "cache"
            / "rogue-marketplace"
            / "rogue-plugin"
            / "1.0.0"
        )
        rogue.mkdir(parents=True)
        (self.home / ".qoder" / "settings.json").write_text(
            '{"enabledPlugins": {"different-plugin@rogue-marketplace": false}}',
            encoding="utf-8",
        )
        with self.assertRaisesRegex(
            profile.ProfileError, "active machine-context drift"
        ):
            self.verify_project(self.project)

    def test_project_native_bypasses_are_rejected(self) -> None:
        bypasses = (
            ".mcp.json",
            "mcp.json",
            ".agents/skills/bypass/SKILL.md",
            ".claude-plugin/rogue.json",
            ".claude/.mcp.json",
            ".claude/mcp.json",
            ".codex/config.toml",
            ".cursor/mcp.json",
            ".gemini/settings.json",
            ".qoder/settings.json",
            ".omp/mcp.json",
            ".vscode/mcp.json",
            ".windsurf/mcp_config.json",
            "opencode.json",
            "nested/QODER.md",
        )
        for index, relative in enumerate(bypasses):
            with self.subTest(relative=relative):
                project = self.root / f"bypass-{index}"
                copy_fixture(project)
                path = project / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("bypass", encoding="utf-8")
                with self.assertRaisesRegex(
                    profile.ProfileError, "project capability bypass"
                ):
                    self.verify_project(project)

    def test_managed_dual_marketplace_and_claude_import_are_allowed(self) -> None:
        project = self.root / "managed-publication"
        copy_fixture(project)
        (project / "CLAUDE.md").write_text("@AGENTS.md\n", encoding="utf-8")
        (project / "plugins" / "sample").mkdir(parents=True)
        plugin_manifest = {
            "name": "sample",
            "version": "1.0.0",
            "repository": "https://github.com/Eridanus117/agent-system",
            "skills": "./skills/",
        }
        for manifest_root in (".codex-plugin", ".claude-plugin"):
            manifest_path = (
                project / "plugins" / "sample" / manifest_root / "plugin.json"
            )
            manifest_path.parent.mkdir()
            manifest_path.write_text(
                json.dumps(plugin_manifest),
                encoding="utf-8",
            )
        codex_marketplace = project / ".agents" / "plugins" / "marketplace.json"
        codex_marketplace.parent.mkdir(parents=True)
        codex_marketplace.write_text(
            json.dumps(
                {
                    "name": "sample-marketplace",
                    "plugins": [
                        {
                            "name": "sample",
                            "version": "1.0.0",
                            "source": {
                                "source": "local",
                                "path": "./plugins/sample",
                            },
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        claude_marketplace = project / ".claude-plugin" / "marketplace.json"
        claude_marketplace.parent.mkdir()
        claude_marketplace.write_text(
            json.dumps(
                {
                    "name": "sample-marketplace",
                    "plugins": [
                        {
                            "name": "sample",
                            "version": "1.0.0",
                            "source": "./plugins/sample",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        self.verify_project(project)

        claude_marketplace.write_text(
            json.dumps(
                {
                    "name": "sample-marketplace",
                    "plugins": [
                        {
                            "name": "different",
                            "version": "1.0.0",
                            "source": "./plugins/different",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(
            profile.ProfileError, "project capability bypass"
        ):
            self.verify_project(project)

    def test_project_native_bypasses_are_case_insensitive(self) -> None:
        bypasses = (
            ".CoDeX/config.toml",
            ".QoDeR/settings.json",
            "nested/agents.MD",
            "MCP.JSON",
        )
        for index, relative in enumerate(bypasses):
            with self.subTest(relative=relative):
                project = self.root / f"case-bypass-{index}"
                copy_fixture(project)
                path = project / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("bypass", encoding="utf-8")
                with self.assertRaisesRegex(
                    profile.ProfileError, "project capability bypass"
                ):
                    self.verify_project(project)

    def test_symlinked_provider_directory_is_rejected(self) -> None:
        external = self.root / "external-claude"
        external.mkdir()
        (external / "mcp.json").write_text('{"mcpServers": {}}', encoding="utf-8")
        (self.project / ".claude").symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(profile.ProfileError, "project capability bypass"):
            self.verify_project(self.project)

    def test_lock_detects_input_and_renderer_drift(self) -> None:
        mutations = (
            ("AGENTS.md", "\nchanged baseline\n"),
            (".cap/profiles/review.toml", "\n# changed profile\n"),
            (".cap/prompts/review.md", "\nchanged prompt\n"),
            (
                ".cap/capabilities/skills/review-skill/SKILL.md",
                "\nchanged capability\n",
            ),
            (".cap/manifest.toml", "\n# changed manifest\n"),
        )
        for index, (relative, addition) in enumerate(mutations):
            with self.subTest(relative=relative):
                project = self.root / f"drift-{index}"
                copy_fixture(project)
                with (project / relative).open("a", encoding="utf-8") as stream:
                    stream.write(addition)
                with self.assertRaisesRegex(profile.ProfileError, "lock drift"):
                    self.verify_project(project)
        with mock.patch.object(
            profile, "RENDERER_VERSION", "profile-renderer-v4"
        ), self.assertRaisesRegex(profile.ProfileError, "lock drift"):
            self.verify_project(self.project)

    def test_list_and_explain_reject_stale_lock(self) -> None:
        with (self.project / ".cap" / "prompts" / "review.md").open(
            "a", encoding="utf-8"
        ) as stream:
            stream.write("\ndrift\n")
        for operation in (
            lambda: profile.list_profiles(self.project),
            lambda: profile.explain_profile(self.project, "review"),
        ):
            with self.subTest(operation=operation), self.assertRaisesRegex(
                profile.ProfileError, "lock drift"
            ):
                operation()

    def test_lock_file_matches_current_fixture(self) -> None:
        current = self.verify_project(self.project)
        lock = json.loads(
            (self.project / ".cap" / "lock.json").read_text(encoding="utf-8")
        )
        self.assertEqual(current, lock)

    def test_strict_parsing_rejects_unknown_duplicate_and_non_finite_data(self) -> None:
        manifest = self.project / ".cap" / "manifest.toml"
        manifest.write_text(
            manifest.read_text(encoding="utf-8").replace(
                "version = 3\n", 'version = 3\nunknown = "value"\n', 1
            ),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(profile.ProfileError, "keys mismatch"):
            profile.load_project(self.project)

        shutil.rmtree(self.project)
        copy_fixture(self.project)
        mcp = self.project / ".cap" / "capabilities" / "mcp" / "review-mcp.json"
        mcp.write_text(
            '{"version":1,"name":"review-mcp","name":"duplicate",'
            '"command":"python3","args":[],"env":{}}',
            encoding="utf-8",
        )
        with self.assertRaisesRegex(profile.ProfileError, "duplicate JSON key"):
            profile.load_project(self.project)

        mcp.write_text(
            '{"version":1,"name":"review-mcp","command":"python3",'
            '"args":[],"env":{},"number":NaN}',
            encoding="utf-8",
        )
        with self.assertRaisesRegex(profile.ProfileError, "non-finite JSON"):
            profile.load_project(self.project)

    def test_path_escape_and_overlay_root_escape_are_rejected(self) -> None:
        manifest = self.project / ".cap" / "manifest.toml"
        manifest.write_text(
            manifest.read_text(encoding="utf-8").replace(
                'review = ".cap/profiles/review.toml"',
                'review = "../outside.toml"',
                1,
            ),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(
            profile.ProfileError, "normalized POSIX relative path"
        ):
            profile.load_project(self.project)

        shutil.rmtree(self.project)
        copy_fixture(self.project)
        conflict = (
            self.project
            / ".cap"
            / "capabilities"
            / "hooks"
            / "review-hook"
            / "targets"
            / "codex"
            / "config.toml"
        )
        conflict.write_text("opaque conflict", encoding="utf-8")
        with self.assertRaisesRegex(profile.ProfileError, "must contain only hooks/"):
            profile.create_lock(self.project)
    def test_hook_and_plugin_targets_cannot_cross_owned_namespaces(self) -> None:
        escapes = (
            ("hooks", "review-hook", "skills/review-skill/SKILL.md"),
            ("hooks", "review-hook", "plugins/cross-kind.sentinel"),
            ("hooks", "review-hook", "config.toml"),
            ("hooks", "review-hook", "AGENTS.md"),
            ("plugins", "review-plugin", "hooks/cross-kind.sentinel"),
        )
        for index, (kind, name, relative) in enumerate(escapes):
            with self.subTest(kind=kind, relative=relative):
                project = self.root / f"overlay-escape-{index}"
                copy_fixture(project)
                payload = (
                    project
                    / ".cap"
                    / "capabilities"
                    / kind
                    / name
                    / "targets"
                    / "codex"
                    / relative
                )
                payload.parent.mkdir(parents=True, exist_ok=True)
                payload.write_text("cross-owned payload", encoding="utf-8")
                with self.assertRaisesRegex(
                    profile.ProfileError,
                    rf"must contain only {kind}/",
                ):
                    profile.load_project(project)

    def test_missing_client_overlay_target_is_rejected(self) -> None:
        target = (
            self.project
            / ".cap"
            / "capabilities"
            / "hooks"
            / "review-hook"
            / "targets"
            / "omp"
        )
        shutil.rmtree(target)
        with self.assertRaisesRegex(profile.ProfileError, "lacks required omp target"):
            profile.create_lock(self.project)







class MachineContextTests(ProfileTestCase):
    def test_profiles_are_v3_leaf_profiles(self) -> None:
        project = profile.load_project(self.project)
        self.assertEqual(
            project.profiles["review"].chain, ("project-defaults", "review")
        )
        self.assertEqual(
            project.profiles["implementation"].chain,
            ("project-defaults", "implementation"),
        )

    def test_machine_context_lock_redacts_secrets_and_separates_passive_drift(
        self,
    ) -> None:
        mcp = self.home / ".mcp.json"
        mcp.write_text(
            '{"mcpServers":{"demo":{"command":"python3",'
            '"env":{"API_TOKEN":"first"}}}}',
            encoding="utf-8",
        )
        manifest_path = self.root / "machine-context-refresh.json"
        locked = profile.create_base_manifest(self.home, manifest_path)
        serialized = manifest_path.read_text(encoding="utf-8")
        self.assertNotIn("first", serialized)

        mcp.write_text(
            '{"mcpServers":{"demo":{"command":"python3",'
            '"env":{"API_TOKEN":"second"}}}}',
            encoding="utf-8",
        )
        secret_only = profile.discover_real_home(self.home)
        self.assertEqual(locked["effective_digest"], secret_only["effective_digest"])

        codex = self.home / ".codex"
        codex.mkdir(exist_ok=True)
        (codex / "config.toml").write_text('model = "two"\n', encoding="utf-8")
        passive_only = profile.discover_real_home(self.home)
        active, passive = profile._base_diff(locked, passive_only)
        self.assertEqual(active, [])
        self.assertEqual(passive, [".codex/config.toml"])

        mcp.write_text(
            '{"mcpServers":{"demo":{"command":"node",'
            '"env":{"API_TOKEN":"second"}}}}',
            encoding="utf-8",
        )
        active_change = profile.discover_real_home(self.home)
        active, _ = profile._base_diff(locked, active_change)
        self.assertEqual(active, [".mcp.json"])

    def test_unknown_machine_context_asset_blocks_noninteractive_run(self) -> None:
        (self.home / ".mcp.json").write_text(
            '{"mcpServers":{"demo":{"command":"node"}}}',
            encoding="utf-8",
        )
        runner = mock.Mock(return_value=SimpleNamespace(returncode=0))
        subprocess.run(["git", "init", "-q", str(self.project)], check=True)
        with self.assertRaisesRegex(
            profile.ProfileError, "active Agent-facing assets lack client evidence"
        ):
            self.run_client(
                self.project,
                "omp",
                "review",
                auth_root=self.auth_root,
                runner=runner,
            )
        runner.assert_not_called()
class LaunchTests(ProfileTestCase):
    def setUp(self) -> None:
        super().setUp()
        subprocess.run(["git", "init", "-q", str(self.project)], check=True)

    def test_run_builds_each_native_command_and_environment_then_cleans_root(
        self,
    ) -> None:
        expectations = {
            "codex": ("codex", "CODEX_HOME", ()),
            "qoder": (
                "qoder",
                "QODER_CONFIG_DIR",
                (
                    "--config-dir",
                    "--strict-mcp-config",
                    "--mcp-config",
                    "--append-system-prompt",
                ),
            ),
            "omp": (
                "omp",
                "PI_CODING_AGENT_DIR",
                (
                    "--config",
                    "--append-system-prompt",
                    "--skills",
                    "--no-extensions",
                    "--no-rules",
                ),
            ),
        }
        runtime_roots: list[Path] = []
        for client, (
            executable,
            environment_name,
            required_flags,
        ) in expectations.items():
            receipt = self.root / f"{client}-receipt.json"

            def fake_runner(
                command: list[str],
                *,
                client: str = client,
                executable: str = executable,
                environment_name: str = environment_name,
                required_flags: tuple[str, ...] = required_flags,
                **kwargs: object,
            ) -> SimpleNamespace:
                runtime_root = Path(str(kwargs["env"][environment_name]))  # type: ignore[index]
                runtime_roots.append(runtime_root)
                environment = kwargs["env"]  # type: ignore[assignment]
                self.assertTrue(runtime_root.is_dir())
                expected_cwd = runtime_root if client == "omp" else self.project
                self.assertEqual(Path(str(kwargs["cwd"])), expected_cwd)
                self.assertEqual(command[0], executable)
                for flag in required_flags:
                    self.assertIn(flag, command)
                if client == "omp":
                    safe_omp_environment = {
                        "OMP_AUTH_BROKER_TOKEN": "test-broker-token",
                        "OMP_AUTH_BROKER_URL": "http://127.0.0.1:43129",
                        "OMP_PROFILE": "default",
                        "PI_CODING_AGENT_DIR": str(runtime_root),
                        # Joined with the home by the client, so it must be the
                        # home-relative name rather than an absolute path.
                        "PI_CONFIG_DIR": profile._home_relative_name(
                            runtime_root, "omp runtime root"
                        ),
                        "PI_CONFIG_FILES": str(runtime_root / "config.yml"),
                        "PI_PROFILE": "default",
                    }
                    for name, value in safe_omp_environment.items():
                        self.assertEqual(environment[name], value)
                    self.assertNotIn("CODEX_HOME", environment)
                    self.assertNotIn("QODER_CONFIG_DIR", environment)
                    for name in profile.OMP_AMBIENT_AUTH_ENV:
                        expected = "true" if name == "AWS_EC2_METADATA_DISABLED" else ""
                        self.assertEqual(environment[name], expected)
                    cwd_index = command.index("--cwd") + 1
                    self.assertEqual(Path(command[cwd_index]), self.project)
                    self.assertEqual(environment["HOME"], str(self.home))
                    self.assertEqual(environment["PI_AUTH_NO_BORROW"], "1")
                else:
                    for ambient_name in profile.AMBIENT_CONFIG_ENV:
                        if ambient_name != environment_name:
                            self.assertNotIn(ambient_name, environment)
                if client in {"qoder", "omp"}:
                    prompt_index = command.index("--append-system-prompt") + 1
                    self.assertIn("Review session profile", command[prompt_index])
                    self.assertFalse(command[prompt_index].endswith("system-prompt.md"))
                if client == "omp":
                    skill_index = command.index("--skills") + 1
                    self.assertEqual(command[skill_index], "review-skill")
                self.assertEqual(command[-2:], ["--token", "super-secret"])
                if client == "codex":
                    self.assertTrue((runtime_root / "config.toml").is_file())
                    self.assertIn(
                        'cli_auth_credentials_store = "file"',
                        (runtime_root / "config.toml").read_text(encoding="utf-8"),
                    )
                    self.assertTrue((runtime_root / "auth.json").is_symlink())
                    self.assertTrue(
                        os.path.samefile(
                            runtime_root / "auth.json",
                            self.auth_root / "codex" / "auth.json",
                        )
                    )
                elif client == "qoder":
                    self.assertTrue((runtime_root / "settings.json").is_file())
                    self.assertTrue((runtime_root / ".auth").is_symlink())
                    self.assertTrue(
                        os.path.samefile(
                            runtime_root / ".auth",
                            self.auth_root / "qoder" / ".auth",
                        )
                    )
                else:
                    self.assertTrue((runtime_root / "config.yml").is_file())
                return SimpleNamespace(returncode=0)

            result = self.run_client(self.project,
            client,
            "review",
            ("--token", "super-secret"),
            receipt_path=receipt,
            runner=fake_runner,
            auth_root=self.auth_root,)
            self.assertEqual(result, 0)
            payload = receipt.read_text(encoding="utf-8")
            self.assertNotIn("super-secret", payload)
            self.assertNotIn(str(runtime_roots[-1]), payload)
            self.assertNotIn(str(self.auth_root), payload)
            self.assertNotIn("test-broker-token", payload)
            self.assertTrue(json.loads(payload)["temporary_root_removed"])
            self.assertEqual(
                json.loads(payload)["inventory"],
                {
                    "hooks": ["review-hook"],
                    "mcps": ["review-mcp"],
                    "plugins": ["review-plugin"],
                    "skills": ["review-skill"],
                },
            )
            self.assertFalse(runtime_roots[-1].exists())

    def test_auth_vault_is_required_private_and_outside_the_project(self) -> None:
        runner = mock.Mock()
        with self.assertRaisesRegex(profile.ProfileError, "existing non-symlink"):
            self.run_client(self.project,
            "codex",
            "review",
            auth_root=self.root / "missing-auth",
            runner=runner,)
        runner.assert_not_called()

        project_auth = self.project / "auth-vault"
        shutil.copytree(self.auth_root, project_auth)
        with self.assertRaisesRegex(profile.ProfileError, "outside the project root"):
            self.run_client(self.project,
            "codex",
            "review",
            auth_root=project_auth,
            runner=runner,)
        runner.assert_not_called()

        codex_auth = self.auth_root / "codex" / "auth.json"
        codex_auth.chmod(0o644)
        with self.assertRaisesRegex(profile.ProfileError, "group or other access"):
            self.run_client(self.project,
            "codex",
            "review",
            auth_root=self.auth_root,
            runner=runner,)
        runner.assert_not_called()

        codex_auth.chmod(0o400)
        with self.assertRaisesRegex(profile.ProfileError, "owner read and write"):
            self.run_client(self.project,
            "codex",
            "review",
            auth_root=self.auth_root,
            runner=runner,)
        runner.assert_not_called()

        omp_token = self.auth_root / "omp" / "token"
        omp_token.write_bytes(b"invalid\x00token")
        with self.assertRaisesRegex(profile.ProfileError, "printable non-space ASCII"):
            self.run_client(self.project,
            "omp",
            "review",
            auth_root=self.auth_root,
            runner=runner,)
        runner.assert_not_called()

    def test_qoder_auth_tree_has_bounded_entries_and_depth(self) -> None:
        runner = mock.Mock()
        qoder_auth = self.auth_root / "qoder" / ".auth"
        for index in range(257):
            (qoder_auth / f"entry-{index}").mkdir(mode=0o700)
        with self.assertRaisesRegex(profile.ProfileError, "256 directory entries"):
            self.run_client(self.project,
            "qoder",
            "review",
            auth_root=self.auth_root,
            runner=runner,)
        runner.assert_not_called()

    def test_auth_vault_updates_persist_without_native_global_roots(self) -> None:
        for client in ("codex", "qoder"):
            with self.subTest(client=client):
                isolated_auth = self.root / f"{client}-persistent-auth"
                shutil.copytree(self.auth_root, isolated_auth)

                def updating_runner(
                    command: list[str],
                    *,
                    client: str = client,
                    **kwargs: object,
                ) -> SimpleNamespace:
                    environment = kwargs["env"]  # type: ignore[assignment]
                    if client == "codex":
                        runtime = Path(str(environment["CODEX_HOME"]))
                        (runtime / "auth.json").write_text(
                            '{"auth_mode":"chatgpt","refresh":"persisted"}',
                            encoding="utf-8",
                        )
                    else:
                        runtime = Path(str(environment["QODER_CONFIG_DIR"]))
                        (runtime / ".auth" / "refresh.json").write_text(
                            '{"refresh":"persisted"}', encoding="utf-8"
                        )
                    return SimpleNamespace(returncode=0)

                self.run_client(self.project,
                client,
                "review",
                auth_root=isolated_auth,
                receipt_path=self.root / f"{client}-persistent-receipt.json",
                runner=updating_runner,)
                if client == "codex":
                    self.assertIn(
                        "persisted",
                        (isolated_auth / "codex" / "auth.json").read_text(
                            encoding="utf-8"
                        ),
                    )
                else:
                    self.assertTrue(
                        (isolated_auth / "qoder" / ".auth" / "refresh.json").is_file()
                    )

    def test_concurrent_codex_refresh_is_retried_to_one_stable_snapshot(self) -> None:
        codex_auth = self.auth_root / "codex" / "auth.json"
        original_read = os.read
        refreshed = False

        def racing_read(descriptor: int, count: int) -> bytes:
            nonlocal refreshed
            chunk = original_read(descriptor, count)
            if not refreshed:
                refreshed = True
                codex_auth.write_text(
                    '{"auth_mode":"chatgpt","refresh":"concurrent"}',
                    encoding="utf-8",
                )
                codex_auth.chmod(0o600)
            return chunk

        runner = mock.Mock(return_value=SimpleNamespace(returncode=0))
        with mock.patch.object(profile.os, "read", side_effect=racing_read):
            self.run_client(self.project,
            "codex",
            "review",
            auth_root=self.auth_root,
            receipt_path=self.root / "stable-auth-receipt.json",
            runner=runner,)
        self.assertTrue(refreshed)
        runner.assert_called_once()
        self.assertIn("concurrent", codex_auth.read_text(encoding="utf-8"))

    def test_stable_but_incomplete_auth_snapshots_are_retried(self) -> None:
        original_read = profile._read_private_file
        runner = mock.Mock(return_value=SimpleNamespace(returncode=0))
        for client, target in (("codex", "auth.json"), ("omp", "broker.json")):
            with self.subTest(client=client):
                transient_reads = 0

                def transient_read(
                    directory: profile.StableDirectory,
                    name: str,
                    context: str,
                    *,
                    target: str = target,
                    **kwargs: object,
                ) -> bytes:
                    nonlocal transient_reads
                    if name == target and transient_reads == 0:
                        transient_reads += 1
                        return b"{}"
                    return original_read(directory, name, context, **kwargs)  # type: ignore[arg-type]

                with mock.patch.object(
                    profile, "_read_private_file", side_effect=transient_read
                ):
                    self.run_client(self.project,
                    client,
                    "review",
                    auth_root=self.auth_root,
                    receipt_path=self.root / f"{client}-snapshot-retry.json",
                    runner=runner,)
                self.assertEqual(transient_reads, 1)

    def test_omp_broker_url_rejects_control_characters_before_spawn(self) -> None:
        broker = self.auth_root / "omp" / "broker.json"
        broker.write_text(
            json.dumps({"version": 1, "url": "https://broker.invalid\u0000"}),
            encoding="utf-8",
        )
        runner = mock.Mock()
        with self.assertRaisesRegex(profile.ProfileError, "printable non-space"):
            self.run_client(self.project,
            "omp",
            "review",
            auth_root=self.auth_root,
            runner=runner,)
        runner.assert_not_called()

    def test_ambient_auth_is_removed_before_explicit_auth_is_bound(self) -> None:
        ambient = {
            "CODEX_ACCESS_TOKEN": "ambient-codex-access",
            "CODEX_API_KEY": "ambient-codex-key",
            "OPENAI_API_KEY": "ambient-openai-key",
            "OMP_AUTH_BROKER_URL": "https://ambient.invalid",
            "AWS_SHARED_CREDENTIALS_FILE": "/tmp/ambient-aws-credentials",
            "CLOUDSDK_CONFIG": "/tmp/ambient-gcloud",
            "OLLAMA_HOST": "https://ambient-ollama.invalid",
            "OMP_AUTH_BROKER_TOKEN": "ambient-broker-token",
            "ANTHROPIC_API_KEY": "ambient-anthropic-key",
            "FUTURE_PROVIDER_API_KEY": "ambient-future-key",
        }
        for client in profile.LAUNCHABLE_CLIENTS:
            with (
                self.subTest(client=client),
                mock.patch.dict(os.environ, ambient, clear=False),
            ):

                def checking_runner(
                    command: list[str],
                    *,
                    client: str = client,
                    **kwargs: object,
                ) -> SimpleNamespace:
                    environment = kwargs["env"]  # type: ignore[assignment]
                    self.assertNotIn("CODEX_ACCESS_TOKEN", environment)
                    self.assertNotIn("CODEX_API_KEY", environment)
                    if client == "omp":
                        self.assertEqual(environment["AWS_SHARED_CREDENTIALS_FILE"], "")
                        self.assertEqual(environment["CLOUDSDK_CONFIG"], "")
                        self.assertEqual(environment["OLLAMA_HOST"], "")
                        self.assertEqual(environment["HOME"], str(self.home))
                        self.assertEqual(environment["PI_AUTH_NO_BORROW"], "1")
                        self.assertEqual(environment["ANTHROPIC_API_KEY"], "")
                        self.assertEqual(environment["OPENAI_API_KEY"], "")
                        self.assertEqual(environment["FUTURE_PROVIDER_API_KEY"], "")
                    else:
                        self.assertNotIn("OPENAI_API_KEY", environment)
                    if client == "omp":
                        self.assertEqual(
                            environment["OMP_AUTH_BROKER_URL"],
                            "http://127.0.0.1:43129",
                        )
                        self.assertEqual(
                            environment["OMP_AUTH_BROKER_TOKEN"],
                            "test-broker-token",
                        )
                    else:
                        self.assertNotIn("OMP_AUTH_BROKER_URL", environment)
                        self.assertNotIn("OMP_AUTH_BROKER_TOKEN", environment)
                    return SimpleNamespace(returncode=0)

                self.run_client(self.project,
                client,
                "review",
                auth_root=self.auth_root,
                receipt_path=self.root / f"{client}-ambient-auth-receipt.json",
                runner=checking_runner,)

    @unittest.skipUnless(shutil.which("bun"), "bun is required for the dotenv boundary probe")
    def test_omp_empty_auth_mask_blocks_project_dotenv_reload(self) -> None:
        (self.project / ".env").write_text(
            "ANTHROPIC_API_KEY=dotenv-secret\n"
            "FUTURE_PROVIDER_API_KEY=future-dotenv-secret\n",
            encoding="utf-8",
        )

        def bun_boundary_runner(
            command: list[str], **kwargs: object
        ) -> SimpleNamespace:
            result = subprocess.run(
                [
                    "bun",
                    "-e",
                    "console.log(JSON.stringify([process.env.ANTHROPIC_API_KEY, process.env.FUTURE_PROVIDER_API_KEY ?? null]))",
                ],
                cwd=kwargs["cwd"],
                env=kwargs["env"],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout.strip(), '["",null]')
            return SimpleNamespace(returncode=0)

        self.run_client(self.project,
        "omp",
        "review",
        auth_root=self.auth_root,
        receipt_path=self.root / "dotenv-auth-mask-receipt.json",
        runner=bun_boundary_runner,)

    def test_launch_metadata_cannot_be_swapped_through_runtime_path(self) -> None:
        original_build_launch = profile.build_launch

        def swapping_build_launch(
            client: str,
            runtime_root: Path | str,
            rendered_tree: dict[str, profile.RenderedFile],
            forwarded_args: tuple[str, ...] = (),
        ) -> profile.LaunchSpec:
            root = Path(runtime_root)
            moved = root.with_name(root.name + "-held")
            root.rename(moved)
            root.mkdir()
            (root / "system-prompt.md").write_text("malicious prompt", encoding="utf-8")
            try:
                return original_build_launch(
                    client,
                    runtime_root,
                    rendered_tree,
                    forwarded_args,
                )
            finally:
                shutil.rmtree(root)
                moved.rename(root)

        def fake_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            prompt_index = command.index("--append-system-prompt") + 1
            self.assertIn("Review session profile", command[prompt_index])
            self.assertNotIn("malicious", command[prompt_index])
            return SimpleNamespace(returncode=0)

        with mock.patch.object(
            profile, "build_launch", side_effect=swapping_build_launch
        ):
            for client in ("qoder", "omp"):
                with self.subTest(client=client):
                    self.assertEqual(
                        self.run_client(self.project,
                        client,
                        "review",
                        receipt_path=self.root / f"{client}-swap-read-receipt.json",
                        runner=fake_runner,
                        auth_root=self.auth_root,),
                        0,
                    )

    def test_omp_single_line_prompt_is_forced_to_literal_text(self) -> None:
        prompt_path = self.project / ".cap" / "prompts" / "review.md"
        prompt_path.write_text("collision.txt", encoding="utf-8")
        (self.project / "collision.txt").write_text(
            "malicious unlocked prompt", encoding="utf-8"
        )
        profile.create_lock(self.project)
        profile.bind_profile(
            self.project,
            "review",
            self.machine_context_manifest,
            self.machine_context_pin,
            self.binding_dir,
        )

        def fake_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            prompt_index = command.index("--append-system-prompt") + 1
            self.assertEqual(command[prompt_index], "collision.txt\n")
            self.assertNotIn("malicious", command[prompt_index])
            return SimpleNamespace(returncode=0)

        self.assertEqual(
            self.run_client(self.project,
            "omp",
            "review",
            receipt_path=self.root / "omp-literal-prompt-receipt.json",
            runner=fake_runner,
            auth_root=self.auth_root,),
            0,
        )

    def test_missing_or_unknown_profile_never_invokes_client(self) -> None:
        runner = mock.Mock()
        with self.assertRaises(SystemExit) as raised:
            profile.main(
                [
                    "--project",
                    str(self.project),
                    "run",
                    "--client",
                    "codex",
                ]
            )
        self.assertEqual(raised.exception.code, 2)
        with self.assertRaisesRegex(profile.ProfileError, "unknown profile"):
            self.run_client(self.project,
            "codex",
            "missing",
            runner=runner,
            auth_root=self.auth_root,)
        runner.assert_not_called()

    def test_gate_and_lock_failures_never_invoke_client(self) -> None:
        runner = mock.Mock()
        polluted = self.home / ".agents" / "skills"
        polluted.mkdir(parents=True)
        (polluted / "pollution" / "SKILL.md").parent.mkdir()
        (polluted / "pollution" / "SKILL.md").write_text("pollution", encoding="utf-8")
        with self.assertRaisesRegex(
            profile.ProfileError, "active Agent-facing assets lack client evidence"
        ):
            self.run_client(self.project, "codex", "review", runner=runner, auth_root=self.auth_root)
        runner.assert_not_called()

        shutil.rmtree(self.home / ".agents")
        with (self.project / "AGENTS.md").open("a", encoding="utf-8") as stream:
            stream.write("drift")
        with self.assertRaisesRegex(profile.ProfileError, "lock drift"):
            self.run_client(self.project, "codex", "review", runner=runner, auth_root=self.auth_root)
        runner.assert_not_called()

    def test_client_global_pollution_is_rejected_after_process_exit(self) -> None:
        def polluting_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            pollution = self.home / ".agents" / "skills" / "late" / "SKILL.md"
            pollution.parent.mkdir(parents=True)
            pollution.write_text("pollution", encoding="utf-8")
            return SimpleNamespace(returncode=0)

        with self.assertRaisesRegex(
            profile.ProfileError, "active Agent-facing assets lack client evidence"
        ):
            self.run_client(
                self.project,
                "codex",
                "review",
                runner=polluting_runner,
                auth_root=self.auth_root,
            )

    def test_forwarded_capability_overrides_never_invoke_client(self) -> None:
        runner = mock.Mock()
        overrides = (
            ("codex", ("--profile", "unsafe")),
            ("codex", ("-C", "/tmp/unsafe")),
            ("codex", ("-C/tmp/unsafe",)),
            ("codex", ("-p", "unsafe")),
            ("codex", ("-punsafe",)),
            ("codex", ("--cd=/tmp/unsafe",)),
            ("codex", ("-cmodel=unsafe",)),
            ("codex", ("-c=model=unsafe",)),
            ("qoder", ("--mcp-config=/tmp/unsafe.json",)),
            ("qoder", ("-w", "/tmp/unsafe")),
            ("qoder", ("--cwd=/tmp/unsafe",)),
            ("qoder", ("--worktree", "unsafe")),
            ("qoder", ("--worktree=unsafe",)),
            ("qoder", ("-wunsafe",)),
            ("omp", ("--config", "/tmp/unsafe.yml")),
            ("omp", ("--extension=/tmp/unsafe.ts",)),
            ("omp", ("-e/tmp/unsafe.ts",)),
            ("omp", ("--trusted-extension=/tmp/unsafe.ts",)),
            ("omp", ("--trusted-extension", "/tmp/unsafe.ts")),
        )
        for client, arguments in overrides:
            with self.subTest(
                client=client, arguments=arguments
            ), self.assertRaisesRegex(profile.ProfileError, "may override"):
                self.run_client(self.project,
                client,
                "review",
                arguments,
                runner=runner,
                auth_root=self.auth_root,)
        runner.assert_not_called()

    def test_nested_project_root_never_invokes_client(self) -> None:
        parent = self.root / "parent-project"
        subprocess.run(["git", "init", "-q", str(parent)], check=True)
        nested = parent / "nested"
        copy_fixture(nested)
        runner = mock.Mock()
        with self.assertRaisesRegex(
            profile.ProfileError, "must equal the Git worktree root"
        ):
            self.run_client(nested, "codex", "review", runner=runner, auth_root=self.auth_root)
        runner.assert_not_called()

    def test_post_verification_render_drift_never_invokes_client(self) -> None:
        runner = mock.Mock()
        original_verify = profile._verify_lock

        def verify_then_mutate(project: profile.Project, desired: object) -> None:
            original_verify(project, desired)  # type: ignore[arg-type]
            skill = (
                project.root
                / ".cap"
                / "capabilities"
                / "skills"
                / "review-skill"
                / "SKILL.md"
            )
            skill.write_text(
                skill.read_text(encoding="utf-8") + "\ndrift\n", encoding="utf-8"
            )

        with mock.patch.object(
            profile, "_verify_lock", side_effect=verify_then_mutate
        ), self.assertRaisesRegex(
            profile.ProfileError, "drifted after lock verification"
        ):
            self.run_client(self.project,
            "codex",
            "review",
            runner=runner,
            auth_root=self.auth_root,)
        runner.assert_not_called()

    def test_final_input_and_project_bypass_gates_never_invoke_client(self) -> None:
        mutations = (
            (
                "locked inputs drifted",
                lambda project: (project / "AGENTS.md").write_text(
                    "changed after launch preparation\n",
                    encoding="utf-8",
                ),
            ),
            (
                "project capability bypass",
                lambda project: (
                    (project / ".codex").mkdir(),
                    (project / ".codex" / "AGENTS.md").write_text(
                        "late bypass\n",
                        encoding="utf-8",
                    ),
                ),
            ),
        )
        original_build = profile.build_launch
        for index, (message, mutate) in enumerate(mutations):
            with self.subTest(message=message):
                project = self.root / f"final-gate-{index}"
                copy_fixture(project)
                subprocess.run(["git", "init", "-q", str(project)], check=True)
                receipt = self.root / f"final-gate-{index}.json"
                runner = mock.Mock()

                def build_then_mutate(
                    *args: object,
                    mutate=mutate,
                    project=project,
                    **kwargs: object,
                ) -> profile.LaunchSpec:
                    spec = original_build(*args, **kwargs)  # type: ignore[arg-type]
                    mutate(project)
                    return spec

                with mock.patch.object(
                    profile,
                    "build_launch",
                    side_effect=build_then_mutate,
                ), self.assertRaisesRegex(profile.ProfileError, message):
                    self.run_client(project,
                    "codex",
                    "review",
                    receipt_path=receipt,
                    runner=runner,
                    auth_root=self.auth_root,)
                runner.assert_not_called()
                self.assertFalse(receipt.exists())

    def test_ambient_qoder_working_directory_cannot_override_project_cwd(self) -> None:
        def fake_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            self.assertEqual(kwargs["cwd"], str(self.project))
            self.assertNotIn("QODER_WORKING_DIR", kwargs["env"])  # type: ignore[operator]
            return SimpleNamespace(returncode=0)

        with mock.patch.dict(
            os.environ,
            {"QODER_WORKING_DIR": "/tmp/unsafe"},
        ):
            self.assertEqual(
                self.run_client(self.project,
                "qoder",
                "review",
                receipt_path=self.root / "qoder-cwd-receipt.json",
                runner=fake_runner,
                auth_root=self.auth_root,),
                0,
            )

    def test_project_dotenv_cannot_override_omp_isolation(self) -> None:
        (self.project / ".env").write_text(
            "OMP_PROFILE=unsafe\nPI_PROFILE=unsafe\nPI_CONFIG_FILES=/tmp/unsafe.yml\n",
            encoding="utf-8",
        )

        def fake_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            environment = kwargs["env"]
            self.assertEqual(environment["OMP_PROFILE"], "default")  # type: ignore[index]
            self.assertEqual(environment["PI_PROFILE"], "default")  # type: ignore[index]
            agent_dir = Path(environment["PI_CODING_AGENT_DIR"])  # type: ignore[index]
            self.assertEqual(  # type: ignore[index]
                environment["PI_CONFIG_FILES"],
                str(agent_dir / "config.yml"),
            )
            # PI_CONFIG_DIR names the same directory, but relative to the home:
            # the client joins it with the home itself.
            self.assertEqual(
                Path.home().absolute() / environment["PI_CONFIG_DIR"],  # type: ignore[index]
                agent_dir,
            )
            return SimpleNamespace(returncode=0)

        self.assertEqual(
            self.run_client(self.project,
            "omp",
            "review",
            receipt_path=self.root / "dotenv-receipt.json",
            runner=fake_runner,
            auth_root=self.auth_root,),
            0,
        )

    def test_symlink_receipt_parent_never_invokes_client(self) -> None:
        target = self.root / "receipts"
        nested_target = target / "nested"
        nested_target.mkdir(parents=True)
        linked_parent = self.root / "receipt-link"
        linked_parent.symlink_to(target, target_is_directory=True)
        runner = mock.Mock()
        with self.assertRaisesRegex(profile.ProfileError, "non-symlink directory"):
            self.run_client(self.project,
            "codex",
            "review",
            receipt_path=linked_parent / "nested" / "receipt.json",
            runner=runner,
            auth_root=self.auth_root,)
        runner.assert_not_called()
        self.assertEqual(list(nested_target.iterdir()), [])

    def test_symlink_receipt_target_never_invokes_client(self) -> None:
        sink = self.root / "existing-receipt-sink.txt"
        sink.write_text("unchanged", encoding="utf-8")
        receipt = self.root / "receipt-link.json"
        receipt.symlink_to(sink)
        runner = mock.Mock()
        with self.assertRaisesRegex(profile.ProfileError, "already exists"):
            self.run_client(self.project,
            "codex",
            "review",
            receipt_path=receipt,
            runner=runner,
            auth_root=self.auth_root,)
        runner.assert_not_called()
        self.assertEqual(sink.read_text(encoding="utf-8"), "unchanged")

    def test_concurrent_launches_cannot_clobber_one_receipt(self) -> None:
        receipt = self.root / "shared-receipt.json"
        started = threading.Event()
        release = threading.Event()
        runner_calls: list[int] = []

        def slow_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            runner_calls.append(1)
            started.set()
            if not release.wait(5):
                raise AssertionError("test did not release the reserved receipt")
            return SimpleNamespace(returncode=0)

        with ThreadPoolExecutor(max_workers=2) as executor:
            winner = executor.submit(
                self.run_client,
                self.project,
                "codex",
                "review",
                (),
                receipt_path=receipt,
                runner=slow_runner,
                auth_root=self.auth_root,
            )
            self.assertTrue(started.wait(5))
            losing_runner = mock.Mock()
            try:
                with self.assertRaisesRegex(profile.ProfileError, "already exists"):
                    self.run_client(self.project,
                    "codex",
                    "review",
                    receipt_path=receipt,
                    runner=losing_runner,
                    auth_root=self.auth_root,)
            finally:
                release.set()
            self.assertEqual(winner.result(), 0)
        losing_runner.assert_not_called()
        self.assertEqual(runner_calls, [1])
        self.assertEqual(
            json.loads(receipt.read_text(encoding="utf-8"))["profile"], "review"
        )

    def test_reserved_receipt_target_cannot_be_redirected(self) -> None:
        receipt = self.root / "redirected-receipt.json"
        sink = self.root / "receipt-sink.txt"
        sink.write_text("unchanged", encoding="utf-8")

        def replacing_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            receipt.unlink()
            receipt.symlink_to(sink)
            return SimpleNamespace(returncode=0)

        with self.assertRaisesRegex(profile.ProfileError, "target changed"):
            self.run_client(self.project,
            "codex",
            "review",
            receipt_path=receipt,
            runner=replacing_runner,
            auth_root=self.auth_root,)
        self.assertEqual(sink.read_text(encoding="utf-8"), "unchanged")
        self.assertTrue(receipt.is_symlink())

    def test_reserved_receipt_parent_cannot_be_redirected(self) -> None:
        parent = self.root / "stable-receipt-parent"
        parent.mkdir()
        receipt = parent / "receipt.json"
        moved_parent = self.root / "moved-receipt-parent"
        redirect = self.root / "redirect-target"
        redirect.mkdir()

        def replacing_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            parent.rename(moved_parent)
            parent.symlink_to(redirect, target_is_directory=True)
            return SimpleNamespace(returncode=0)

        with self.assertRaisesRegex(profile.ProfileError, "parent changed"):
            self.run_client(self.project,
            "codex",
            "review",
            receipt_path=receipt,
            runner=replacing_runner,
            auth_root=self.auth_root,)
        self.assertFalse((redirect / "receipt.json").exists())
        # Known boundary (design D8): once the parent is renamed away, the empty
        # reservation can no longer be named, so it is left behind. It must stay
        # empty - a reservation that never received content is not a receipt.
        orphan = moved_parent / "receipt.json"
        if orphan.exists():
            self.assertEqual(orphan.read_bytes(), b"")

    def test_reserved_receipt_hard_link_alias_is_rejected(self) -> None:
        receipt = self.root / "hard-link-receipt.json"
        alias = self.root / "receipt-alias.json"

        def linking_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            os.link(receipt, alias)
            return SimpleNamespace(returncode=0)

        with self.assertRaisesRegex(profile.ProfileError, "hard-link alias"):
            self.run_client(self.project,
            "codex",
            "review",
            receipt_path=receipt,
            runner=linking_runner,
            auth_root=self.auth_root,)
        self.assertFalse(receipt.exists())
        self.assertEqual(alias.read_bytes(), b"")

    def test_runner_exception_removes_reserved_receipt(self) -> None:
        receipt = self.root / "failed-receipt.json"
        runner = mock.Mock(side_effect=RuntimeError("runner failed"))
        with self.assertRaisesRegex(RuntimeError, "runner failed"):
            self.run_client(self.project,
            "codex",
            "review",
            receipt_path=receipt,
            runner=runner,
            auth_root=self.auth_root,)
        self.assertFalse(os.path.lexists(receipt))


class ObserverContractTests(ProfileTestCase):
    def setUp(self) -> None:
        super().setUp()
        subprocess.run(["git", "init", "-q", str(self.project)], check=True)

    def state_directory(self, name: str) -> Path:
        """Create one explicit immutable observation directory."""

        state = self.root / name
        state.mkdir()
        return state

    def test_observer_redacts_auth_token_and_canonical_root_alias(self) -> None:
        state = self.state_directory("auth-redaction-state")
        token = (self.auth_root / "omp" / "token").read_text(encoding="utf-8")
        alias_text = str(self.auth_root).replace("/private/var/", "/var/", 1)
        auth_alias = Path(alias_text)

        def leaking_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(
                returncode=0,
                stdout=(
                    f"SKILLS-AVAILABLE: {token}\n"
                    "MCP-AVAILABLE: unknown\n"
                    f"CONTEXT-FILES: {self.auth_root}/omp/token\n"
                    "HOOKS-AVAILABLE: unknown\n"
                    "PLUGINS-AVAILABLE: unknown\n"
                ),
                stderr="",
            )

        self.run_observed(self.project,
        "omp",
        "review",
        state,
        auth_root=auth_alias,
        runner=leaking_runner,)
        evidence = "\n".join(
            path.read_text(encoding="utf-8")
            for path in state.iterdir()
            if path.is_file()
        )
        self.assertNotIn(token, evidence)
        self.assertNotIn(str(self.auth_root), evidence)
        self.assertNotIn(str(auth_alias), evidence)

    def test_probe_uses_locked_render_tree_and_keeps_unknown_distinct(self) -> None:
        state = self.state_directory("probe-state")
        result = self.probe_profile(self.project, "omp", "review", state)
        self.assertEqual(result["observed"]["skills"], ["review-skill"])
        self.assertEqual(result["observed"]["mcps"], ["review-mcp"])
        self.assertIsNone(result["observed"]["context"])
        self.assertIsNone(result["observed"]["hooks"])
        self.assertIsNone(result["observed"]["plugins"])
        self.assertEqual(result["staged"]["hooks"], ["review-hook"])
        self.assertEqual(result["staged"]["plugins"], ["review-plugin"])
        self.assertTrue((state / "declared.json").is_file())
        self.assertTrue((state / "probed.json").is_file())
        self.assertFalse((state / "effective.json").exists())

    def test_codex_probe_accepts_a_profile_with_no_mcp_servers(self) -> None:
        profile_path = self.project / ".cap" / "profiles" / "review.toml"
        original = profile_path.read_text(encoding="utf-8")
        updated = original.replace('allow = ["review-mcp"]', "allow = []", 1)
        self.assertNotEqual(updated, original)
        profile_path.write_text(updated, encoding="utf-8")
        (self.project / ".cap" / "capabilities" / "mcp" / "review-mcp.json").unlink()
        profile.create_lock(self.project)
        profile.bind_profile(
            self.project,
            "review",
            self.machine_context_manifest,
            self.machine_context_pin,
            self.binding_dir,
        )

        state = self.state_directory("empty-codex-mcp-state")
        result = self.probe_profile(self.project, "codex", "review", state)
        self.assertEqual(result["observed"]["mcps"], [])

    def test_report_parser_does_not_turn_unknown_into_observed_none(self) -> None:
        self.assertIsNone(
            profile.parse_reported("SKILLS-AVAILABLE: unknown", "SKILLS-AVAILABLE")
        )
        self.assertEqual(
            profile.parse_reported("SKILLS-AVAILABLE: none", "SKILLS-AVAILABLE"), []
        )
        self.assertIsNone(profile.parse_reported("no marker", "SKILLS-AVAILABLE"))
        self.assertEqual(
            profile.parse_reported(
                "SKILLS-AVAILABLE: review-skill", "SKILLS-AVAILABLE"
            ),
            ["review-skill"],
        )
        self.assertEqual(
            profile.parse_reported("SKILLS-AVAILABLE: name1", "SKILLS-AVAILABLE"),
            ["name1"],
        )
        self.assertEqual(
            profile.parse_reported(
                "SKILLS-AVAILABLE: name1, name2", "SKILLS-AVAILABLE"
            ),
            ["name1", "name2"],
        )

    def test_diff_rejects_fifo_state_file_without_blocking(self) -> None:
        state = self.state_directory("fifo-state")
        os.mkfifo(state / "declared.json")
        with self.assertRaisesRegex(profile.ProfileError, "private regular file"):
            self.diff_profile(self.project, "codex", "review", state)

    def test_run_and_diff_report_unknown_instead_of_silent_success(self) -> None:
        state = self.state_directory("unknown-state")

        def fake_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(
                returncode=0,
                stdout=(
                    "SKILLS-AVAILABLE: review-skill\n"
                    "MCP-AVAILABLE: review-mcp\n"
                    "CONTEXT-FILES: unknown\n"
                    "HOOKS-AVAILABLE: unknown\n"
                    "PLUGINS-AVAILABLE: unknown\n"
                ),
                stderr="",
            )

        self.assertEqual(
            self.run_observed(self.project,
            "codex",
            "review",
            state,
            ("exec", "observe"),
            runner=fake_runner,
            auth_root=self.auth_root,),
            0,
        )
        effective = json.loads((state / "effective.json").read_text(encoding="utf-8"))
        self.assertIsNone(effective["observed"]["context"])
        self.assertIsNone(effective["observed"]["mcps"])
        self.assertEqual(effective["reported_client_limited"]["mcps"], ["review-mcp"])
        self.assertEqual(
            self.diff_profile(self.project, "codex", "review", state), 2
        )

    def test_observed_none_is_drift_when_declaration_is_nonempty(self) -> None:
        state = self.state_directory("none-state")

        def fake_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(
                returncode=0,
                stdout=(
                    "SKILLS-AVAILABLE: none\n"
                    "MCP-AVAILABLE: none\n"
                    "CONTEXT-FILES: none\n"
                    "HOOKS-AVAILABLE: none\n"
                    "PLUGINS-AVAILABLE: none\n"
                ),
                stderr="",
            )

        self.run_observed(self.project,
        "qoder",
        "review",
        state,
        ("-p", "observe"),
        runner=fake_runner,
        auth_root=self.auth_root,)
        effective = json.loads((state / "effective.json").read_text(encoding="utf-8"))
        self.assertEqual(effective["observed"]["skills"], [])
        self.assertIsNone(effective["observed"]["hooks"])
        self.assertEqual(effective["reported_opaque_staging"]["hooks"], [])
        self.assertEqual(
            self.diff_profile(self.project, "qoder", "review", state), 1
        )

    def test_concurrent_observed_profiles_have_independent_roots_outputs_and_receipts(
        self,
    ) -> None:
        review_state = self.state_directory("review-state")
        implementation_state = self.state_directory("implementation-state")
        runtime_roots: dict[str, Path] = {}

        def observed(profile_name: str, state: Path) -> int:
            def fake_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
                runtime_root = Path(str(kwargs["env"]["QODER_CONFIG_DIR"]))  # type: ignore[index]
                runtime_roots[profile_name] = runtime_root
                skill = f"{profile_name}-skill"
                self.assertTrue(
                    (runtime_root / "skills" / skill / "SKILL.md").is_file()
                )
                other = "implementation" if profile_name == "review" else "review"
                self.assertFalse((runtime_root / "skills" / f"{other}-skill").exists())
                return SimpleNamespace(
                    returncode=0,
                    stdout=(
                        f"SKILLS-AVAILABLE: {skill}\n"
                        f"MCP-AVAILABLE: {profile_name}-mcp\n"
                        "CONTEXT-FILES: unknown\n"
                        "HOOKS-AVAILABLE: unknown\n"
                        "PLUGINS-AVAILABLE: unknown\n"
                    ),
                    stderr="",
                )

            return self.run_observed(self.project,
            "qoder",
            profile_name,
            state,
            ("-p", "observe"),
            runner=fake_runner,
            auth_root=self.auth_root,)

        with ThreadPoolExecutor(max_workers=2) as executor:
            review_future = executor.submit(observed, "review", review_state)
            implementation_future = executor.submit(
                observed, "implementation", implementation_state
            )
        self.assertEqual(review_future.result(), 0)
        self.assertEqual(implementation_future.result(), 0)
        self.assertNotEqual(runtime_roots["review"], runtime_roots["implementation"])
        self.assertFalse(runtime_roots["review"].exists())
        self.assertFalse(runtime_roots["implementation"].exists())
        review_receipt = json.loads(
            (review_state / "receipt.json").read_text(encoding="utf-8")
        )
        implementation_receipt = json.loads(
            (implementation_state / "receipt.json").read_text(encoding="utf-8")
        )
        self.assertEqual(review_receipt["profile"], "review")
        self.assertEqual(implementation_receipt["profile"], "implementation")
        self.assertNotEqual(
            review_receipt["output_tree_hash"],
            implementation_receipt["output_tree_hash"],
        )

    def test_observed_state_swap_cannot_redirect_evidence(self) -> None:
        state = self.state_directory("stable-state")
        moved = self.root / "moved-state"
        redirect = self.root / "redirect-state"
        redirect.mkdir()

        def replacing_runner(command: list[str], **kwargs: object) -> SimpleNamespace:
            state.rename(moved)
            state.symlink_to(redirect, target_is_directory=True)
            return SimpleNamespace(
                returncode=0,
                stdout="SKILLS-AVAILABLE: review-skill\n",
                stderr="",
            )

        with self.assertRaisesRegex(profile.ProfileError, "stable directory changed"):
            self.run_observed(self.project,
            "qoder",
            "review",
            state,
            ("-p", "observe"),
            runner=replacing_runner,
            auth_root=self.auth_root,)
        self.assertEqual(list(redirect.iterdir()), [])
        # Known boundary (design D8): see the receipt reservation test above.
        orphan = moved / "receipt.json"
        if orphan.exists():
            self.assertEqual(orphan.read_bytes(), b"")


class CanonicalModeTests(ProfileTestCase):
    """Guard the portability of every mode recorded into lock and tree hashes."""

    def test_canonical_mode_ignores_actual_permission_bits(self) -> None:
        target = self.project / "AGENTS.md"
        observed = set()
        for bits in (0o644, 0o600, 0o755, 0o777):
            try:
                target.chmod(bits)
            except (OSError, NotImplementedError):
                continue
            observed.add(profile._canonical_mode(target))
        self.assertEqual(observed, {0o644})

    def test_input_records_do_not_change_when_permissions_change(self) -> None:
        project = profile.load_project(self.project)
        before = profile._input_records(project)

        changed = False
        for relative, record in before.items():
            if record.get("type") != "file":
                continue
            try:
                (self.project / relative).chmod(0o777)
                changed = True
            except (OSError, NotImplementedError):
                pass
        if not changed:
            self.skipTest("host does not support chmod")

        self.assertEqual(profile._input_records(project), before)

    def test_render_tree_mode_is_constant_across_permissions(self) -> None:
        project = profile.load_project(self.project)
        selected = profile._select_profile(project, "review")
        before = profile._tree_hash(profile._render_tree(project, "omp", selected))

        skills = self.project / ".cap" / "capabilities" / "skills"
        changed = False
        for source in skills.rglob("*"):
            if source.is_file():
                try:
                    source.chmod(0o777)
                    changed = True
                except (OSError, NotImplementedError):
                    pass
        if not changed:
            self.skipTest("host does not support chmod")

        after = profile._tree_hash(profile._render_tree(project, "omp", selected))
        self.assertEqual(after, before)


class DeclaredSkillsAreRenderedTests(ProfileTestCase):
    """A declared skill must actually contribute files to every client render."""

    def test_every_declared_skill_is_rendered_for_every_client(self) -> None:
        project = profile.load_project(self.project)
        for name in sorted(project.profiles):
            selected = profile._select_profile(project, name)
            for client in profile.CLIENTS:
                tree = profile._render_tree(project, client, selected)
                rendered = {
                    path.split("/")[1]
                    for path in tree
                    if path.startswith("skills/")
                }
                self.assertEqual(
                    rendered,
                    set(selected.skills),
                    f"{name}/{client} rendered {sorted(rendered)}",
                )

    def test_declared_skill_with_no_files_fails_closed(self) -> None:
        project = profile.load_project(self.project)
        name = min(project.profiles)
        selected = profile._select_profile(project, name)
        if not selected.skills:
            self.skipTest("fixture profile declares no skills")

        skill = selected.skills[0]
        source_root = selected.origins["skills"][skill]
        for path in sorted(source_root.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()

        with self.assertRaisesRegex(profile.ProfileError, "rendered no files"):
            profile._render_tree(project, "omp", selected)
class PortableDirectoryTests(ProfileTestCase):
    """Component verification and the credential-privacy conclusion on any host."""

    def test_plain_directory_is_accepted(self) -> None:
        target = self.root / "plain"
        target.mkdir()
        directory = profile._open_stable_directory(target, "test directory")
        self.assertEqual(directory.path, target)
        self.assertEqual(len(directory.identities), len(target.parts))

    def test_missing_directory_is_rejected(self) -> None:
        with self.assertRaisesRegex(
            profile.ProfileError, "existing non-symlink directory"
        ):
            profile._open_stable_directory(self.root / "absent", "test directory")

    def test_replaced_directory_is_detected(self) -> None:
        target = self.root / "swapped"
        target.mkdir()
        directory = profile._open_stable_directory(target, "test directory")
        target.rename(self.root / "moved-away")
        (self.root / "swapped").mkdir()
        with self.assertRaisesRegex(profile.ProfileError, "stable directory changed"):
            profile._validate_stable_directory(directory)

    def test_removed_directory_is_detected(self) -> None:
        target = self.root / "removed"
        target.mkdir()
        directory = profile._open_stable_directory(target, "test directory")
        target.rmdir()
        with self.assertRaisesRegex(
            profile.ProfileError, "stable directory is no longer accessible"
        ):
            profile._validate_stable_directory(directory)

    def test_link_component_is_rejected(self) -> None:
        real = self.root / "real-target"
        real.mkdir()
        link = self.root / "link-to-real"
        try:
            link.symlink_to(real, target_is_directory=True)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"this host cannot create directory links: {error}")
        with self.assertRaisesRegex(
            profile.ProfileError, "existing non-symlink directory"
        ):
            profile._open_stable_directory(link, "test directory")

    def test_link_component_predicate_matches_lstat(self) -> None:
        real = self.root / "predicate-target"
        real.mkdir()
        self.assertFalse(profile._is_link_component(os.lstat(real)))
        link = self.root / "predicate-link"
        try:
            link.symlink_to(real, target_is_directory=True)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"this host cannot create directory links: {error}")
        self.assertTrue(profile._is_link_component(os.lstat(link)))

    @unittest.skipUnless(os.name == "nt", "junctions only exist on Windows")
    def test_junction_component_is_rejected(self) -> None:
        real = self.root / "junction-target"
        real.mkdir()
        link = self.root / "junction-link"
        completed = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(real)],
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            self.skipTest("this host cannot create junctions")
        self.assertTrue(profile._is_link_component(os.lstat(link)))
        with self.assertRaisesRegex(
            profile.ProfileError, "existing non-symlink directory"
        ):
            profile._open_stable_directory(link, "test directory")

    def test_directory_below_the_user_home_is_accepted(self) -> None:
        # Windows puts every temporary root under %LOCALAPPDATA%\\Temp, which lives
        # inside the user home. Only the home itself, the project and the native
        # capability roots are off limits; anything below the home is fine.
        below_home = self.home / "AppData" / "Local" / "Temp" / "cap-render"
        below_home.mkdir(parents=True)
        project = profile.load_project(self.project)
        directory = profile._open_stable_directory(below_home, "render output")
        profile._require_external_directory(project, directory, "render output")

    def test_the_user_home_itself_is_rejected(self) -> None:
        # The guard reads the real home through Path.home(), which resolves from
        # USERPROFILE on Windows, so patching HOME in the environment is not
        # enough to redirect it here.
        project = profile.load_project(self.project)
        directory = profile._open_stable_directory(self.home, "render output")
        with mock.patch.object(
            profile.Path, "home", return_value=self.home
        ), self.assertRaisesRegex(
            profile.ProfileError, "outside global capability roots"
        ):
            profile._require_external_directory(project, directory, "render output")

    def test_target_paths_beyond_the_host_limit_fail_legibly(self) -> None:
        # knowledge/windows-agent-ops.md fixes the policy: keep paths within what
        # the weakest consumer accepts, do not turn on the machine long-path
        # setting. So the contract here is only that exceeding the host limit
        # surfaces as a ProfileError naming the operation, never a raw OSError.
        target = self.root / "limit-probe"
        target.mkdir()
        directory = profile._open_stable_directory(target, "render output")
        tree = {"config.yml": profile.RenderedFile(b"{}\n")}
        with mock.patch.object(
            profile, "_publish_staged_entry", side_effect=OSError("path too long")
        ), self.assertRaisesRegex(
            profile.ProfileError, "could not materialize tree"
        ):
            profile._materialize_tree(directory, tree)

    def test_credential_privacy_conclusion_follows_host_expressiveness(self) -> None:
        with mock.patch.object(
            profile, "_private_checks_are_expressible", return_value=True
        ):
            self.assertEqual(profile._credential_privacy_evidence(), "checked")
        with mock.patch.object(
            profile, "_private_checks_are_expressible", return_value=False
        ):
            self.assertEqual(profile._credential_privacy_evidence(), "unknown")

    def test_unexpressible_privacy_never_blocks_a_private_directory(self) -> None:
        directory = profile._open_stable_directory(self.auth_root, "auth root")
        with mock.patch.object(
            profile, "_private_checks_are_expressible", return_value=False
        ):
            profile._validate_private_directory(directory, "auth root")

    def test_staged_tree_reaches_the_target(self) -> None:
        target = self.root / "staged-output"
        target.mkdir()
        directory = profile._open_stable_directory(target, "render output")
        tree = {
            "config.yml": profile.RenderedFile(b"{}\n"),
            "skills/demo/SKILL.md": profile.RenderedFile(b"demo\n"),
        }
        profile._materialize_tree(directory, tree)
        self.assertEqual((target / "config.yml").read_bytes(), b"{}\n")
        self.assertEqual(
            (target / "skills" / "demo" / "SKILL.md").read_bytes(), b"demo\n"
        )

    def test_staging_never_leaves_a_partial_tree_in_the_target(self) -> None:
        target = self.root / "failing-output"
        target.mkdir()
        directory = profile._open_stable_directory(target, "render output")
        tree = {
            "config.yml": profile.RenderedFile(b"{}\n"),
            "skills/demo/SKILL.md": profile.RenderedFile(b"demo\n"),
        }
        with mock.patch.object(
            profile, "_publish_staged_entry", side_effect=OSError("publish failed")
        ), self.assertRaisesRegex(profile.ProfileError, "materialize"):
            profile._materialize_tree(directory, tree)
        self.assertEqual(list(target.iterdir()), [])


class RegisteredClientMustHaveAdapterTests(ProfileTestCase):
    """A client in CLIENTS but without an adapter must fail closed, not fall back.

    Every client dispatch used to end in a bare `else` that handled OMP. Adding a
    new client to CLIENTS would therefore silently give it OMP's renderer, launch
    command, MCP reader and auth staging, and the whole suite would still pass.
    """

    CLIENT = "unimplemented"

    def setUp(self) -> None:
        super().setUp()
        self.registered = mock.patch.object(
            profile, "CLIENTS", (*profile.CLIENTS, self.CLIENT)
        )
        self.registered.start()
        self.addCleanup(self.registered.stop)
        executables = dict(profile.CLIENT_EXECUTABLES)
        executables[self.CLIENT] = self.CLIENT
        self.executables = mock.patch.object(
            profile, "CLIENT_EXECUTABLES", executables
        )
        self.executables.start()
        self.addCleanup(self.executables.stop)

    def test_render_tree_has_no_renderer(self) -> None:
        project = profile.load_project(self.project)
        selected = profile._select_profile(project, min(project.profiles))
        with self.assertRaisesRegex(profile.ProfileError, "has no renderer"):
            profile._render_tree(project, self.CLIENT, selected)

    def test_forwarded_args_policy_is_required(self) -> None:
        with self.assertRaisesRegex(
            profile.ProfileError, "has no forwarded-argument policy"
        ):
            profile._validate_forwarded_args(self.CLIENT, ())

    def test_forwarded_args_prefix_policy_is_required(self) -> None:
        forbidden = dict(profile.FORBIDDEN_CLIENT_ARGUMENTS)
        forbidden[self.CLIENT] = frozenset()
        with mock.patch.object(
            profile, "FORBIDDEN_CLIENT_ARGUMENTS", forbidden
        ), self.assertRaisesRegex(
            profile.ProfileError, "has no forwarded-argument policy"
        ):
            profile._validate_forwarded_args(self.CLIENT, ())

    def test_build_launch_has_no_launch_adapter(self) -> None:
        project = profile.load_project(self.project)
        selected = profile._select_profile(project, min(project.profiles))
        tree = profile._render_tree(project, "omp", selected)
        forbidden = dict(profile.FORBIDDEN_CLIENT_ARGUMENTS)
        forbidden[self.CLIENT] = frozenset()
        prefixes = dict(profile.FORBIDDEN_CLIENT_ARGUMENT_PREFIXES)
        prefixes[self.CLIENT] = ()
        with (
            mock.patch.object(profile, "FORBIDDEN_CLIENT_ARGUMENTS", forbidden),
            mock.patch.object(
                profile, "FORBIDDEN_CLIENT_ARGUMENT_PREFIXES", prefixes
            ),
            self.assertRaisesRegex(profile.ProfileError, "has no launch adapter"),
        ):
            profile.build_launch(self.CLIENT, self.root / "runtime", tree)

    def test_configured_mcp_names_has_no_reader(self) -> None:
        project = profile.load_project(self.project)
        selected = profile._select_profile(project, min(project.profiles))
        tree = profile._render_tree(project, "omp", selected)
        with self.assertRaisesRegex(profile.ProfileError, "has no MCP reader"):
            profile._configured_mcp_names(tree, self.CLIENT)


class PerClientAdapterVersionTests(ProfileTestCase):
    """Adapter versions must be per client, and OMP's must stay pinned.

    The value reaches `effective_render_hash` through the lock and each
    adapter's source context. A single shared int meant that bumping any one
    client's adapter invalidated every other client's cached generations.
    """

    def test_omp_adapter_version_is_pinned(self) -> None:
        # Existing generations under renders/omp/ were computed with 8.
        self.assertEqual(profile.CLIENT_ADAPTER_VERSION["omp"], 8)

    def test_bumping_one_client_does_not_change_another(self) -> None:
        project = profile.load_project(self.project)
        before = profile._desired_lock(project)["clients"]["omp"]

        bumped = dict(profile.CLIENT_ADAPTER_VERSION)
        bumped["codex"] = bumped["codex"] + 1
        with mock.patch.object(profile, "CLIENT_ADAPTER_VERSION", bumped):
            after = profile._desired_lock(project)
        self.assertEqual(after["clients"]["omp"], before)
        self.assertNotEqual(
            after["clients"]["codex"]["adapter_version"],
            before["adapter_version"],
        )

    def test_unregistered_client_has_no_adapter_version(self) -> None:
        with self.assertRaisesRegex(
            profile.ProfileError, "has no adapter version"
        ):
            profile._client_adapter_version("unimplemented")


class MultiClientRuntimeTests(ProfileTestCase):
    """manifest.runtime and profile.runtime must accept more than one client.

    v3 pinned both to exactly {"omp"}, which blocks declaring a runtime policy
    for any second client and therefore blocks every future adapter.
    """

    def _write_policy(self, client: str, declared: str | None = None) -> str:
        relative = f".cap/runtime/{client}.toml"
        path = self.project / relative
        lines = [
            "version = 1",
            f'client = "{declared or client}"',
            "",
            "[policy]",
            "",
        ]
        path.write_text("\n".join(lines), encoding="utf-8")
        return relative

    def _set_manifest_runtime(self, entries: dict[str, str]) -> None:
        path = self.project / ".cap" / "manifest.toml"
        text = path.read_text(encoding="utf-8")
        rows = [f'{name} = "{value}"' for name, value in sorted(entries.items())]
        block = "\n".join(["[runtime]", *rows, "", ""])
        start = text.index("[runtime]")
        end = text.index("[profiles]", start)
        path.write_text(text[:start] + block + text[end:], encoding="utf-8")

    def _add_profile_runtime(self, client: str) -> None:
        for name in ("implementation", "review"):
            path = self.project / ".cap" / "profiles" / f"{name}.toml"
            text = path.read_text(encoding="utf-8")
            replaced = text.replace(
                'runtime = { omp = "default" }',
                'runtime = { omp = "default", ' + client + ' = "default" }',
            )
            self.assertNotEqual(replaced, text, f"{name} runtime not rewritten")
            path.write_text(replaced, encoding="utf-8")

    def test_single_client_manifest_still_loads(self) -> None:
        project = profile.load_project(self.project)
        self.assertEqual(sorted(project.runtime_policies), ["omp"])

    def test_two_clients_are_accepted(self) -> None:
        relative = self._write_policy("codex")
        self._set_manifest_runtime(
            {"omp": ".cap/runtime/omp.toml", "codex": relative}
        )
        self._add_profile_runtime("codex")

        project = profile.load_project(self.project)
        self.assertEqual(sorted(project.runtime_policies), ["codex", "omp"])
        selected = profile._select_profile(project, "review")
        self.assertEqual(sorted(selected.runtime), ["codex", "omp"])

    def test_every_declared_policy_enters_the_lock_inputs(self) -> None:
        relative = self._write_policy("codex")
        self._set_manifest_runtime(
            {"omp": ".cap/runtime/omp.toml", "codex": relative}
        )
        self._add_profile_runtime("codex")

        project = profile.load_project(self.project)
        inputs = profile._desired_lock(project)["inputs"]
        self.assertIn(relative, inputs)
        self.assertIn(".cap/runtime/omp.toml", inputs)

    def test_unknown_client_is_rejected(self) -> None:
        self._set_manifest_runtime({"nonesuch": ".cap/runtime/omp.toml"})
        with self.assertRaisesRegex(profile.ProfileError, "unknown clients"):
            profile.load_project(self.project)

    def test_empty_runtime_table_is_rejected(self) -> None:
        self._set_manifest_runtime({})
        with self.assertRaisesRegex(profile.ProfileError, "at least one client"):
            profile.load_project(self.project)

    def test_policy_client_must_match_its_key(self) -> None:
        relative = self._write_policy("codex", declared="omp")
        self._set_manifest_runtime(
            {"omp": ".cap/runtime/omp.toml", "codex": relative}
        )
        self._add_profile_runtime("codex")
        with self.assertRaisesRegex(profile.ProfileError, "must target codex"):
            profile.load_project(self.project)

    def test_profile_runtime_rejects_unknown_client(self) -> None:
        for name in ("implementation", "review"):
            path = self.project / ".cap" / "profiles" / f"{name}.toml"
            text = path.read_text(encoding="utf-8")
            path.write_text(
                text.replace(
                    'runtime = { omp = "default" }',
                    'runtime = { omp = "default", nonesuch = "default" }',
                ),
                encoding="utf-8",
            )
        with self.assertRaisesRegex(profile.ProfileError, "unknown clients"):
            profile.load_project(self.project)


class ClaudeClientRegistrationTests(ProfileTestCase):
    """Claude is registered as a renderable client, but not yet launchable."""

    def test_client_tuples_agree_across_modules(self) -> None:
        from agent_system.cap import config as cap_config

        self.assertEqual(tuple(cap_config.CLIENTS), tuple(profile.CLIENTS))

    def test_claude_is_registered_and_renderable(self) -> None:
        self.assertIn("claude", profile.CLIENTS)
        self.assertEqual(profile.CLIENT_EXECUTABLES["claude"], "claude")
        self.assertEqual(profile._client_adapter_version("claude"), 1)

    def test_claude_render_tree_shape(self) -> None:
        project = profile.load_project(self.project)
        selected = profile._select_profile(project, "review")
        tree = profile._render_tree(project, "claude", selected)

        top_level = sorted(path for path in tree if "/" not in path)
        self.assertEqual(
            top_level, ["claude-config.yaml", "mcp.json", "system-prompt.md"]
        )
        # The CAP-side intermediate stays empty in the portable render.
        self.assertEqual(tree["claude-config.yaml"].content, b"{}\n")
        rendered_skills = {
            path.split("/")[1] for path in tree if path.startswith("skills/")
        }
        self.assertEqual(rendered_skills, set(selected.skills))

    def test_claude_render_is_deterministic(self) -> None:
        project = profile.load_project(self.project)
        selected = profile._select_profile(project, "review")
        first = profile._tree_hash(profile._render_tree(project, "claude", selected))
        second = profile._tree_hash(profile._render_tree(project, "claude", selected))
        self.assertEqual(first, second)

    def test_claude_mcp_names_are_readable(self) -> None:
        project = profile.load_project(self.project)
        selected = profile._select_profile(project, "review")
        tree = profile._render_tree(project, "claude", selected)
        self.assertEqual(
            profile._configured_mcp_names(tree, "claude"),
            sorted(selected.mcps),
        )

    def test_claude_forbids_arguments_that_reopen_closed_gates(self) -> None:
        for argument in (
            "--settings",
            "--setting-sources",
            "--mcp-config",
            "--strict-mcp-config",
            "--plugin-dir",
            "--plugin-url",
            "--agents",
            "--add-dir",
            "--permission-mode",
            "--dangerously-skip-permissions",
            "--system-prompt",
            "--append-system-prompt",
            "--bare",
            "--safe-mode",
        ):
            with self.subTest(argument=argument), self.assertRaises(
                profile.ProfileError
            ):
                profile._validate_forwarded_args("claude", (argument,))

    def test_claude_allows_ordinary_arguments(self) -> None:
        profile._validate_forwarded_args("claude", ("-p", "hello"))

    def test_claude_is_not_launchable_yet(self) -> None:
        self.assertNotIn("claude", profile.LAUNCHABLE_CLIENTS)
        project = profile.load_project(self.project)
        selected = profile._select_profile(project, "review")
        tree = profile._render_tree(project, "claude", selected)
        with self.assertRaisesRegex(profile.ProfileError, "has no launch adapter"):
            profile.build_launch("claude", self.root / "runtime", tree)


class ClaudeRuntimePolicyIsLockedTests(unittest.TestCase):
    """The declared Claude policy must be a lock input like every other source."""

    def test_repository_declares_and_locks_the_claude_policy(self) -> None:
        repository = Path(__file__).resolve().parents[2]
        project = profile.load_project(repository)
        self.assertIn("claude", project.runtime_policies)
        inputs = profile._desired_lock(project)["inputs"]
        self.assertIn(".cap/runtime/claude.toml", inputs)


class EphemeralRuntimeRootTests(ProfileTestCase):
    """The one-shot runtime root must be expressible on both hosts.

    Some clients define a configuration directory variable as a name relative to
    the home and join it with the home themselves. Neither host's system
    temporary directory is under the home, so a root there cannot be expressed
    at all and the run fails before it starts.
    """

    def test_root_is_created_under_the_real_home(self) -> None:
        with profile._ephemeral_runtime_root("omp", "review") as root:
            self.assertTrue(
                root.is_relative_to(Path.home().absolute()),
                f"{root} is not under the home",
            )
            self.assertTrue(root.is_dir())

    def test_root_is_removed_after_normal_use(self) -> None:
        with profile._ephemeral_runtime_root("omp", "review") as root:
            (root / "leftover.txt").write_text("x", encoding="utf-8")
        self.assertFalse(root.exists())

    def test_root_is_removed_after_a_failure(self) -> None:
        class Boom(RuntimeError):
            pass

        captured = None
        with self.assertRaises(Boom), profile._ephemeral_runtime_root(
            "omp", "review"
        ) as root:
            captured = root
            (root / "partial.txt").write_text("x", encoding="utf-8")
            raise Boom
        self.assertIsNotNone(captured)
        self.assertFalse(captured.exists())

    def test_home_relative_name_round_trips(self) -> None:
        with profile._ephemeral_runtime_root("omp", "review") as root:
            name = profile._home_relative_name(root, "omp runtime root")
            self.assertFalse(Path(name).is_absolute())
            # What the client will compute must be the root itself, not a path
            # that had the home joined onto an already-absolute value.
            self.assertEqual(Path.home().absolute() / name, root)

    def test_directory_outside_the_home_cannot_be_named(self) -> None:
        outside = Path(tempfile.gettempdir()).absolute() / "cap-outside-home"
        if outside.is_relative_to(Path.home().absolute()):
            self.skipTest("system temporary directory is under the home here")
        with self.assertRaisesRegex(profile.ProfileError, "under the real home"):
            profile._home_relative_name(outside, "omp runtime root")

    def test_root_is_accepted_by_the_directory_gate(self) -> None:
        project = profile.load_project(self.project)
        with profile._ephemeral_runtime_root(
            "omp", "review"
        ) as root, profile._stable_directory(root, "runtime root") as directory:
            # Only the home itself, the project, and native capability
            # roots are rejected; locations under the home are fine.
            profile._require_external_directory(
                project, directory, "runtime root"
            )

    def test_location_choice_has_no_platform_branch(self) -> None:
        import inspect

        source = inspect.getsource(profile._ephemeral_runtime_root)
        for marker in ("os.name", "sys.platform", "platform.system"):
            self.assertNotIn(marker, source)


class RuntimePolicyFieldsSurviveRedactionTests(unittest.TestCase):
    """No runtime-policy field name may collide with the secret redactor.

    Lock inputs are hashed *after* redaction. A policy field whose name matches
    the secret pattern is rewritten to a placeholder before hashing, so two
    different values hash identically and `cap verify` stops detecting changes
    to it. `effective_render_hash` still covers the value, but the lock -- whose
    whole job is declaration drift -- silently would not.
    """

    def test_every_declared_policy_value_survives_redaction(self) -> None:
        repository = Path(__file__).resolve().parents[2]
        policies = sorted((repository / ".cap" / "runtime").glob("*.toml"))
        self.assertTrue(policies, "no runtime policy files found")

        for path in policies:
            with self.subTest(policy=path.name):
                redacted = profile._redacted_file_bytes(path).decode("utf-8")
                self.assertNotIn(
                    "<external-secret>",
                    redacted,
                    f"{path.name} has a field name that trips the secret "
                    "redactor; rename it so the lock keeps covering its value",
                )

    def test_two_policy_values_hash_differently(self) -> None:
        # The property the previous test protects, demonstrated end to end.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "a.toml"
            second = root / "b.toml"
            first.write_text('login_mode = "subscription"\n', encoding="utf-8")
            second.write_text('login_mode = "bare"\n', encoding="utf-8")
            self.assertNotEqual(
                profile._sha256(profile._redacted_file_bytes(first)),
                profile._sha256(profile._redacted_file_bytes(second)),
            )

    def test_a_secret_named_field_would_collapse(self) -> None:
        # Demonstrates the trap this guard exists for.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "a.toml"
            second = root / "b.toml"
            first.write_text('auth_mode = "subscription"\n', encoding="utf-8")
            second.write_text('auth_mode = "bare"\n', encoding="utf-8")
            self.assertEqual(
                profile._sha256(profile._redacted_file_bytes(first)),
                profile._sha256(profile._redacted_file_bytes(second)),
                "expected the redactor to collapse an auth-named field",
            )


class SingleEntryTests(unittest.TestCase):
    def test_profile_package_has_one_cli_and_observe_schema_is_removed(self) -> None:
        package_root = Path(profile.__file__).resolve().parent
        repository_root = Path(__file__).resolve().parents[2]
        self.assertEqual(
            sorted(path.name for path in package_root.glob("*.py")),
            ["__init__.py", "cli.py"],
        )
        self.assertFalse((repository_root / "tools" / "profile" / "profile.py").exists())
        self.assertFalse((repository_root / "tools" / "caprun").exists())
        self.assertFalse((repository_root / "tools" / "profile" / "observe").exists())
        self.assertFalse((repository_root / "tools" / "profile" / "observe-codex").exists())
        self.assertTrue(
            (Path(__file__).resolve().parent / "fixtures" / "multi-profile" / ".cap" / "manifest.toml").is_file()
        )


if __name__ == "__main__":
    unittest.main()
