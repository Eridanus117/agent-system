from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agent_system.cap import cli as cap
from agent_system.omp import runtime as omp_runtime


class ClientStdinTest(unittest.TestCase):
    """`run` is batch and must not inherit an open stdin pipe; `use` is interactive."""

    def stdin_for(self, command: str | None) -> int | None:
        return omp_runtime._client_stdin(SimpleNamespace(profile_tool_command=command))

    def test_batch_run_closes_stdin(self) -> None:
        self.assertEqual(self.stdin_for("run"), subprocess.DEVNULL)

    def test_interactive_launch_keeps_stdin(self) -> None:
        self.assertIsNone(self.stdin_for("launch"))

    def test_unknown_command_keeps_stdin(self) -> None:
        self.assertIsNone(self.stdin_for(None))
        self.assertIsNone(omp_runtime._client_stdin(SimpleNamespace()))


def _claude_evidence_root() -> Path:
    """Locate the Claude adapter evidence wherever its change package lives.

    The code depends on these recorded observations regardless of whether the
    change is still active or already archived, so the invariant must survive
    archiving rather than break on it.
    """

    repository = Path(__file__).resolve().parents[2]
    candidates = [
        repository / "openspec" / "changes" / "add-claude-cap-adapter" / "evidence",
        *sorted(
            (repository / "openspec" / "changes" / "archive").glob(
                "*-add-claude-cap-adapter/evidence"
            )
        ),
    ]
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    raise AssertionError("Claude adapter evidence not found in any change package")


class NonTTY(io.StringIO):
    def isatty(self) -> bool:
        return False


class CapEntryTest(unittest.TestCase):
    def test_tui_selects_default_profile(self) -> None:
        class FakeCurses:
            KEY_UP = 259
            KEY_DOWN = 258
            KEY_LEFT = 260
            KEY_ENTER = 343
            error = RuntimeError

        class FakeScreen:
            def __init__(self) -> None:
                self.keys = [10]
                self.output: list[str] = []

            def erase(self) -> None:
                pass

            def getmaxyx(self) -> tuple[int, int]:
                return (40, 120)

            def addstr(self, _row: int, _column: int, text: str) -> None:
                self.output.append(text)

            def refresh(self) -> None:
                pass

            def getch(self) -> int:
                return self.keys.pop(0)

        screen = FakeScreen()
        profile = cap._tui_profile(
            screen,
            FakeCurses,
            ["agent-assembler", "general"],
        )

        self.assertEqual(profile, "general")
        self.assertTrue(
            any("general [默认]  通用工程" in line for line in screen.output)
        )

    def test_profile_defaults_to_general_and_accepts_chinese_name(self) -> None:
        parser = cap._build_parser()
        self.assertEqual(parser.parse_args(["run"]).profile, "general")
        self.assertEqual(cap.RUNNABLE_PROFILES, ("general", "agent-assembler"))
        self.assertNotIn("assembly-helper", cap.PROFILE_LABELS)

        stdout = io.StringIO()
        with (
            patch("builtins.input", return_value="通用工程"),
            contextlib.redirect_stdout(stdout),
        ):
            selected = cap._choose(
                "profile",
                ["general", "agent-assembler"],
                "general",
                cap.PROFILE_LABELS,
            )

        self.assertEqual(selected, "general")
        self.assertIn("general（通用工程） [默认]", stdout.getvalue())

    def test_skill_validation_includes_manifest_imports(self) -> None:
        project = Path(__file__).resolve().parents[2]
        report = cap._skill_metadata_report(project)

        self.assertEqual(report["standard_conformance"], "ok")
        grilling = next(
            skill for skill in report["skills"] if skill["id"] == "grilling"
        )
        self.assertEqual(
            grilling["path"],
            "plugins/grilling/skills/grilling/SKILL.md",
        )

    def test_help_remains_explicit_and_old_aliases_fail(self) -> None:
        with (
            contextlib.redirect_stdout(io.StringIO()),
            self.assertRaises(SystemExit) as help_exit,
        ):
            cap.main(["--help"])
        self.assertEqual(help_exit.exception.code, 0)

        for alias in ("i", "interactive"):
            stderr = io.StringIO()
            with (
                self.subTest(alias=alias),
                contextlib.redirect_stderr(stderr),
                self.assertRaises(SystemExit) as alias_exit,
            ):
                cap.main([alias])
            self.assertNotEqual(alias_exit.exception.code, 0)
            self.assertIn("请使用裸 cap", stderr.getvalue())

    def test_incomplete_non_tty_calls_fail_without_interaction(self) -> None:
        for argv, expected in (([], "裸 cap"), (["show"], "cap show")):
            stderr = io.StringIO()
            with (
                self.subTest(argv=argv),
                patch.object(cap.sys, "stdin", NonTTY()),
                patch.object(cap.sys, "stdout", NonTTY()),
                patch.object(cap, "_tui_use") as tui_use,
                patch.object(cap, "_show") as show,
                contextlib.redirect_stderr(stderr),
            ):
                result = cap.main(argv)
            self.assertEqual(result, 2)
            self.assertIn(expected, stderr.getvalue())
            tui_use.assert_not_called()
            show.assert_not_called()

    def test_explicit_run_and_render_remain_non_interactive(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "home").mkdir()
            common = [
                "--project",
                str(root),
                "--home",
                str(root / "home"),
                "--agent-state-root",
                str(root / "agent-homes"),
                "--profile-tool",
                str(root / "profile.py"),
            ]
            cases = (
                ([*common, "run", "general", "--cli", "omp", "--", "-p", "check"], "run"),
                ([*common, "render", "general", "--cli", "omp", "--output", str(root / "rendered")], "materialize"),
            )
            for argv, command in cases:
                with (
                    self.subTest(command=command),
                    patch.object(cap.sys, "stdin", NonTTY()),
                    patch.object(cap.sys, "stdout", NonTTY()),
                    patch.object(cap, "_run_selected", return_value=23) as run_selected,
                ):
                    result = cap.main(argv)
                self.assertEqual(result, 23)
                selected = run_selected.call_args.args[0]
                self.assertEqual(selected.profile_tool_command, command)
                self.assertEqual(Path(selected._real_home), (root / "home").resolve())

    def test_layered_commands_forward_all_binding_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            common = [
                "--machine-context-manifest",
                str(root / "base.json"),
                "--machine-context-pin",
                str(root / "pin.json"),
                "--assembly-binding-dir",
                str(root / "bindings"),
            ]
            verify = cap._build_parser().parse_args([*common, "verify"])
            render = cap._build_parser().parse_args(
                [
                    *common,
                    "render",
                    "general",
                    "--output",
                    str(root / "output"),
                ]
            )

        for args in (verify, render):
            command = cap._profile_args(args)
            self.assertIn(str(root / "base.json"), command)
            self.assertIn(str(root / "pin.json"), command)
            self.assertIn(str(root / "bindings"), command)


class CapShowTest(unittest.TestCase):
    def test_explicit_profile_outputs_public_closure_without_prompt(self) -> None:
        args = cap._build_parser().parse_args(["show", "general"])
        explanation = {"profile": "general", "inventory": {"skills": []}, "clients": {}}
        stdout = io.StringIO()
        with (
            patch.object(cap, "_profile_json", return_value=explanation),
            patch.object(cap, "_choose") as choose,
            patch.object(cap, "_render_preview") as render_preview,
            contextlib.redirect_stdout(stdout),
        ):
            result = cap._show(args, {})

        self.assertEqual(result, 0)
        self.assertEqual(json_from(stdout), explanation)
        choose.assert_not_called()
        render_preview.assert_not_called()

    def test_interactive_show_outputs_public_closure_then_allows_no_expansion(self) -> None:
        args = cap._build_parser().parse_args(["show"])
        explanation = {"profile": "general", "inventory": {"skills": []}, "clients": {}}
        stdout = io.StringIO()
        with (
            patch.object(cap, "_available_profiles", return_value=["agent-assembler", "general"]),
            patch.object(cap, "_choose", side_effect=["general", "不展开"]) as choose,
            patch.object(cap, "_profile_json", return_value=explanation),
            patch.object(cap, "_render_preview") as render_preview,
            contextlib.redirect_stdout(stdout),
        ):
            result = cap._show(args, {})

        self.assertEqual(result, 0)
        self.assertEqual([call.args[0] for call in choose.call_args_list], ["profile", "CLI 装配"])
        self.assertEqual(json_from(stdout), explanation)
        render_preview.assert_not_called()

    def test_explicit_cli_combines_public_closure_and_preview(self) -> None:
        args = cap._build_parser().parse_args(["show", "general", "--cli", "omp"])
        explanation = {"profile": "general", "inventory": {"skills": []}, "clients": {}}
        preview = {"client": "omp", "files": ["config.yml"], "tree_hash": "sha256:test"}
        stdout = io.StringIO()
        with (
            patch.object(cap, "_profile_json", return_value=explanation),
            patch.object(cap, "_render_preview", return_value=preview),
            patch.object(cap, "_choose") as choose,
            contextlib.redirect_stdout(stdout),
        ):
            result = cap._show(args, {})

        self.assertEqual(result, 0)
        self.assertEqual(json_from(stdout)["preview"], preview)
        choose.assert_not_called()


