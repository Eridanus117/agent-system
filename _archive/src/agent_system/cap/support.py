"""Shared command argument and path helpers."""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path


def _base_args(args: argparse.Namespace) -> list[str]:
    base = [
        sys.executable,
        str(Path(args.profile_tool).expanduser()),
        "--project",
        str(Path(args.project).expanduser()),
    ]
    private_overlay = getattr(args, "private_overlay", None)
    if private_overlay:
        base.extend(["--private-overlay", str(Path(private_overlay).expanduser())])
    return base
def _binding_args(args: argparse.Namespace) -> list[str]:
    return [
        "--machine-context-manifest",
        str(Path(args.base_manifest).expanduser()),
        "--machine-context-pin",
        str(Path(args.base_pin).expanduser()),
        "--assembly-binding-dir",
        str(Path(args.binding_dir).expanduser()),
    ]

def _run_path(args: argparse.Namespace, suffix: str) -> str:
    root = Path(args.project).expanduser()
    run_dir = root.with_name(f"{root.name}.runs")
    run_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    return str(run_dir / f"{args.profile}-{args.cli}-{stamp}-{os.getpid()}-{time.time_ns()}.{suffix}")

def _workdir(args: argparse.Namespace) -> Path:
    return (Path(args.workdir).expanduser() if args.workdir else Path.cwd()).resolve(strict=True)

def _passthrough(values: list[str]) -> list[str]:
    return values

