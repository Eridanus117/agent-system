#!/usr/bin/env python3
"""Tests for tools/plugin_release.

重点不是「一致时报一致」——那个不出错也没用。重点是**每一种漂移都真的被抓到**，
尤其 `modified`：版本号相同、内容不同，是唯一会骗过所有版本号检查的情形。
"""

from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import plugin_release as pr  # noqa: E402


PLUGINS = {"alpha": "1.2.3", "beta": "0.4.0"}


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")


def build_source(root: Path) -> None:
    """A miniature agent-plugins: two plugins, six version declarations, one git commit."""
    for name, version in PLUGINS.items():
        for directory in (".claude-plugin", ".codex-plugin"):
            write(
                root / "plugins" / name / directory / "plugin.json",
                json.dumps({"name": name, "version": version, "description": f"{name} skill"}, indent=2)
                + "\n",
            )
        write(root / "plugins" / name / "skills" / "main" / "SKILL.md", f"# {name}\n\n正文。\n")

    entries = [{"name": n, "version": v, "source": f"./plugins/{n}"} for n, v in PLUGINS.items()]
    write(root / ".claude-plugin" / "marketplace.json", json.dumps({"plugins": entries}, indent=2) + "\n")
    write(
        root / ".agents" / "plugins" / "marketplace.json",
        json.dumps(
            {"plugins": [{"name": n, "version": v, "source": {"path": f"./plugins/{n}"}} for n, v in PLUGINS.items()]},
            indent=2,
        )
        + "\n",
    )
    write(root / "tests" / "workflow-routing.json", json.dumps({"pluginVersions": PLUGINS}, indent=2) + "\n")
    write(
        root / "README.md",
        # 第 3 行是历史叙述，故意写出与总览同形态的字符串：发布必须不碰它。
        "# 小仓\n\n"
        "`alpha` `1.2.2` 那一版做了别的事情，这句是历史叙述，不随新版本改写。\n\n"
        "仓库目前包含两个可安装 Plugin：`alpha` `1.2.3`、`beta` `0.4.0`。\n",
    )
    subprocess.run(["git", "init", "-q"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@example.com"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=root, check=True, capture_output=True)


def install_all(source: Path, cache: Path) -> None:
    """Byte-for-byte copy into <cache>/<plugin>/<version>/, the way the real runtimes do."""
    import shutil

    for name, version in PLUGINS.items():
        destination = cache / name / version
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source / "plugins" / name, destination)


def make_data(source: Path) -> dict:
    return {
        "schema": "agent-control.plugin-release-targets",
        "version": 1,
        "source": {
            "repository": str(source),
            "plugins_path": "plugins",
            "declaration": "tests/workflow-routing.json",
            "declaration_key": "pluginVersions",
            "marketplace_name": "agent-plugins",
            "conformance_tests": [],
        },
        "runtimes": [],
    }


class TreeDigestTest(unittest.TestCase):
    def test_same_content_same_digest_and_one_byte_flips_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a", Path(tmp) / "b"
            for root in (a, b):
                write(root / "x" / "f.md", "内容\n")
            self.assertEqual(pr.tree_digest(a), pr.tree_digest(b))
            write(b / "x" / "f.md", "内容!\n")
            self.assertNotEqual(pr.tree_digest(a), pr.tree_digest(b))

    def test_renaming_a_file_changes_the_digest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a", Path(tmp) / "b"
            write(a / "one.md", "同样的字节\n")
            write(b / "two.md", "同样的字节\n")
            self.assertNotEqual(pr.tree_digest(a), pr.tree_digest(b))

    def test_missing_directory_is_none_not_an_empty_digest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(pr.tree_digest(Path(tmp) / "nope"))


class VersionTest(unittest.TestCase):
    def test_bump(self) -> None:
        self.assertEqual(pr.bump_version("0.3.18", "patch"), "0.3.19")
        self.assertEqual(pr.bump_version("0.3.18", "minor"), "0.4.0")
        self.assertEqual(pr.bump_version("0.3.18", "major"), "1.0.0")

    def test_non_semver_is_refused(self) -> None:
        with self.assertRaises(pr.ReleaseError):
            pr.bump_version("0.3", "patch")

    def test_replace_once_refuses_zero_or_many(self) -> None:
        pattern = re.compile(r"x")
        self.assertEqual(pr.replace_once("axb", pattern, "y", "t"), "ayb")
        for text in ("ab", "axbx"):
            with self.assertRaises(pr.ReleaseError):
                pr.replace_once(text, pattern, "y", "t")


class SourceRootTest(unittest.TestCase):
    def test_tilde_expands_to_home_so_targets_json_needs_no_user_name(self) -> None:
        # targets.json 在公开仓里，源仓位置写 ~ 开头，不写死带用户名的绝对路径。
        data = {"source": {"repository": "~/workspace/agent-plugins"}}
        self.assertEqual(pr.source_root_of(data), Path.home() / "workspace" / "agent-plugins")

    def test_absolute_path_is_kept_as_is(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(pr.source_root_of({"source": {"repository": tmp}}), Path(tmp))


class CheckStateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.source = root / "src"
        self.cache = root / "cache"
        build_source(self.source)
        install_all(self.source, self.cache)
        self.data = make_data(self.source)
        self.runtime = pr.Runtime("r1", "运行端一", self.cache, {}, None)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def states(self) -> dict[str, str]:
        report = pr.check(self.data, [self.runtime])
        return {entry.plugin: entry.states["r1"] for entry in report.plugins}

    def test_clean_install_is_ok(self) -> None:
        self.assertEqual(self.states(), {"alpha": pr.STATE_OK, "beta": pr.STATE_OK})
        self.assertFalse(pr.check(self.data, [self.runtime]).failures)

    def test_modified_is_caught_even_though_the_version_number_still_matches(self) -> None:
        # 这是唯一骗得过所有版本号检查的情形，也是本工具存在的理由。
        target = self.cache / "alpha" / "1.2.3" / "skills" / "main" / "SKILL.md"
        target.write_text("# alpha\n\n被改过的正文。\n", encoding="utf-8", newline="")
        self.assertEqual(self.states()["alpha"], pr.STATE_MODIFIED)

    def test_deleting_a_file_from_the_installed_copy_is_caught(self) -> None:
        (self.cache / "alpha" / "1.2.3" / "skills" / "main" / "SKILL.md").unlink()
        self.assertEqual(self.states()["alpha"], pr.STATE_MODIFIED)

    def test_stale_when_only_another_version_is_installed(self) -> None:
        (self.cache / "alpha" / "1.2.3").rename(self.cache / "alpha" / "1.2.2")
        self.assertEqual(self.states()["alpha"], pr.STATE_STALE)

    def test_missing_when_the_plugin_was_never_installed(self) -> None:
        import shutil

        shutil.rmtree(self.cache / "beta")
        self.assertEqual(self.states()["beta"], pr.STATE_MISSING)

    def test_surplus_version_directories_are_reported_but_do_not_fail(self) -> None:
        import shutil

        shutil.copytree(self.cache / "alpha" / "1.2.3", self.cache / "alpha" / "1.0.0")
        report = pr.check(self.data, [self.runtime])
        self.assertFalse(report.failures)
        self.assertEqual(report.extra_versions, [("alpha", "r1", ["1.0.0"])])

    def test_a_plugin_missing_from_the_declaration_is_a_source_problem(self) -> None:
        write(self.source / "plugins" / "gamma" / "skills" / "main" / "SKILL.md", "# gamma\n")
        with self.assertRaises(pr.ReleaseError) as caught:
            pr.check(self.data, [self.runtime])
        self.assertIn("gamma", str(caught.exception))

    def test_branch_and_dirty_state_are_reported(self) -> None:
        report = pr.check(self.data, [self.runtime])
        self.assertFalse(report.source.dirty)
        write(self.source / "README.md", "改过\n")
        self.assertTrue(pr.check(self.data, [self.runtime]).source.dirty)


class CacheAliasTest(unittest.TestCase):
    """两个运行端指向同一份缓存时，比两次不是两次验证，是同一次。"""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.source = root / "src"
        self.cache = root / "cache"
        build_source(self.source)
        install_all(self.source, self.cache)
        self.data = make_data(self.source)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_identical_paths_collapse_to_one(self) -> None:
        first = pr.Runtime("codex", "Codex", self.cache, {}, None)
        second = pr.Runtime("orca-codex", "Orca 内的 Codex", self.cache, {}, None)
        third = pr.Runtime("claude", "Claude", self.cache.parent / "other", {}, None)
        aliases = pr.cache_aliases([first, second, third])
        self.assertEqual(aliases, {"orca-codex": "codex"})

    def test_aliased_runtime_is_not_counted_as_independent_verification(self) -> None:
        runtimes = [
            pr.Runtime("codex", "Codex", self.cache, {}, None),
            pr.Runtime("orca-codex", "Orca 内的 Codex", self.cache, {}, None),
        ]
        report = pr.check(self.data, runtimes)
        self.assertEqual(report.distinct_caches, 1)
        for entry in report.plugins:
            self.assertEqual(entry.states["codex"], pr.STATE_OK)
            self.assertEqual(entry.states["orca-codex"], pr.STATE_ALIAS)
        self.assertFalse(report.failures)

    def test_alias_does_not_mask_real_drift_on_the_primary(self) -> None:
        runtimes = [
            pr.Runtime("codex", "Codex", self.cache, {}, None),
            pr.Runtime("orca-codex", "Orca 内的 Codex", self.cache, {}, None),
        ]
        (self.cache / "alpha" / "1.2.3" / "skills" / "main" / "SKILL.md").write_text(
            "改过\n", encoding="utf-8", newline=""
        )
        report = pr.check(self.data, runtimes)
        self.assertEqual([f for f in report.failures], [("alpha", "codex", pr.STATE_MODIFIED)])


class HookGateTest(unittest.TestCase):
    """钩子每次会话都跑；它必须只在真漂移时说话，否则噪音会淹掉真信号。"""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.source = root / "src"
        self.cache = root / "cache"
        build_source(self.source)
        subprocess.run(["git", "branch", "-M", "main"], cwd=self.source, check=True, capture_output=True)
        install_all(self.source, self.cache)
        self.data = make_data(self.source)
        self.runtime = pr.Runtime("r1", "运行端一", self.cache, {}, None)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def message(self) -> str | None:
        return pr.format_hook(pr.check(self.data, [self.runtime]), Path("tool.py"))

    def break_install(self) -> None:
        (self.cache / "alpha" / "1.2.3" / "skills" / "main" / "SKILL.md").write_text(
            "被改过\n", encoding="utf-8", newline=""
        )

    # 这组判断改过三轮，注释保留全部来回，不抹掉错的那两轮：
    #
    # 一轮：模型「会话读版本缓存」→ 缓存漂移是告警，特性分支静默（当作进行中的工作）。
    # 二轮：`claude plugin details` 的 on-invoke 估算随工作树变化 → 改判「会话读工作树、
    #       缓存没人读」，告警对象整个对调。
    # 三轮：两次真实的新会话测试（Claude 与 Codex 各一次）报出的都是**缓存**里的旧
    #       description → 一轮的模型是对的；二轮是拿 CLI 检视命令的显示去推断会话行为，
    #       推错了。CLI 算的是「装了会是多大」，与会话加载是两条代码路径。
    #
    # 现在的判据：告警对象是缓存；但缓存对不对只有在工作树是 origin/main 的干净检出时
    # 才判得出来，否则如实说「判不出来」而不是假装没事。

    def test_silent_on_a_clean_main_checkout_with_no_drift(self) -> None:
        self.assertIsNone(self.message())

    def test_speaks_up_on_cache_drift_because_that_is_what_sessions_load(self) -> None:
        self.break_install()
        message = self.message()
        self.assertIsNotNone(message)
        self.assertIn("运行端装的不是", message)
        self.assertIn("alpha", message)

    def test_says_it_cannot_judge_on_a_feature_branch_instead_of_going_quiet(self) -> None:
        # 静默会让「有人把特性分支长期留在生产检出里」变成漂移检测的持续失明。
        subprocess.run(["git", "checkout", "-qb", "feature"], cwd=self.source, check=True, capture_output=True)
        message = self.message()
        self.assertIsNotNone(message)
        self.assertIn("判不出", message)
        self.assertIn("feature", message)

    def test_says_it_cannot_judge_when_the_working_tree_is_dirty(self) -> None:
        write(self.source / "README.md", "编辑中\n")
        message = self.message()
        self.assertIsNotNone(message)
        self.assertIn("判不出", message)
        self.assertIn("未提交", message)


class SyncVersionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.source = Path(self.tmp.name) / "src"
        build_source(self.source)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_all_six_declarations_move_together(self) -> None:
        touched = pr._sync_version(self.source, "alpha", "1.2.3", "1.2.4")
        self.assertEqual(len(touched), 6)
        for relative in (
            "plugins/alpha/.claude-plugin/plugin.json",
            "plugins/alpha/.codex-plugin/plugin.json",
            ".claude-plugin/marketplace.json",
            ".agents/plugins/marketplace.json",
            "tests/workflow-routing.json",
        ):
            self.assertIn("1.2.4", (self.source / relative).read_text(encoding="utf-8"), relative)

    def test_the_other_plugin_is_untouched(self) -> None:
        pr._sync_version(self.source, "alpha", "1.2.3", "1.2.4")
        market = json.loads((self.source / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
        versions = {entry["name"]: entry["version"] for entry in market["plugins"]}
        self.assertEqual(versions, {"alpha": "1.2.4", "beta": "0.4.0"})

    def test_readme_overview_moves_but_historical_prose_does_not(self) -> None:
        pr._sync_version(self.source, "alpha", "1.2.3", "1.2.4")
        lines = (self.source / "README.md").read_text(encoding="utf-8").splitlines()
        historical = next(line for line in lines if "历史叙述" in line)
        overview = next(line for line in lines if line.startswith("仓库目前包含"))
        self.assertIn("`alpha` `1.2.2`", historical)  # 历史段落原样保留
        self.assertIn("`alpha` `1.2.4`", overview)
        self.assertNotIn("`alpha` `1.2.3`", overview)

    def test_replaying_the_same_bump_fails_instead_of_silently_doing_nothing(self) -> None:
        pr._sync_version(self.source, "alpha", "1.2.3", "1.2.4")
        with self.assertRaises(pr.ReleaseError):
            pr._sync_version(self.source, "alpha", "1.2.3", "1.2.4")


class RetireTest(unittest.TestCase):
    """退役的重点不是删仓库文件，是确认已安装端也没了。"""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.source = root / "src"
        self.cache = root / "cache"
        build_source(self.source)
        install_all(self.source, self.cache)
        self.data = make_data(self.source)
        self.noop = [sys.executable, "-c", "pass"]

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def add_edge(self) -> None:
        path = self.source / "tests" / "workflow-routing.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["skills"] = {
            "alpha-main": {"plugin": "alpha"},
            "beta-main": {"plugin": "beta", "drive": ["alpha-main"]},
        }
        write(path, json.dumps(document, ensure_ascii=False, indent=2) + "\n")

    def test_inbound_routing_edge_blocks_retirement(self) -> None:
        self.add_edge()
        edges = pr.routing_inbound_edges(self.source, self.data, "alpha")
        self.assertEqual(edges, ["beta-main --drive--> alpha-main"])
        runtimes = [pr.Runtime("r1", "运行端一", self.cache, {}, None, self.noop)]
        with self.assertRaises(pr.ReleaseError) as caught:
            pr.retire(self.data, runtimes, "alpha", apply=True, allow_dirty=True, out=io.StringIO())
        self.assertIn("路由边", str(caught.exception))

    def test_source_removal_covers_every_declaration(self) -> None:
        pr._remove_from_source(self.source, "alpha", "1.2.3")
        self.assertFalse((self.source / "plugins" / "alpha").exists())
        for relative in (".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"):
            document = json.loads((self.source / relative).read_text(encoding="utf-8"))
            self.assertEqual([e["name"] for e in document["plugins"]], ["beta"], relative)
        fixture = json.loads((self.source / "tests" / "workflow-routing.json").read_text(encoding="utf-8"))
        self.assertEqual(list(fixture["pluginVersions"]), ["beta"])
        lines = (self.source / "README.md").read_text(encoding="utf-8").splitlines()
        overview = next(line for line in lines if line.startswith("仓库目前包含"))
        self.assertNotIn("alpha", overview)
        self.assertIn("`beta` `0.4.0`", overview)
        # 历史叙述段落照旧不碰
        self.assertTrue(any("`alpha` `1.2.2`" in line for line in lines))

    def test_retirement_fails_when_the_installed_copy_survives(self) -> None:
        # 卸载命令什么都不做——这正是「从 Marketplace 移除不等于卸载」的形状。
        runtimes = [pr.Runtime("r1", "运行端一", self.cache, {}, None, self.noop)]
        with self.assertRaises(pr.ReleaseError) as caught:
            pr.retire(self.data, runtimes, "alpha", apply=True, allow_dirty=True, out=io.StringIO())
        message = str(caught.exception)
        self.assertIn("退役未完成", message)
        self.assertIn("仍装着 1.2.3", message)

    def test_retirement_succeeds_once_the_cache_is_actually_gone(self) -> None:
        import shutil

        shutil.rmtree(self.cache / "alpha")
        runtimes = [pr.Runtime("r1", "运行端一", self.cache, {}, None, self.noop)]
        out = io.StringIO()
        self.assertEqual(
            pr.retire(self.data, runtimes, "alpha", apply=True, allow_dirty=True, out=out), 0
        )
        self.assertIn("退役完成", out.getvalue())

    def test_missing_uninstall_command_is_refused(self) -> None:
        runtimes = [pr.Runtime("r1", "运行端一", self.cache, {}, None, [])]
        with self.assertRaises(pr.ReleaseError) as caught:
            pr.retire(self.data, runtimes, "alpha", apply=True, allow_dirty=True, out=io.StringIO())
        self.assertIn("未声明卸载命令", str(caught.exception))

    def test_dry_run_changes_nothing(self) -> None:
        runtimes = [pr.Runtime("r1", "运行端一", self.cache, {}, None, self.noop)]
        before = pr.tree_digest(self.source / "plugins" / "alpha")
        pr.retire(self.data, runtimes, "alpha", apply=False, allow_dirty=True, out=io.StringIO())
        self.assertEqual(pr.tree_digest(self.source / "plugins" / "alpha"), before)


class LifecycleReadTest(unittest.TestCase):
    def test_absent_declaration_is_empty_not_an_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "src"
            build_source(source)
            self.assertEqual(pr.skill_lifecycle(source, make_data(source)), {})

    def test_entries_are_read_through(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "src"
            build_source(source)
            path = source / "tests" / "workflow-routing.json"
            document = json.loads(path.read_text(encoding="utf-8"))
            document["skillLifecycle"] = {
                "entries": {"a": {"lastVerified": None, "suspect": True}, "b": {"lastVerified": "2026-08-15"}}
            }
            write(path, json.dumps(document, ensure_ascii=False, indent=2) + "\n")
            entries = pr.skill_lifecycle(source, make_data(source))
            self.assertEqual(sorted(entries), ["a", "b"])


class RealTargetsTest(unittest.TestCase):
    def test_shipped_targets_file_parses_and_resolves(self) -> None:
        data = pr.load_targets()
        self.assertEqual(data["version"], pr.SCHEMA_VERSION)
        self.assertEqual([entry["id"] for entry in data["runtimes"]], ["claude", "codex", "orca-codex"])

    @unittest.skipUnless(os.name == "nt", "运行端路径是这台 Windows 机器的事实")
    def test_runtimes_resolve_on_this_machine(self) -> None:
        runtimes = pr.load_runtimes(pr.load_targets())
        self.assertEqual(len(runtimes), 3)
        for runtime in runtimes:
            self.assertTrue(runtime.cache.is_absolute(), runtime.id)


if __name__ == "__main__":
    unittest.main()