class CapPreviewTest(unittest.TestCase):
    def setUp(self) -> None:
        self.args = cap._build_parser().parse_args(["show", "general", "--cli", "omp"])
        self.real_temporary_directory = tempfile.TemporaryDirectory

    def test_preview_lists_sorted_relative_files_and_cleans_success(self) -> None:
        created: list[str] = []

        def tracked_directory(*args: object, **kwargs: object) -> tempfile.TemporaryDirectory[str]:
            directory = self.real_temporary_directory(*args, **kwargs)
            created.append(directory.name)
            return directory

        def render(preview_args: object, _env: object, _stage: object) -> dict[str, object]:
            output = Path(preview_args.output)
            (output / "skills" / "sample").mkdir(parents=True)
            (output / "skills" / "sample" / "SKILL.md").write_text("skill\n", encoding="utf-8")
            (output / "config.yml").write_text("config\n", encoding="utf-8")
            return {"tree_hash": "sha256:test"}

        with self.real_temporary_directory() as generation_temp:
            generation = Path(generation_temp) / "generation"
            generation.mkdir()
            (generation / ".cap-generation.json").write_text(
                json.dumps(
                    {
                        "source_context": {
                            "profile": "general",
                            "layer_digest": "sha256:layer",
                        },
                        "source_digest": "sha256:source",
                    }
                ),
                encoding="utf-8",
            )
            with (
                patch.object(cap.tempfile, "TemporaryDirectory", side_effect=tracked_directory),
                patch.object(cap, "_profile_json", side_effect=render),
                patch.object(
                    cap,
                    "_materialize_profile_generation",
                    return_value=(
                        generation,
                        "sha256:test",
                        "sha256:effective",
                        ["sample"],
                    ),
                ),
                patch.object(
                    cap,
                    "_agent_home_dir",
                    return_value=Path("/state/global/omp/default"),
                ),
            ):
                preview = cap._render_preview(self.args, {})

            self.assertEqual(
                preview,
                {
                    "client": "omp",
                    "files": ["config.yml", "skills/sample/SKILL.md"],
                    "tree_hash": "sha256:test",
                    "runtime_id": "default",
                    "global_runtime_root": "/state/global/omp/default",
                    "global_generation": str(generation),
                    "portable_tree_hash": "sha256:test",
                    "effective_render_hash": "sha256:effective",
                    "project_source_context": {
                        "profile": "general",
                        "layer_digest": "sha256:layer",
                    },
                    "project_source_digest": "sha256:source",
                    "skills": ["sample"],
                    "fixed_flags": ["--no-extensions", "--no-rules"],
                },
            )
        self.assertTrue(created)
        self.assertTrue(all(not os.path.exists(path) for path in created))

    def test_preview_cleans_render_failure(self) -> None:
        created: list[str] = []

        def tracked_directory(*args: object, **kwargs: object) -> tempfile.TemporaryDirectory[str]:
            directory = self.real_temporary_directory(*args, **kwargs)
            created.append(directory.name)
            return directory

        with (
            patch.object(cap.tempfile, "TemporaryDirectory", side_effect=tracked_directory),
            patch.object(cap, "_profile_json", return_value=None),
        ):
            preview = cap._render_preview(self.args, {})

        self.assertIsNone(preview)
        self.assertTrue(created)
        self.assertTrue(all(not os.path.exists(path) for path in created))


