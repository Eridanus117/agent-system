import { afterEach, describe, expect, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cliPath = join(import.meta.dir, '..', 'src', 'cli.ts');
const temporaryDirectories: string[] = [];

type CommandResult = { readonly code: number; readonly stdout: string; readonly stderr: string };

type MountEntry = {
  readonly id: string;
  readonly rootId: string;
  readonly source: string;
  readonly target: string;
  readonly expectedType: 'directory';
  readonly required: true;
  readonly readonly: true;
};

async function run(cwd: string, command: string, args: readonly string[]): Promise<CommandResult> {
  const child = Bun.spawn([command, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    child.stdout === null ? '' : new Response(child.stdout).text(),
    child.stderr === null ? '' : new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await run(cwd, 'git', args);
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function mountsCli(cwd: string, command: string, manifestPath: string, rootsPath: string, checkoutRoot: string): Promise<CommandResult> {
  return run(cwd, 'bun', [cliPath, command, '--manifest', manifestPath, '--roots', rootsPath, '--checkout', checkoutRoot]);
}

async function writeProfile(
  manifestPath: string,
  rootsPath: string,
  sourceRoot: string,
  mounts: readonly MountEntry[],
): Promise<void> {
  await writeFile(manifestPath, JSON.stringify({ version: 1, profile: 'private-local', mounts }), 'utf8');
  await writeFile(rootsPath, JSON.stringify({ version: 1, roots: { assets: { path: sourceRoot, trustDomain: 'private-local' } } }), 'utf8');
}

async function fixture(): Promise<{
  readonly root: string;
  readonly manifestPath: string;
  readonly rootsPath: string;
  readonly checkoutRoot: string;
  readonly sourceRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'mounts-acceptance-'));
  temporaryDirectories.push(root);
  const profile = join(root, 'common', 'agent-system', 'private-local');
  const repository = join(root, 'repository');
  const checkoutRoot = join(root, 'worktree');
  const sourceRoot = join(root, 'private-assets');
  const manifestPath = join(profile, 'manifest.json');
  const rootsPath = join(profile, 'roots.json');
  await mkdir(profile, { recursive: true });
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(repository, { recursive: true });
  await writeFile(join(repository, '.gitignore'), '.omp/\n', 'utf8');
  await writeFile(join(repository, 'README.md'), 'synthetic repository\n', 'utf8');
  await git(repository, ['init', '--quiet', '--initial-branch=main']);
  await git(repository, ['config', 'user.email', 'mounts-acceptance@example.invalid']);
  await git(repository, ['config', 'user.name', 'Mounts Acceptance']);
  await git(repository, ['add', '--all']);
  await git(repository, ['commit', '--quiet', '-m', 'synthetic baseline']);
  await git(repository, ['worktree', 'add', '--quiet', '--detach', checkoutRoot, 'main']);
  return { root, manifestPath, rootsPath, checkoutRoot, sourceRoot };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('private-local end-to-end acceptance', () => {
  test('keeps a real worktree usable across blocked, sync, doctor, and repair states', async () => {
    const { root, manifestPath, rootsPath, checkoutRoot, sourceRoot } = await fixture();
    const firstSource = join(sourceRoot, 'navigation');
    const secondSource = join(sourceRoot, 'prompts');
    await mkdir(firstSource, { recursive: true });
    const mounts: MountEntry[] = [
      { id: 'navigation', rootId: 'assets', source: 'navigation', target: '.omp/local/navigation', expectedType: 'directory', required: true, readonly: true },
      { id: 'prompts', rootId: 'assets', source: 'prompts', target: '.omp/local/prompts', expectedType: 'directory', required: true, readonly: true },
    ];
    const init = await mountsCli(root, 'init', manifestPath, rootsPath, checkoutRoot);
    expect(init.code).toBe(0);
    expect(await readFile(manifestPath, 'utf8')).toContain('private-local');
    expect(await exists(join(checkoutRoot, '.omp/local'))).toBe(false);
    await writeProfile(manifestPath, rootsPath, sourceRoot, mounts);
    const plan = await mountsCli(root, 'plan', manifestPath, rootsPath, checkoutRoot);
    expect(plan.code).toBe(1);
    expect(JSON.parse(plan.stdout).status).toBe('blocked');
    const blocked = await mountsCli(root, 'sync', manifestPath, rootsPath, checkoutRoot);
    expect(blocked.code).toBe(1);
    expect(JSON.parse(blocked.stdout).status).toBe('blocked');
    expect(await exists(join(checkoutRoot, '.omp/local/navigation'))).toBe(false);
    expect(await git(checkoutRoot, ['status', '--porcelain'])).toBe('');

    await mkdir(secondSource, { recursive: true });
    const synced = await mountsCli(root, 'sync', manifestPath, rootsPath, checkoutRoot);
    expect(synced.code).toBe(0);
    expect(JSON.parse(synced.stdout).status).toBe('synced');
    expect(await readlink(join(checkoutRoot, '.omp/local/navigation'))).toBe(firstSource);
    expect(await readlink(join(checkoutRoot, '.omp/local/prompts'))).toBe(secondSource);

    const doctor = await mountsCli(root, 'doctor', manifestPath, rootsPath, checkoutRoot);
    expect(doctor.code).toBe(0);
    expect(JSON.parse(doctor.stdout).message).toBe('private overlay healthy');
    expect(JSON.parse(doctor.stdout).plan.keeps).toHaveLength(2);

    await unlink(join(checkoutRoot, '.omp/local/prompts'));
    await symlink(join(root, 'wrong-source'), join(checkoutRoot, '.omp/local/prompts'));
    const repaired = await mountsCli(root, 'repair', manifestPath, rootsPath, checkoutRoot);
    expect(repaired.code).toBe(0);
    expect(await readlink(join(checkoutRoot, '.omp/local/prompts'))).toBe(secondSource);
    expect(await git(checkoutRoot, ['status', '--porcelain'])).toBe('');
  });
});
