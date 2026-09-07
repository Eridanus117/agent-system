#!/usr/bin/env bun
import {
  doctorMounts,
  initMountFiles,
  planMounts,
  repairMounts,
  syncMounts,
  type MountLifecycleConfig,
} from './lifecycle';

function usage(): string {
  return 'usage: mounts <init|plan|sync|doctor|repair> --manifest <path> --roots <path> [--checkout <path>]';
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function lifecycleConfig(args: readonly string[]): MountLifecycleConfig | undefined {
  const manifestPath = option(args, '--manifest');
  const rootsPath = option(args, '--roots');
  const checkoutRoot = option(args, '--checkout');
  if (manifestPath === undefined || rootsPath === undefined || checkoutRoot === undefined) return undefined;
  return { manifestPath, rootsPath, checkoutRoot };
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

const [command, ...args] = process.argv.slice(2);
if (command === 'init') {
  const manifestPath = option(args, '--manifest');
  const rootsPath = option(args, '--roots');
  if (manifestPath === undefined || rootsPath === undefined) {
    console.error(usage());
    process.exitCode = 2;
  } else {
    print(initMountFiles({ manifestPath, rootsPath }));
  }
} else if (command === 'plan' || command === 'sync' || command === 'doctor' || command === 'repair') {
  const config = lifecycleConfig(args);
  if (config === undefined) {
    console.error(usage());
    process.exitCode = 2;
  } else {
    const result = command === 'plan'
      ? planMounts(config)
      : command === 'sync'
        ? syncMounts(config)
        : command === 'doctor'
          ? doctorMounts(config)
          : repairMounts(config);
    print(result);
    process.exitCode = result.status === 'ready' || result.status === 'synced' ? 0 : 1;
  }
} else {
  console.error(usage());
  process.exitCode = 2;
}