class ClaudeLaunchEnvironmentTests(unittest.TestCase):
    """The launch environment must isolate without touching the user's client."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.home = self.root / "home"
        self.runtime = self.home / ".agent-system-state" / "runtimes" / "claude" / "default"
        self.runtime.mkdir(parents=True)

    def _env(self, login_mode: str = "subscription", **extra: str) -> dict:
        from agent_system.claude import launch

        ambient = {
            "HOME": "/ambient",
            "CLAUDE_CONFIG_DIR": "/ambient/.claude",
            "ANTHROPIC_API_KEY": "ambient-key",
            "ANTHROPIC_BASE_URL": "https://ambient.invalid",
            "CLAUDE_CODE_USE_BEDROCK": "1",
            "PI_CONFIG_DIR": "/ambient-omp",
            "PATH": "/usr/bin",
            **extra,
        }
        return launch.claude_env(ambient, self.runtime, self.home, login_mode)

    def test_config_dir_points_at_cap_runtime_not_the_user_client(self) -> None:
        env = self._env()
        self.assertEqual(env["CLAUDE_CONFIG_DIR"], str(self.runtime))
        # The adapter never reads, writes or migrates the user's own directory.
        self.assertNotEqual(env["CLAUDE_CONFIG_DIR"], str(self.home / ".claude"))
        self.assertIn(".agent-system-state", env["CLAUDE_CONFIG_DIR"])

    def test_host_context_is_preserved(self) -> None:
        env = self._env()
        # Git, SSH and language toolchains must keep working.
        self.assertEqual(env["HOME"], str(self.home))
        self.assertEqual(env["PATH"], "/usr/bin")

    def test_subscription_blanks_provider_credentials(self) -> None:
        env = self._env("subscription")
        for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK"):
            with self.subTest(name=name):
                self.assertEqual(env[name], "")

    def test_bare_mode_keeps_its_only_credential_source(self) -> None:
        # --bare reads only ANTHROPIC_API_KEY or an apiKeyHelper; blanking it
        # would leave no way to authenticate at all.
        env = self._env("bare")
        self.assertEqual(env["ANTHROPIC_API_KEY"], "ambient-key")
        self.assertEqual(env["ANTHROPIC_BASE_URL"], "")

    def test_other_client_pointers_are_dropped(self) -> None:
        env = self._env()
        self.assertNotIn("PI_CONFIG_DIR", env)


class ClaudeLaunchCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.generation = Path(self.temporary.name) / "gen"
        (self.generation / "native" / "plugin").mkdir(parents=True)
        (self.generation / "system-prompt.md").write_text("p\n", encoding="utf-8")

    def _argv(self, skills=("a",), login_mode="subscription", forwarded=()):
        from agent_system.claude import launch

        return launch.claude_command(
            self.generation, tuple(skills), login_mode, list(forwarded)
        )

    def test_every_fixed_gate_is_on_the_command_line(self) -> None:
        argv = self._argv()
        for flag in (
            "--settings",
            "--setting-sources",
            "--mcp-config",
            "--strict-mcp-config",
            "--plugin-dir",
            "--append-system-prompt",
        ):
            with self.subTest(flag=flag):
                self.assertIn(flag, argv)
        # Empty on purpose: user, project and local setting sources are off.
        self.assertEqual(argv[argv.index("--setting-sources") + 1], "")

    def test_generation_is_referenced_read_only(self) -> None:
        argv = self._argv()
        for flag in ("--settings", "--mcp-config", "--plugin-dir"):
            value = argv[argv.index(flag) + 1]
            with self.subTest(flag=flag):
                self.assertTrue(Path(value).is_relative_to(self.generation))

    def test_bare_flag_only_in_bare_mode(self) -> None:
        self.assertNotIn("--bare", self._argv(login_mode="subscription"))
        self.assertIn("--bare", self._argv(login_mode="bare"))

    def test_plugin_dir_is_omitted_without_skills(self) -> None:
        self.assertNotIn("--plugin-dir", self._argv(skills=()))

    def test_forwarded_arguments_come_last(self) -> None:
        argv = self._argv(forwarded=["-p", "hi"])
        self.assertEqual(argv[-2:], ["-p", "hi"])


class ClaudeEffectiveObservationTests(unittest.TestCase):
    def test_subscription_pins_mcps_to_client_limited(self) -> None:
        from agent_system.claude import launch

        # Reproduced twice against a real client: account-level connectors load
        # regardless of --strict-mcp-config, so the closure is genuinely open.
        self.assertEqual(
            launch.effective_observations("subscription")["mcps"],
            "reported_client_limited",
        )

    def test_no_dimension_is_ever_reported_as_observed(self) -> None:
        from agent_system.claude import launch

        for mode in ("subscription", "bare"):
            with self.subTest(mode=mode):
                self.assertNotIn(
                    "observed", set(launch.effective_observations(mode).values())
                )

    def test_unverifiable_dimensions_stay_client_limited(self) -> None:
        from agent_system.claude import launch

        observations = launch.effective_observations("subscription")
        for name in ("hooks", "plugins", "bundled_skills"):
            with self.subTest(name=name):
                self.assertEqual(observations[name], "reported_client_limited")


class ClaudeCliDispatchTests(unittest.TestCase):
    def test_claude_is_registered_as_an_effective_adapter(self) -> None:
        self.assertIn("claude", cap.EFFECTIVE_ADAPTERS)
        self.assertIn("omp", cap.EFFECTIVE_ADAPTERS)
        # codex and qoder deliberately stay on the generic subprocess path.
        self.assertNotIn("codex", cap.EFFECTIVE_ADAPTERS)
        self.assertNotIn("qoder", cap.EFFECTIVE_ADAPTERS)

    def test_subcommands_without_a_client_still_dispatch(self) -> None:
        # `lock`, `verify` and friends carry no --cli; reading it unconditionally
        # in the dispatcher broke every one of them.
        calls = []

        def fake_run(command, **kwargs):
            calls.append(command)
            return SimpleNamespace(returncode=0)

        args = cap.argparse.Namespace(profile_tool_command="lock", fresh=False)
        with (
            patch.object(cap.subprocess, "run", side_effect=fake_run),
            patch.object(cap, "_profile_args", return_value=["profile", "lock"]),
        ):
            self.assertEqual(cap._run_selected(args, {}), 0)
        self.assertEqual(calls, [["profile", "lock"]])

    def test_fresh_bypasses_the_effective_adapter(self) -> None:
        # --fresh is the explicit-auth one-shot path and must keep going through
        # the profile engine, not the persistent-runtime adapter.
        def fake_run(command, **kwargs):
            return SimpleNamespace(returncode=0)

        args = cap.argparse.Namespace(
            profile_tool_command="run", cli="claude", fresh=True
        )
        with (
            patch.object(cap.subprocess, "run", side_effect=fake_run),
            patch.object(cap, "_profile_args", return_value=["profile", "run"]),
        ):
            self.assertEqual(cap._run_selected(args, {}), 0)

    def test_forwarded_gate_reopening_flags_are_rejected(self) -> None:
        from agent_system.profile.cli import ProfileError

        args = cap.argparse.Namespace(
            cli="claude", client_args=["--dangerously-skip-permissions"]
        )
        with self.assertRaises(ProfileError):
            cap._run_claude(args, {})


class ClaudeGenerationTest(unittest.TestCase):
    """The three hashes, the content-addressed store and its drift gates."""

    SKILLS = ("alpha", "beta")

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.bindings = self.root / "bindings"
        self.bindings.mkdir()
        (self.bindings / "general.binding.json").write_text(
            json.dumps(
                {
                    "layer_digest": "sha256:layer-general",
                    "effective_digest": "sha256:effective-general",
                }
            ),
            encoding="utf-8",
        )
        cap_dir = self.root / "project" / ".cap"
        (cap_dir / "runtime").mkdir(parents=True)
        (cap_dir / "runtime" / "claude.toml").write_text(
            (
                "version = 1\n"
                'client = "claude"\n'
                "\n"
                "[policy]\n"
                'login_mode = "subscription"\n'
                'permission_mode = "manual"\n'
                "enable_project_mcp = false\n"
                "enable_user_assets = false\n"
                "auto_memory = false\n"
            ),
            encoding="utf-8",
        )
        (cap_dir / "lock.json").write_text(
            json.dumps({"clients": {"claude": {"adapter_version": 1}}}),
            encoding="utf-8",
        )

    def args(self) -> object:
        return cap.argparse.Namespace(
            profile="general",
            cli="claude",
            home=str(self.home),
            _real_home=str(self.home),
            agent_home_root=str(self.home / ".agent-system-state"),
            profile_tool=str(self.root / "profile.py"),
            project=str(self.root / "project"),
            base_manifest=str(self.root / "base.json"),
            base_pin=str(self.root / "pin.json"),
            binding_dir=str(self.bindings),
            private_overlay=None,
            claude_runtime_id="default",
            workdir=None,
            receipt=None,
        )

    def _fake_render(self, command, **_):
        """Stand in for the profile engine's materialize step."""

        output = Path(command[command.index("--output") + 1])
        (output / "claude-config.yaml").write_text("{}\n", encoding="utf-8")
        (output / "mcp.json").write_text(
            json.dumps({"mcpServers": {}}), encoding="utf-8"
        )
        (output / "system-prompt.md").write_text("prompt\n", encoding="utf-8")
        for name in self.SKILLS:
            skill = output / "skills" / name
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text(f"# {name}\n", encoding="utf-8")
        return SimpleNamespace(
            returncode=0,
            stdout=json.dumps({"tree_hash": "sha256:portable-fixture"}),
            stderr="",
        )

    def materialize(self):
        from agent_system.adapter import common
        from agent_system.claude import generation

        with patch.object(common.subprocess, "run", side_effect=self._fake_render):
            return generation.materialize_claude_generation(self.args(), {})

    def test_generation_is_named_by_its_effective_hash(self) -> None:
        gen, portable, effective, skills = self.materialize()
        self.assertEqual(portable, "sha256:portable-fixture")
        self.assertEqual(gen.name, effective.removeprefix("sha256:"))
        self.assertEqual(skills, self.SKILLS)

    def test_three_hashes_have_distinct_roles(self) -> None:
        gen, portable, effective, _ = self.materialize()
        manifest = json.loads(
            (gen / ".cap-generation.json").read_text(encoding="utf-8")
        )
        # Declaration, machine-bound render, and bytes on disk are three
        # different questions and must not collapse into one value.
        self.assertEqual(manifest["portable_tree_hash"], portable)
        self.assertEqual(manifest["effective_render_hash"], effective)
        self.assertNotIn(
            manifest["content_digest"], {portable, effective}
        )

    def test_generation_layout_matches_the_projection(self) -> None:
        from agent_system.claude import native

        gen, _, _, _ = self.materialize()
        for relative in (
            "claude-config.yaml",
            "system-prompt.md",
            native.SETTINGS_PATH,
            native.MCP_PATH,
            native.PLUGIN_MANIFEST_PATH,
        ):
            with self.subTest(relative=relative):
                self.assertTrue((gen / relative).is_file(), relative)
        delivered = sorted(
            path.name
            for path in (gen / native.PLUGIN_SKILLS_ROOT).iterdir()
            if path.is_dir()
        )
        self.assertEqual(tuple(delivered), self.SKILLS)

    def test_skill_allowlist_agrees_in_all_three_places(self) -> None:
        from agent_system.claude import native

        gen, _, _, skills = self.materialize()
        manifest = json.loads(
            (gen / ".cap-generation.json").read_text(encoding="utf-8")
        )
        config = cap.yaml.safe_load(
            (gen / "claude-config.yaml").read_text(encoding="utf-8")
        )
        delivered = tuple(
            sorted(
                path.name
                for path in (gen / native.PLUGIN_SKILLS_ROOT).iterdir()
                if path.is_dir()
            )
        )
        self.assertEqual(tuple(manifest["skills"]), skills)
        self.assertEqual(tuple(config["skills"]["include"]), skills)
        self.assertEqual(delivered, skills)

    def test_identical_inputs_reuse_the_same_generation(self) -> None:
        first, _, first_hash, _ = self.materialize()
        second, _, second_hash, _ = self.materialize()
        self.assertEqual(first, second)
        self.assertEqual(first_hash, second_hash)

    def test_policy_change_produces_a_different_generation(self) -> None:
        _, _, before, _ = self.materialize()
        policy = self.root / "project" / ".cap" / "runtime" / "claude.toml"
        policy.write_text(
            policy.read_text(encoding="utf-8").replace(
                'permission_mode = "manual"', 'permission_mode = "plan"'
            ),
            encoding="utf-8",
        )
        _, _, after, _ = self.materialize()
        self.assertNotEqual(before, after)

    def test_content_drift_is_rejected(self) -> None:
        from agent_system.adapter.common import AdapterError

        gen, _, _, _ = self.materialize()
        (gen / "native" / "settings.json").write_text("{}\n\n", encoding="utf-8")
        with self.assertRaisesRegex(AdapterError, "content drifted"):
            self.materialize()

    def test_metadata_drift_is_rejected(self) -> None:
        from agent_system.adapter.common import AdapterError

        gen, _, _, _ = self.materialize()
        manifest = gen / ".cap-generation.json"
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        payload["login_mode"] = "bare"
        manifest.write_text(
            json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(AdapterError, "metadata drifted"):
            self.materialize()

    def _nesting_that_exceeds_the_budget(self) -> str:
        from agent_system.claude import generation, native

        prefix = len(
            str(
                generation.claude_render_root(self.args())
                / ("0" * 64)
                / native.PLUGIN_SKILLS_ROOT
                / self.SKILLS[0]
            )
        )
        component = "level00"
        needed = generation.MAX_PORTABLE_PATH - prefix - len("/reference.md")
        levels = max(needed // (len(component) + 1) + 2, 2)
        return "/".join(f"level{index:02d}" for index in range(levels))

    def test_path_budget_rejects_a_deeply_nested_skill(self) -> None:
        from agent_system.adapter import common
        from agent_system.claude import generation
        from agent_system.claude.runtime import ClaudeError

        # Derive the depth from the real prefix so the test means the same
        # thing on a short Linux temp path and a long Windows one.
        deep = self._nesting_that_exceeds_the_budget()

        def deep_render(command, **_):
            result = self._fake_render(command, **_)
            output = Path(command[command.index("--output") + 1])
            target = output / "skills" / self.SKILLS[0] / deep
            target.mkdir(parents=True)
            (target / "reference.md").write_text("x", encoding="utf-8")
            return result

        with (
            patch.object(common.subprocess, "run", side_effect=deep_render),
            self.assertRaisesRegex(ClaudeError, "portable path budget"),
        ):
            generation.materialize_claude_generation(self.args(), {})

    def test_path_budget_failure_leaves_no_stage_behind(self) -> None:
        from agent_system.adapter import common
        from agent_system.claude import generation
        from agent_system.claude.runtime import ClaudeError

        # Derive the depth from the real prefix so the test means the same
        # thing on a short Linux temp path and a long Windows one.
        deep = self._nesting_that_exceeds_the_budget()

        def deep_render(command, **_):
            result = self._fake_render(command, **_)
            output = Path(command[command.index("--output") + 1])
            target = output / "skills" / self.SKILLS[0] / deep
            target.mkdir(parents=True)
            (target / "reference.md").write_text("x", encoding="utf-8")
            return result

        with (
            patch.object(common.subprocess, "run", side_effect=deep_render),
            self.assertRaises(ClaudeError),
        ):
            generation.materialize_claude_generation(self.args(), {})
        render_root = generation.claude_render_root(self.args())
        stages = (
            [path.name for path in render_root.iterdir() if path.name.startswith(".stage-")]
            if render_root.is_dir()
            else []
        )
        # Aborting before the copy is what keeps a half-built directory from
        # ever appearing in the store.
        self.assertEqual(stages, [])

    def test_receipt_records_evidence_without_secrets(self) -> None:
        from agent_system.claude import launch
        from agent_system.profile.cli import SECRET_KEY_PATTERN

        gen, portable, effective, skills = self.materialize()
        args = self.args()
        args.receipt = str(self.root / "receipt.json")
        receipt = Path(args.receipt)
        payload = launch.write_claude_receipt(
            args,
            receipt,
            return_code=0,
            generation=gen,
            runtime_dir=self.home / "runtime",
            portable_hash=portable,
            effective_hash=effective,
            post_run_content_digest="sha256:post",
            forwarded=["-p", "a-secret-looking-prompt"],
        )

        self.assertEqual(payload["client"], "claude")
        self.assertEqual(payload["portable_tree_hash"], portable)
        self.assertEqual(payload["effective_render_hash"], effective)
        self.assertEqual(tuple(payload["skills"]), skills)
        # A verified generation says nothing about what the client loaded.
        self.assertEqual(payload["evidence"]["effective"], "unknown")
        # Argument values never reach the receipt; only how many there were.
        self.assertEqual(payload["forwarded_argument_count"], 2)

        text = receipt.read_text(encoding="utf-8")
        # The receipt is not a capability source, so the redactor does not run
        # over it; what matters is that nothing sensitive is written in the
        # first place.
        self.assertNotIn("a-secret-looking-prompt", text)
        for key in json.loads(text):
            with self.subTest(key=key):
                self.assertIsNone(
                    SECRET_KEY_PATTERN.search(key),
                    f"receipt key {key} names a credential-shaped field",
                )

    def test_receipt_cannot_claim_a_closed_mcp_surface(self) -> None:
        from agent_system.claude import launch

        gen, portable, effective, _ = self.materialize()
        args = self.args()
        args.receipt = str(self.root / "receipt2.json")
        payload = launch.write_claude_receipt(
            args,
            Path(args.receipt),
            return_code=0,
            generation=gen,
            runtime_dir=self.home / "runtime",
            portable_hash=portable,
            effective_hash=effective,
            post_run_content_digest="sha256:post",
            forwarded=[],
        )
        self.assertEqual(
            payload["effective_observations"]["mcps"], "reported_client_limited"
        )

    def test_manifest_records_the_uncontrollable_surface_decision(self) -> None:
        gen, _, _, _ = self.materialize()
        manifest = json.loads(
            (gen / ".cap-generation.json").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["client"], "claude")
        self.assertEqual(manifest["login_mode"], "subscription")
        self.assertEqual(
            manifest["native_projection"]["unsupported"], ["hooks", "plugins"]
        )


class ClaudeGenerationEvidencePinTests(unittest.TestCase):
    def test_verified_surface_digest_matches_the_evidence_file(self) -> None:
        from agent_system.adapter.common import _digest_bytes
        from agent_system.claude import generation

        evidence = _claude_evidence_root() / "claude-native-surface.json"
        # The generation manifest pins this digest, so revising the recorded
        # observations must invalidate cached renders rather than let a stale
        # assumption keep serving them.
        self.assertEqual(
            generation.VERIFIED_SURFACE_DIGEST, _digest_bytes(evidence.read_bytes())
        )

    def test_client_field_prevents_cross_client_cas_collision(self) -> None:
        from agent_system.adapter.common import _digest_json

        payload = {"source_digest": "sha256:x", "config": {}, "launch": {}}
        omp_like = _digest_json({"version": 1, **payload})
        claude_like = _digest_json({"version": 1, "client": "claude", **payload})
        self.assertNotEqual(omp_like, claude_like)


class ClaudeNativeProjectionTests(unittest.TestCase):
    """The projection is the only place Claude's own key names may appear."""

    def _config(self, **overrides: object) -> dict:
        from agent_system.claude import runtime as claude_runtime

        config = claude_runtime.effective_claude_config(
            ("alpha", "beta"),
            {"demo": {"type": "stdio", "command": "x", "args": [], "env": {}}},
            {
                "login_mode": "subscription",
                "permission_mode": "manual",
                "enable_project_mcp": False,
                "enable_user_assets": False,
                "auto_memory": False,
            },
            {},
            {},
        )
        config.update(overrides)
        return config

    def _project(self, config: dict) -> dict:
        from agent_system.claude import native

        return native.project_claude_native(
            config, profile="general", adapter_version=1
        )

    def test_emits_exactly_the_verified_native_files(self) -> None:
        from agent_system.claude import native

        files = self._project(self._config())
        self.assertEqual(
            sorted(files),
            [
                native.MCP_PATH,
                native.PLUGIN_MANIFEST_PATH,
                native.SETTINGS_PATH,
            ],
        )

    def test_plugin_manifest_uses_the_verified_shape(self) -> None:
        from agent_system.claude import native

        files = self._project(self._config())
        manifest = json.loads(files[native.PLUGIN_MANIFEST_PATH])
        self.assertEqual(manifest["name"], "cap-general")
        self.assertEqual(manifest["skills"], "./skills/")
        self.assertIn("version", manifest)
        self.assertIn("description", manifest)
        self.assertEqual(manifest["author"], {"name": "cap"})

    def test_mcp_file_uses_mcp_servers(self) -> None:
        from agent_system.claude import native

        files = self._project(self._config())
        payload = json.loads(files[native.MCP_PATH])
        self.assertEqual(sorted(payload), ["mcpServers"])
        self.assertEqual(sorted(payload["mcpServers"]), ["demo"])

    def test_settings_is_empty_because_no_key_is_verified(self) -> None:
        from agent_system.claude import native

        # Every control CAP needs is a verified command-line flag. Guessing a
        # settings key would violate the adapter's evidence rule.
        files = self._project(self._config())
        self.assertEqual(json.loads(files[native.SETTINGS_PATH]), {})

    def test_unmapped_configuration_field_fails_closed(self) -> None:
        from agent_system.claude.runtime import ClaudeError

        config = self._config()
        config["future_section"] = {"something": 1}
        with self.assertRaisesRegex(ClaudeError, "does not map configuration"):
            self._project(config)

    def test_wrong_version_or_client_fails_closed(self) -> None:
        from agent_system.claude.runtime import ClaudeError

        for key, value in (("version", 2), ("client", "omp")):
            with self.subTest(key=key):
                config = self._config()
                config[key] = value
                with self.assertRaisesRegex(ClaudeError, "version 1 claude"):
                    self._project(config)

    def test_projection_is_deterministic(self) -> None:
        first = self._project(self._config())
        second = self._project(self._config())
        self.assertEqual(first, second)

    def test_projection_does_not_touch_the_filesystem(self) -> None:
        # Purity matters: these bytes enter the content digest, so the result
        # must depend on the configuration alone.
        with patch.object(Path, "open", side_effect=AssertionError("IO")):
            self._project(self._config())

    def test_projection_record_pins_the_evidence_digest(self) -> None:
        from agent_system.claude import native

        files = self._project(self._config())
        record = native.native_projection_record(
            files,
            adapter_version=1,
            unsupported=("hooks", "plugins"),
            verified_surface_digest="sha256:abc",
        )
        self.assertEqual(record["adapter_version"], 1)
        self.assertEqual(record["files"], sorted(files))
        self.assertEqual(record["unsupported"], ["hooks", "plugins"])
        self.assertEqual(record["verified_surface_digest"], "sha256:abc")


class ClaudeNativeEvidenceTests(unittest.TestCase):
    """Every native key in the projection must be backed by recorded evidence."""

    def test_recorded_evidence_covers_the_projected_keys(self) -> None:
        evidence_root = _claude_evidence_root()
        surface = json.loads(
            (evidence_root / "claude-native-surface.json").read_text(encoding="utf-8")
        )
        projection = json.loads(
            (evidence_root / "native-projection-check.json").read_text(
                encoding="utf-8"
            )
        )

        confirmed = {
            fact["id"] for fact in surface["facts"] if fact["status"] == "confirmed"
        }
        for required in (
            "plugin-dir-readonly-skill-delivery",
            "mcp-flags",
            "settings-flag",
            "subagents-and-plugin-manifest",
        ):
            self.assertIn(required, confirmed)

        observed = {
            item["id"]
            for item in projection["observations"]
            if item["status"] == "confirmed"
        }
        for required in (
            "projected-plugin-loads",
            "projected-skills-load",
            "ambient-skill-dirs-contribute-nothing",
            "empty-settings-file-is-accepted",
        ):
            self.assertIn(required, observed)

        # The uncontrollable surface must stay recorded, not quietly dropped.
        self.assertIn("claudeai-connectors-still-load", observed)


class ClaudeRuntimePolicyTests(unittest.TestCase):
    """The Claude policy is CAP semantics with non-negotiable system gates."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / ".cap" / "runtime").mkdir(parents=True)

    def _write(self, body: str, *, version: int = 1, client: str = "claude") -> None:
        path = self.root / ".cap" / "runtime" / "claude.toml"
        header = [f"version = {version}", f'client = "{client}"', "", "[policy]"]
        path.write_text("\n".join([*header, body, ""]), encoding="utf-8")

    def _read(self) -> dict:
        from agent_system.claude import runtime as claude_runtime

        return claude_runtime.read_claude_runtime_policy(
            cap.argparse.Namespace(project=str(self.root))
        )

    def test_defaults_are_conservative(self) -> None:
        self._write("")
        policy = self._read()
        self.assertEqual(policy["login_mode"], "subscription")
        self.assertEqual(policy["permission_mode"], "manual")
        self.assertFalse(policy["enable_project_mcp"])
        self.assertFalse(policy["enable_user_assets"])
        self.assertFalse(policy["auto_memory"])

    def test_unknown_fields_are_preserved_but_not_projected(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self._write('future_field = "untouched"')
        policy = self._read()
        self.assertEqual(policy["future_field"], "untouched")

        config = claude_runtime.effective_claude_config(
            ("alpha",), {}, policy, {}, {}
        )
        self.assertNotIn("future_field", json.dumps(config))

    def test_enable_user_assets_cannot_be_widened(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self._write("enable_user_assets = true")
        with self.assertRaisesRegex(claude_runtime.ClaudeError, "fixed system gate"):
            self._read()

    def test_bypass_permissions_is_a_fixed_gate(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self._write('permission_mode = "bypassPermissions"')
        with self.assertRaisesRegex(claude_runtime.ClaudeError, "fixed system gate"):
            self._read()

    def test_permission_mode_must_be_a_real_claude_mode(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        # "default" does not exist in Claude Code 2.1.236.
        self._write('permission_mode = "default"')
        with self.assertRaisesRegex(claude_runtime.ClaudeError, "permission_mode"):
            self._read()

    def test_login_mode_is_restricted(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self._write('login_mode = "whatever"')
        with self.assertRaisesRegex(claude_runtime.ClaudeError, "login_mode"):
            self._read()

    def test_wrong_client_or_version_fails_closed(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self._write("", client="omp")
        with self.assertRaisesRegex(claude_runtime.ClaudeError, "client claude"):
            self._read()
        self._write("", version=2)
        with self.assertRaisesRegex(claude_runtime.ClaudeError, "version 1"):
            self._read()

    def test_global_preference_reads_only_the_allowlist(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        runtime_root = self.root / "runtime"
        runtime_root.mkdir()
        (runtime_root / "settings.json").write_text(
            json.dumps(
                {
                    "permission_mode": "plan",
                    "apiKeyHelper": "should-never-be-read",
                    "mcpServers": {"ambient": {}},
                }
            ),
            encoding="utf-8",
        )
        preference = claude_runtime.read_global_claude_preference(runtime_root)
        self.assertEqual(preference, {"permission_mode": "plan"})

    def test_missing_global_preference_is_not_an_error(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self.assertEqual(
            claude_runtime.read_global_claude_preference(self.root / "absent"), {}
        )

    def test_project_policy_beats_user_preference(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self._write('permission_mode = "acceptEdits"')
        config = claude_runtime.effective_claude_config(
            (), {}, self._read(), {"permission_mode": "plan"}, {}
        )
        self.assertEqual(config["permissions"]["default_mode"], "acceptEdits")

    def test_ambient_discovery_is_off_in_the_effective_config(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self._write("")
        config = claude_runtime.effective_claude_config(
            ("alpha", "beta"), {}, self._read(), {}, {}
        )
        self.assertEqual(config["skills"]["include"], ["alpha", "beta"])
        self.assertFalse(config["skills"]["enable_user"])
        self.assertFalse(config["skills"]["enable_project"])
        self.assertFalse(config["skills"]["enable_installed_plugins"])
        self.assertFalse(config["memory"]["load_user_claude_md"])

    def test_declared_unsupported_capability_fails_closed(self) -> None:
        from agent_system.claude import runtime as claude_runtime

        self._write("")
        policy = self._read()
        for kind in ("hooks", "plugins"):
            with self.subTest(kind=kind), self.assertRaisesRegex(
                claude_runtime.ClaudeError, "does not project"
            ):
                claude_runtime.effective_claude_config(
                    (), {}, policy, {}, {kind: ("something",)}
                )


class SharedAdapterPrimitiveTests(unittest.TestCase):
    """The client-agnostic primitives must be shared, not duplicated per adapter.

    A second adapter that restates canonical digests or the managed-path rules
    would drift from OMP silently, and the drift would only surface as a hash
    mismatch long after the fact.
    """

    def test_omp_uses_the_shared_implementations(self) -> None:
        from agent_system.adapter import common
        from agent_system.omp import runtime

        for name in (
            "_digest_bytes",
            "_digest_json",
            "_tree_digest",
            "_deep_overlay",
            "_assert_managed_path",
            "_validate_private_runtime",
            "_reject_unsafe_tree",
            "_safe_remove_tree",
            "_replace_generation_placeholder",
        ):
            with self.subTest(primitive=name):
                self.assertIs(
                    getattr(runtime, name),
                    getattr(common, name),
                    f"{name} is not the shared implementation",
                )

    def test_migration_error_alias_is_preserved(self) -> None:
        from agent_system.adapter import common
        from agent_system.omp import runtime

        self.assertIs(runtime._MigrationError, common.AdapterError)

    def test_canonical_json_digest_is_key_order_independent(self) -> None:
        from agent_system.adapter import common

        first = common._digest_json({"b": 1, "a": [1, 2]})
        second = common._digest_json({"a": [1, 2], "b": 1})
        self.assertEqual(first, second)
        self.assertTrue(first.startswith("sha256:"))
        self.assertNotEqual(first, common._digest_json({"a": [2, 1], "b": 1}))

    def test_tree_digest_covers_content_and_honours_exclude(self) -> None:
        from agent_system.adapter import common

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "kept.txt").write_text("kept", encoding="utf-8")
            (root / "ignored.json").write_text("{}", encoding="utf-8")

            full = common._tree_digest(root)
            excluded = common._tree_digest(root, exclude={"ignored.json"})
            self.assertNotEqual(full, excluded)

            (root / "ignored.json").write_text('{"changed": 1}', encoding="utf-8")
            self.assertEqual(
                excluded, common._tree_digest(root, exclude={"ignored.json"})
            )
            self.assertNotEqual(full, common._tree_digest(root))

    def test_assert_managed_path_rejects_escape_and_root(self) -> None:
        from agent_system.adapter import common

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "state"
            inside = root / "renders"
            inside.mkdir(parents=True)

            self.assertEqual(
                common._assert_managed_path(root, inside, "inside"), inside
            )
            with self.assertRaisesRegex(
                common.AdapterError, "outside the CAP state root"
            ):
                common._assert_managed_path(root, Path(temporary), "outside")
            with self.assertRaisesRegex(
                common.AdapterError, "must not be the CAP state root"
            ):
                common._assert_managed_path(root, root, "root itself")

    def test_deep_overlay_merges_nested_tables(self) -> None:
        from agent_system.adapter import common

        merged = common._deep_overlay(
            {"a": {"x": 1, "y": 2}, "b": 3},
            {"a": {"y": 9, "z": 10}},
        )
        self.assertEqual(merged, {"a": {"x": 1, "y": 9, "z": 10}, "b": 3})

    def test_replace_generation_placeholder_walks_containers(self) -> None:
        from agent_system.adapter import common

        value = {
            "dirs": ["<PROFILE_GENERATION>/skills", "plain"],
            "nested": {"path": "<PROFILE_GENERATION>/config.yml"},
            "untouched": 7,
        }
        replaced = common._replace_generation_placeholder(value, Path("/gen"))
        self.assertEqual(replaced["dirs"][0], f"{Path('/gen')}/skills")
        self.assertEqual(replaced["dirs"][1], "plain")
        self.assertEqual(replaced["nested"]["path"], f"{Path('/gen')}/config.yml")
        self.assertEqual(replaced["untouched"], 7)


class PrivateRuntimeValidationTest(unittest.TestCase):
    """Cover both branches of _validate_private_runtime on either host."""

    def _run_non_posix(self, root: Path, private_root: Path) -> None:
        """Exercise the branch taken when os.geteuid is unavailable."""

        from agent_system.omp import runtime

        with _HiddenAttr(runtime.os, "geteuid"):
            runtime._validate_private_runtime(
                root, "test runtime", private_root=private_root
            )

    def test_windows_branch_rejects_directory_outside_managed_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            managed = root / "managed"
            outside = root / "outside"
            managed.mkdir()
            outside.mkdir()
            with self.assertRaisesRegex(Exception, "CAP-managed root"):
                self._run_non_posix(outside, managed)

    def test_windows_branch_accepts_directory_inside_managed_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            managed = root / "managed"
            inside = managed / "renders" / "omp"
            inside.mkdir(parents=True)
            self._run_non_posix(inside, managed)

    def test_private_root_is_required(self) -> None:
        from agent_system.omp import runtime

        with (
            tempfile.TemporaryDirectory() as temporary,
            self.assertRaises(TypeError),
        ):
            runtime._validate_private_runtime(Path(temporary), "test runtime")


class _HiddenAttr:
    """Temporarily remove one attribute so hasattr() reports it missing."""

    def __init__(self, target: object, name: str) -> None:
        self._target = target
        self._name = name
        self._missing = object()
        self._original = getattr(target, name, self._missing)

    def __enter__(self) -> None:
        if self._original is not self._missing:
            delattr(self._target, self._name)

    def __exit__(self, *exc: object) -> None:
        if self._original is not self._missing:
            setattr(self._target, self._name, self._original)


class SharedRuntimeTest(unittest.TestCase):
    def test_config_dir_is_named_relative_to_the_real_home(self) -> None:
        real_home = Path("/srv/home/agent") if os.name != "nt" else Path("C:/home/agent")
        agent_home = real_home / ".agent-system-state" / "runtimes" / "omp" / "default"
        self.assertEqual(
            cap._omp_config_dir_value(agent_home, real_home),
            ".agent-system-state/runtimes/omp/default",
        )

    def test_runtime_root_outside_the_real_home_fails_closed(self) -> None:
        # omp cannot express a config root outside the home, so cap refuses
        # instead of handing over an absolute value it would silently double.
        real_home = Path("/srv/home/agent") if os.name != "nt" else Path("C:/home/agent")
        outside = Path("/srv/elsewhere/omp") if os.name != "nt" else Path("C:/elsewhere/omp")
        with self.assertRaisesRegex(Exception, "must live under the real home"):
            cap._omp_config_dir_value(outside, real_home)

    def test_profiles_share_runtime_and_clear_broker_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            real_home = root / "home"
            real_home.mkdir()
            # Production always places the managed runtime under the real home;
            # omp resolves PI_CONFIG_DIR as a name relative to that home.
            shared = real_home / "agent-homes" / "shared" / "omp"
            ambient = {
                "HOME": "/ambient",
                "PI_CONFIG_DIR": "/ambient-config",
                "OPENAI_API_KEY": "ambient-provider-key",
                "AWS_PROFILE": "ambient-cloud-profile",
                "OMP_AUTH_BROKER_URL": "https://ambient.invalid",
                "OMP_AUTH_BROKER_TOKEN": "ambient-broker-token",
            }
            environments = [
                cap._agent_home_env(
                    ambient,
                    shared,
                    root / "renders" / profile,
                    real_home,
                )
                for profile in cap.RUNNABLE_PROFILES
            ]

        self.assertEqual(
            {environment["PI_CODING_AGENT_DIR"] for environment in environments},
            {str(shared)},
        )
        # omp reads PI_CONFIG_DIR as a name under the home, not as a root path.
        self.assertEqual(
            {environment["PI_CONFIG_DIR"] for environment in environments},
            {"agent-homes/shared/omp"},
        )
        self.assertEqual(
            {environment["HOME"] for environment in environments},
            {str(real_home)},
        )
        for environment in environments:
            self.assertNotIn("OMP_AUTH_BROKER_URL", environment)
            self.assertNotIn("OMP_AUTH_BROKER_TOKEN", environment)
            self.assertEqual(environment["OPENAI_API_KEY"], "")
            self.assertEqual(environment["AWS_PROFILE"], "")
            self.assertEqual(environment["PI_AUTH_NO_BORROW"], "1")
            self.assertEqual(environment["AWS_EC2_METADATA_DISABLED"], "true")

    def test_runtime_id_resolves_only_inside_approved_user_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary) / "home"
            home.mkdir()
            args = cap.argparse.Namespace(
                home=str(home),
                omp_runtime_id="default",
                omp_runtime_root=None,
            )
            expected = (
                home
                / ".agent-system-state"
                / "runtimes"
                / "omp"
                / "default"
            )
            self.assertEqual(cap._agent_home_dir(args), expected)
            args.omp_runtime_id = "work-account"
            self.assertEqual(
                cap._agent_home_dir(args),
                expected.parent / "work-account",
            )
            args.omp_runtime_root = str(home / ".omp")
            with self.assertRaisesRegex(
                cap._MigrationError, "approved HOME/id path"
            ):
                cap._agent_home_dir(args)
            args.omp_runtime_id = "../escape"
            args.omp_runtime_root = None
            with self.assertRaisesRegex(
                cap._MigrationError, "lowercase kebab-case"
            ):
                cap._agent_home_dir(args)

    def test_fresh_and_other_clients_keep_explicit_auth_root(self) -> None:
        root = Path("/private/test")
        common = [
            "--auth-root",
            str(root / "auth"),
            "--profile-tool",
            str(root / "profile.py"),
        ]
        for client in ("codex", "qoder", "omp"):
            args = cap._build_parser().parse_args(
                [
                    *common,
                    "use",
                    "general",
                    "--cli",
                    client,
                    "--fresh",
                ]
            )
            args.client_args = []
            command = cap._profile_args(args)
            self.assertIn("--auth-root", command)
            self.assertIn(str(root / "auth"), command)

    def test_receipt_reports_shared_runtime_without_auth_material(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binding_dir = root / "bindings"
            binding_dir.mkdir()
            (binding_dir / "general.binding.json").write_text(
                json.dumps(
                    {
                        "base_digest": "sha256:base",
                        "layer_digest": "sha256:layer",
                        "effective_digest": "sha256:effective",
                    }
                ),
                encoding="utf-8",
            )
            workdir = root / "workdir"
            workdir.mkdir()
            receipt = root / "receipt.json"
            generation = root / "renders" / "general" / "hash"
            generation.mkdir(parents=True)
            (generation / ".cap-generation.json").write_text(
                json.dumps(
                    {
                        "source_context": {
                            "profile": "general",
                            "layer_digest": "sha256:layer",
                        },
                        "source_digest": "sha256:source",
                    }
                ),
                encoding="utf-8",
            )
            args = cap.argparse.Namespace(
                binding_dir=str(binding_dir),
                profile="general",
                cli="omp",
                project=str(root / "project"),
                omp_runtime_id="default",
                workdir=str(workdir),
                client_args=["-p", "check"],
            )
            shared = root / ".cap-user-state" / "runtimes" / "omp" / "default"

            cap._write_receipt(
                args,
                receipt,
                0,
                "sha256:portable",
                "sha256:effective-render",
                shared,
                generation,
            )
            payload = json.loads(receipt.read_text(encoding="utf-8"))
            serialized = json.dumps(payload)

        self.assertEqual(payload["version"], 4)
        self.assertEqual(payload["profile"], "general")
        self.assertEqual(payload["runtime_id"], "default")
        self.assertEqual(payload["global_runtime_root"], str(shared))
        self.assertEqual(payload["global_generation"], str(generation))
        self.assertEqual(payload["project_source_digest"], "sha256:source")
        self.assertEqual(payload["portable_tree_hash"], "sha256:portable")
        self.assertNotIn("broker", serialized.lower())
        self.assertNotIn("token", serialized.lower())
        self.assertNotIn("auth-root", serialized.lower())

    def test_command_uses_current_overlay_and_shared_session_space(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            commands: list[list[str]] = []
            for profile, skills in (
                ("general", ["openspec-apply-change"]),
                ("agent-assembler", ["agent-assembler"]),
            ):
                generation = root / profile
                generation.mkdir()
                (generation / "system-prompt.md").write_text(
                    f"{profile} prompt\n", encoding="utf-8"
                )
                (generation / "config.yml").write_text("{}\n", encoding="utf-8")
                (generation / "extension").mkdir()
                commands.append(
                    cap._omp_command(
                        generation,
                        skills,
                        ["--resume", "shared-session"],
                    )
                )

        for command, profile in zip(
            commands, ("general", "agent-assembler"), strict=True
        ):
            self.assertEqual(
                command[command.index("--append-system-prompt") + 1],
                f"{profile} prompt\n",
            )
            self.assertIn("--extension", command)
            self.assertIn("--no-extensions", command)
            self.assertIn("--no-rules", command)
            self.assertNotIn("--session-dir", command)
            self.assertEqual(command[-2:], ["--resume", "shared-session"])
        self.assertNotEqual(
            commands[0][commands[0].index("--skills") + 1],
            commands[1][commands[1].index("--skills") + 1],
        )


class ProfileGenerationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.bindings = self.root / "bindings"
        self.bindings.mkdir()
        for profile in ("general", "agent-assembler"):
            (self.bindings / f"{profile}.binding.json").write_text(
                json.dumps(
                    {
                        "layer_digest": f"sha256:layer-{profile}",
                        "effective_digest": f"sha256:effective-{profile}",
                    }
                ),
                encoding="utf-8",
            )
        for project_name in ("project", "project-copy"):
            cap_dir = self.root / project_name / ".cap"
            cap_dir.mkdir(parents=True)
            runtime_dir = cap_dir / "runtime"
            runtime_dir.mkdir()
            (runtime_dir / "omp.toml").write_text(
                'version = 1\nclient = "omp"\n\n[policy]\n'
                'memory_backend = "off"\nenable_project_mcp = false\n',
                encoding="utf-8",
            )
            (cap_dir / "lock.json").write_text(
                json.dumps(
                    {
                        "clients": {
                            "omp": {"adapter_version": 8}
                        }
                    }
                ),
                encoding="utf-8",
            )

    def args(self, profile: str, project_name: str = "project") -> object:
        return cap.argparse.Namespace(
            profile=profile,
            agent_home_root=str(self.root / "agent-homes"),
            home=str(self.home),
            omp_runtime_id="default",
            omp_runtime_root=None,
            profile_tool=str(self.root / "profile.py"),
            project=str(self.root / project_name),
            base_manifest=str(self.root / "base.json"),
            base_pin=str(self.root / "pin.json"),
            binding_dir=str(self.bindings),
        )

    def render(self, command: list[str], **_: object) -> object:
        output = Path(command[command.index("--output") + 1])
        profile = command[command.index("--profile") + 1]
        skills = (
            ["openspec-apply-change"]
            if profile == "general"
            else ["agent-assembler", "openspec-apply-change"]
        )
        (output / "skills").mkdir()
        for skill in skills:
            skill_root = output / "skills" / skill
            skill_root.mkdir()
            (skill_root / "SKILL.md").write_text(
                f"---\nname: {skill}\ndescription: test\n---\n",
                encoding="utf-8",
            )
        (output / "config.yml").write_text("{}\n", encoding="utf-8")
        (output / "mcp.json").write_text(
            '{"mcpServers":{}}\n', encoding="utf-8"
        )
        (output / "system-prompt.md").write_text(
            f"{profile} prompt\n", encoding="utf-8"
        )
        return cap.subprocess.CompletedProcess(
            command,
            0,
            stdout=json.dumps({"tree_hash": f"sha256:{profile}"}),
            stderr="",
        )

    def test_effective_config_and_immutable_reuse(self) -> None:
        args = self.args("general")
        with patch.object(cap.subprocess, "run", side_effect=self.render):
            first = cap._materialize_profile_generation(args, {})
            first_mtime = first[0].stat().st_mtime_ns
            second = cap._materialize_profile_generation(args, {})

        self.assertEqual(first, second)
        self.assertEqual(first[0].stat().st_mtime_ns, first_mtime)
        config = yaml_from(first[0] / "config.yml")
        self.assertEqual(config["memory"]["backend"], "off")
        self.assertFalse(config["mcp"]["enableProjectConfig"])
        self.assertEqual(
            config["skills"]["customDirectories"],
            [str(first[0] / "skills")],
        )
        self.assertEqual(
            config["skills"]["includeSkills"],
            ["openspec-apply-change"],
        )
        for key in (
            "enableCodexUser",
            "enableClaudeUser",
            "enableClaudeProject",
            "enablePiUser",
            "enablePiProject",
            "enableAgentsUser",
            "enableAgentsProject",
        ):
            self.assertFalse(config["skills"][key])
        self.assertTrue((first[0] / "extension" / ".mcp.json").is_file())

    def test_tampering_is_rejected(self) -> None:
        args = self.args("general")
        with patch.object(cap.subprocess, "run", side_effect=self.render):
            generation, *_ = cap._materialize_profile_generation(args, {})
            (generation / "system-prompt.md").write_text(
                "tampered\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(
                cap._MigrationError, "content drifted"
            ):
                cap._materialize_profile_generation(args, {})

    def test_extra_generation_file_is_rejected(self) -> None:
        args = self.args("general")
        with patch.object(cap.subprocess, "run", side_effect=self.render):
            generation, *_ = cap._materialize_profile_generation(args, {})
            (generation / "unexpected.txt").write_text(
                "unexpected\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(
                cap._MigrationError, "content drifted"
            ):
                cap._materialize_profile_generation(args, {})

    def test_source_context_and_digest_mismatch_are_rejected(self) -> None:
        args = self.args("general")
        with patch.object(cap.subprocess, "run", side_effect=self.render):
            generation, *_ = cap._materialize_profile_generation(args, {})
            manifest_path = generation / ".cap-generation.json"
            manifest = json.loads(
                manifest_path.read_text(encoding="utf-8")
            )
            manifest["source_context"]["layer_digest"] = "sha256:wrong"
            manifest["source_digest"] = "sha256:wrong"
            manifest_path.write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            with self.assertRaisesRegex(
                cap._MigrationError, "metadata drifted"
            ):
                cap._materialize_profile_generation(args, {})


    def test_profiles_and_concurrent_materialization_do_not_collide(self) -> None:
        def materialize(profile: str) -> tuple[Path, str, str, list[str]]:
            return cap._materialize_profile_generation(
                self.args(profile), {}
            )

        with (
            patch.object(cap.subprocess, "run", side_effect=self.render),
            ThreadPoolExecutor(max_workers=4) as executor,
        ):
            results = list(
                    executor.map(
                        materialize,
                        [
                            "general",
                            "agent-assembler",
                            "general",
                            "agent-assembler",
                        ],
                    )
                )

        general_paths = {result[0] for result in results[::2]}
        helper_paths = {result[0] for result in results[1::2]}
        self.assertEqual(len(general_paths), 1)
        self.assertEqual(len(helper_paths), 1)
        self.assertTrue(general_paths.isdisjoint(helper_paths))
        for result in results:
            manifest = json.loads(
                (result[0] / ".cap-generation.json").read_text(
                    encoding="utf-8"
                )
            )
            cap._verify_profile_generation(
                result[0],
                manifest["profile"],
                result[1],
                result[2],
                manifest["source_context"],
                manifest["source_digest"],
                manifest["runtime_policy"],
            )

    def test_global_cas_rebuilds_and_reuses_across_worktrees(self) -> None:
        with patch.object(cap.subprocess, "run", side_effect=self.render):
            first = cap._materialize_profile_generation(
                self.args("general", "project"), {}
            )
            cap.shutil.rmtree(first[0])
            rebuilt = cap._materialize_profile_generation(
                self.args("general", "project"), {}
            )
            reused = cap._materialize_profile_generation(
                self.args("general", "project-copy"), {}
            )
        self.assertEqual(first[0], rebuilt[0])
        self.assertEqual(rebuilt[0], reused[0])

    def test_cache_never_authorizes_unknown_profile(self) -> None:
        def reject_unknown(command: list[str], **_: object) -> object:
            return cap.subprocess.CompletedProcess(
                command,
                2,
                stdout="",
                stderr="unknown profile",
            )
        fake_cache = (
            self.home
            / ".cap-user-state"
            / "renders"
            / "omp"
            / "preexisting-undeclared-profile"
        )
        fake_cache.mkdir(parents=True)
        (fake_cache / ".cap-generation.json").write_text(
            json.dumps(
                {
                    "version": 2,
                    "profile": "not-declared",
                    "source_digest": "sha256:untrusted",
                }
            ),
            encoding="utf-8",
        )

        with (
            patch.object(
                cap.subprocess, "run", side_effect=reject_unknown
            ),
            contextlib.redirect_stderr(io.StringIO()),
            self.assertRaises(SystemExit),
        ):
            cap._materialize_profile_generation(
                self.args("not-declared"), {}
            )


class OmpRuntimeMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.agent_root = self.root / "project.agent-homes"
        self.args = cap.argparse.Namespace(
            home=str(self.home),
            omp_runtime_id="default",
            omp_runtime_root=None,
            agent_home_root=str(self.agent_root),
            auth_root=str(self.root / "project.auth"),
        )

    def make_runtime(
        self,
        runtime: Path,
        *,
        identity: str | None = None,
        config: dict[str, object] | None = None,
        sessions: dict[str, str] | None = None,
        global_marker: bool = False,
    ) -> Path:
        runtime.mkdir(parents=True, mode=0o700)
        runtime.chmod(0o700)
        database = runtime / "agent.db"
        connection = cap.sqlite3.connect(database)
        connection.executescript(
            """
            CREATE TABLE auth_credentials (
                provider TEXT,
                credential_type TEXT,
                identity_key TEXT,
                disabled_cause TEXT
            );
            CREATE TABLE auth_schema_version (version INTEGER);
            INSERT INTO auth_schema_version VALUES (1);
            CREATE TABLE schema_version (version INTEGER);
            INSERT INTO schema_version VALUES (1);
            CREATE TABLE settings (key TEXT, value TEXT);
            """
        )
        if identity is not None:
            connection.execute(
                "INSERT INTO auth_credentials VALUES (?, ?, ?, NULL)",
                ("openai-codex", "oauth", identity),
            )
        connection.commit()
        connection.close()
        database.chmod(0o600)
        (runtime / "config.yml").write_text(
            cap.yaml.safe_dump(config or {}, sort_keys=True),
            encoding="utf-8",
        )
        (runtime / "config.yml").chmod(0o600)
        cap._write_shared_mcp_policy(runtime)
        for relative, content in (sessions or {}).items():
            path = runtime / "sessions" / relative
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            path.write_text(content, encoding="utf-8")
            path.chmod(0o600)
        if global_marker:
            (runtime / ".cap-shared-runtime.json").write_text(
                json.dumps(
                    {
                        "version": 2,
                        "runtime_id": "default",
                        "migration_complete": True,
                        "session_files": len(sessions or {}),
                    }
                ),
                encoding="utf-8",
            )
        return runtime

    def test_dry_run_selects_project_source(self) -> None:
        source = self.make_runtime(
            cap._project_shared_omp_home(self.args),
            identity="account",
            config={"theme": {"dark": "titanium"}},
            sessions={"project/source.jsonl": "source\n"},
        )

        public, summaries, canonical, config, sessions = cap._migration_plan(
            self.args
        )

        self.assertEqual(canonical, "project-shared")
        self.assertEqual(public["runtime_id"], "default")
        self.assertTrue(public["source"]["exists"])
        self.assertFalse(public["target"]["exists"])
        self.assertEqual(public["session_files"], 1)
        self.assertEqual(config["memory"]["backend"], "off")
        self.assertEqual(
            summaries["project-shared"].root, source
        )
        self.assertNotIn("account", json.dumps(public))
        self.assertEqual(set(sessions), {"project/source.jsonl"})
    def test_dry_run_is_read_only_and_secret_safe(self) -> None:
        source = self.make_runtime(
            cap._project_shared_omp_home(self.args),
            identity="account",
            config={"memory": {"backend": "sqlite"}, "theme": {"dark": "titanium"}},
            sessions={"project/source.jsonl": "source\n"},
        )
        before = {
            path.relative_to(source).as_posix(): path.read_bytes()
            for path in source.rglob("*")
            if path.is_file()
        }

        public, _, _, config, _ = cap._migration_plan(self.args)

        after = {
            path.relative_to(source).as_posix(): path.read_bytes()
            for path in source.rglob("*")
            if path.is_file()
        }
        self.assertEqual(after, before)
        self.assertEqual(config["memory"], {"backend": "off"})
        self.assertNotIn("account", json.dumps(public))
        self.assertFalse(cap._agent_home_dir(self.args).exists())
        self.assertFalse(cap._migration_backup_root(self.args).exists())

    def test_apply_quarantines_legacy_state_until_cleanup(self) -> None:
        source = self.make_runtime(
            cap._project_shared_omp_home(self.args),
            identity="account",
            sessions={"project/source.jsonl": "source\n"},
        )
        public, summaries, canonical, config, sessions = cap._migration_plan(
            self.args
        )

        result = cap._apply_omp_runtime_migration(
            self.args, public, summaries, canonical, config, sessions
        )

        backup = cap._migration_backup_root(self.args) / "project-shared"
        self.assertEqual(result["status"], "migrated-global")
        self.assertTrue(source.is_dir())
        self.assertTrue(backup.is_dir())
        self.assertEqual(
            (backup / "sessions" / "project/source.jsonl").read_text(
                encoding="utf-8"
            ),
            "source\n",
        )
        self.assertTrue((backup / "agent.db").is_file())
    def test_rollback_restores_legacy_runtime_and_removes_new_target(self) -> None:
        source = self.make_runtime(
            cap._project_shared_omp_home(self.args),
            identity="account",
            config={"theme": {"dark": "before"}},
            sessions={"project/source.jsonl": "source\n"},
        )
        public, summaries, canonical, config, sessions = cap._migration_plan(
            self.args
        )
        cap._apply_omp_runtime_migration(
            self.args, public, summaries, canonical, config, sessions
        )
        (cap._agent_home_dir(self.args) / "config.yml").write_text(
            "theme:\n  dark: changed\n", encoding="utf-8"
        )

        result = cap._rollback_omp_runtime(self.args)

        self.assertEqual(result["status"], "rolled-back")
        self.assertEqual(
            (source / "config.yml").read_text(encoding="utf-8"),
            "memory:\n  backend: 'off'\ntheme:\n  dark: before\n",
        )
        self.assertFalse(cap._agent_home_dir(self.args).exists())
        self.assertFalse(cap._migration_backup_root(self.args).exists())

    def test_apply_installs_global_runtime_and_is_idempotent(self) -> None:
        self.make_runtime(
            cap._project_shared_omp_home(self.args),
            identity="account",
            sessions={"project/source.jsonl": "source\n"},
        )
        public, summaries, canonical, config, sessions = cap._migration_plan(
            self.args
        )

        result = cap._apply_omp_runtime_migration(
            self.args, public, summaries, canonical, config, sessions
        )
        second = cap._migration_plan(self.args)[0]

        global_runtime = cap._agent_home_dir(self.args)
        self.assertEqual(result["status"], "migrated-global")
        self.assertEqual(second["status"], "ready")
        self.assertTrue((global_runtime / "agent.db").is_file())
        self.assertTrue(
            (
                global_runtime
                / "sessions"
                / "project/source.jsonl"
            ).is_file()
        )
        marker = json.loads(
            (global_runtime / ".cap-shared-runtime.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(marker["version"], 2)
        self.assertEqual(marker["runtime_id"], "default")
        self.assertTrue(cap._migration_backup_root(self.args).is_dir())

    def test_existing_equivalent_global_target_merges_sessions(self) -> None:
        self.make_runtime(
            cap._project_shared_omp_home(self.args),
            identity="account",
            sessions={"source/source.jsonl": "source\n"},
        )
        self.make_runtime(
            cap._agent_home_dir(self.args),
            identity="account",
            sessions={"target/target.jsonl": "target\n"},
            global_marker=True,
        )
        public, summaries, canonical, config, sessions = cap._migration_plan(
            self.args
        )
        self.assertEqual(canonical, "global")
        self.assertEqual(set(sessions), {
            "source/source.jsonl",
            "target/target.jsonl",
        })
        cap._apply_omp_runtime_migration(
            self.args, public, summaries, canonical, config, sessions
        )
        target = cap._agent_home_dir(self.args) / "sessions"
        self.assertTrue((target / "source/source.jsonl").is_file())
        self.assertTrue((target / "target/target.jsonl").is_file())

    def test_conflicts_and_active_writer_fail_before_install(self) -> None:
        source = self.make_runtime(
            cap._project_shared_omp_home(self.args),
            identity="source-account",
            config={"theme": {"dark": "one"}},
            sessions={"same.jsonl": "one\n"},
        )
        self.make_runtime(
            cap._agent_home_dir(self.args),
            identity="target-account",
            config={"theme": {"dark": "two"}},
            sessions={"same.jsonl": "two\n"},
            global_marker=True,
        )
        with self.assertRaises(cap._MigrationError):
            cap._migration_plan(self.args)

        cap.shutil.rmtree(cap._agent_home_dir(self.args))
        connection = cap.sqlite3.connect(source / "agent.db", timeout=0.05)
        connection.execute("BEGIN IMMEDIATE")
        try:
            with self.assertRaisesRegex(
                cap._MigrationError, "busy or unreadable"
            ):
                cap._migration_plan(self.args)
        finally:
            connection.rollback()
            connection.close()

    def test_failed_install_removes_stage_and_backup(self) -> None:
        self.make_runtime(cap._project_shared_omp_home(self.args))
        public, summaries, canonical, config, sessions = cap._migration_plan(
            self.args
        )
        with (
            patch.object(cap.os, "rename", side_effect=OSError("failed")),
            self.assertRaises(OSError),
        ):
            cap._apply_omp_runtime_migration(
                self.args, public, summaries, canonical, config, sessions
            )
        self.assertFalse(cap._agent_home_dir(self.args).exists())
        self.assertFalse(cap._migration_backup_root(self.args).exists())
        self.assertTrue(cap._project_shared_omp_home(self.args).exists())

    def test_cleanup_removes_only_project_migration_state(self) -> None:
        self.make_runtime(
            cap._project_shared_omp_home(self.args),
            identity="account",
        )
        from agent_system.omp import runtime as omp_runtime

        generation = omp_runtime._global_render_root(self.args) / "deadbeef"
        generation.mkdir(parents=True)
        (generation / ".cap-generation.json").write_text("{}", encoding="utf-8")
        public, summaries, canonical, config, sessions = cap._migration_plan(
            self.args
        )
        cap._apply_omp_runtime_migration(
            self.args, public, summaries, canonical, config, sessions
        )

        result = cap._cleanup_legacy_omp_runtime(self.args)

        self.assertEqual(result["status"], "cleaned-project-state")
        self.assertFalse(cap._project_shared_omp_home(self.args).exists())
        self.assertFalse(cap._migration_backup_root(self.args).exists())
        self.assertTrue(cap._agent_home_dir(self.args).is_dir())
        # The global render CAS is current state, not migration leftovers.
        self.assertTrue((generation / ".cap-generation.json").is_file())
        outside = self.root / "outside"
        outside.mkdir()
        with self.assertRaisesRegex(
            cap._MigrationError, "outside the CAP state root"
        ):
            cap._safe_remove_tree(self.agent_root, outside, "outside")

    def test_cleanup_preserves_render_cas_in_production_layout(self) -> None:
        """Reproduce the real default layout, where the roots overlap.

        `setUp` puts `agent_home_root` outside `home`, so the roots never
        overlap and the historical cleanup bug could not surface there. In
        production `--agent-state-root` defaults to `$HOME/.agent-system-state`,
        which makes it the parent of the global render CAS.
        """

        from agent_system.omp import runtime as omp_runtime

        args = cap.argparse.Namespace(
            home=str(self.home),
            omp_runtime_id="default",
            omp_runtime_root=None,
            agent_home_root=str(self.home / ".agent-system-state"),
            auth_root=str(self.root / "project.auth"),
        )
        cas = omp_runtime._global_render_root(args)
        self.assertTrue(
            cas.is_relative_to(omp_runtime._agent_home_root(args) / "renders"),
            "test must reproduce the overlapping production layout",
        )

        generation = cas / "deadbeef"
        generation.mkdir(parents=True)
        (generation / ".cap-generation.json").write_text("{}", encoding="utf-8")

        self.make_runtime(
            omp_runtime._project_shared_omp_home(args), identity="account"
        )
        public, summaries, canonical, config, sessions = cap._migration_plan(args)
        cap._apply_omp_runtime_migration(
            args, public, summaries, canonical, config, sessions
        )
        cap._cleanup_legacy_omp_runtime(args)

        self.assertTrue(
            (generation / ".cap-generation.json").is_file(),
            "cleanup must not remove the global render CAS",
        )

    def test_safe_remove_tree_refuses_ancestor_of_preserved_state(self) -> None:
        renders = self.agent_root / "renders"
        generation = renders / "omp" / "deadbeef"
        generation.mkdir(parents=True)
        (generation / ".cap-generation.json").write_text("{}", encoding="utf-8")

        with self.assertRaisesRegex(
            cap._MigrationError, "would remove preserved state"
        ):
            cap._safe_remove_tree(
                self.agent_root,
                renders,
                "project-render-cache",
                protected=(generation.parent,),
            )
        self.assertTrue((generation / ".cap-generation.json").is_file())


def yaml_from(path: Path) -> dict[str, object]:
    payload = cap.yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    return payload


def json_from(buffer: io.StringIO) -> dict[str, object]:
    import json

    payload = json.loads(buffer.getvalue())
    assert isinstance(payload, dict)
    return payload


if __name__ == "__main__":
    unittest.main()
