import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runPublicTreeGate } from '../index.ts';

const temporaryDirectories: string[] = [];
const encoder = new TextEncoder();

async function command(cwd: string, args: readonly string[]): Promise<Uint8Array> {
  const child = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout === null ? new Uint8Array() : new Uint8Array(await new Response(child.stdout).arrayBuffer()),
    child.stderr === null ? new Uint8Array() : new Uint8Array(await new Response(child.stderr).arrayBuffer()),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(new TextDecoder().decode(stderr));
  return stdout;
}

async function fixtureRepo(files: readonly [string, string][]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'public-tree-gate-'));
  temporaryDirectories.push(root);
  const configPath = join(root, 'tools/public-tree-gate/public-tree-allowlist.json');
  await mkdir(join(root, 'tools/public-tree-gate'), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    allowlist: [
      'tools/public-tree-gate/public-tree-allowlist.json',
      '.gitignore',
      'fixture/**',
      'archive/**',
    ],
    maxFileBytes: 1_048_576,
  }), 'utf8');
  for (const [path, content] of files) {
    const target = join(root, path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  await command(root, ['init', '--quiet']);
  await command(root, ['config', 'user.email', 'fixture@example.invalid']);
  await command(root, ['config', 'user.name', 'Synthetic Fixture']);
  await command(root, ['add', '--all']);
  return root;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function littleEndian16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function littleEndian32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function storedZip(entries: readonly [string, string][]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of entries) {
    const name = encoder.encode(path);
    const bytes = encoder.encode(content);
    const header = concatBytes([
      littleEndian32(0x04034b50), littleEndian16(20), littleEndian16(0), littleEndian16(0),
      littleEndian16(0), littleEndian16(0), littleEndian32(0), littleEndian32(bytes.byteLength),
      littleEndian32(bytes.byteLength), littleEndian16(name.byteLength), littleEndian16(0),
    ]);
    local.push(concatBytes([header, name, bytes]));
    const directory = concatBytes([
      littleEndian32(0x02014b50), littleEndian16(20), littleEndian16(20), littleEndian16(0), littleEndian16(0),
      littleEndian16(0), littleEndian16(0), littleEndian32(0), littleEndian32(bytes.byteLength), littleEndian32(bytes.byteLength),
      littleEndian16(name.byteLength), littleEndian16(0), littleEndian16(0), littleEndian16(0), littleEndian16(0), littleEndian32(0),
      littleEndian32(offset),
    ]);
    central.push(concatBytes([directory, name]));
    offset += header.byteLength + name.byteLength + bytes.byteLength;
  }
  const localBytes = concatBytes(local);
  const centralBytes = concatBytes(central);
  const end = concatBytes([
    littleEndian32(0x06054b50), littleEndian16(0), littleEndian16(0), littleEndian16(entries.length), littleEndian16(entries.length),
    littleEndian32(centralBytes.byteLength), littleEndian32(localBytes.byteLength), littleEndian16(0),
  ]);
  return concatBytes([localBytes, centralBytes, end]);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('public tree gate adapter', () => {
  test('allows a compliant staged tree', async () => {
    const root = await fixtureRepo([['fixture/safe.txt', 'Synthetic public content.\n']]);
    const result = await runPublicTreeGate({ cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.result).toEqual({ status: 'allowed', violations: [] });
  });

  test('blocks a staged symlink', async () => {
    const root = await fixtureRepo([['fixture/target.txt', 'Synthetic target.\n']]);
    await symlink('target.txt', join(root, 'fixture/link.txt'));
    await command(root, ['add', '--all']);
    const result = await runPublicTreeGate({ cwd: root });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('code=symlink');
    expect(result.output).toContain('fixture/link.txt');
  });

  test('does not inspect ignored files or unstaged worktree bytes', async () => {
    const root = await fixtureRepo([['fixture/staged.txt', 'Synthetic staged content.\n']]);
    await writeFile(join(root, '.gitignore'), 'fixture/ignored.txt\n', 'utf8');
    await writeFile(join(root, 'fixture/ignored.txt'), 'token: synthetic-token-value\n', 'utf8');
    await writeFile(join(root, 'fixture/unstaged.txt'), 'Synthetic staged bytes.\n', 'utf8');
    await command(root, ['add', '--all']);
    await writeFile(join(root, 'fixture/unstaged.txt'), 'token: synthetic-token-value\n', 'utf8');
    const result = await runPublicTreeGate({ cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.result).toEqual({ status: 'allowed', violations: [] });
  });

  test('blocks sensitive bytes when they are staged', async () => {
    const root = await fixtureRepo([['fixture/sensitive.txt', 'token: synthetic-token-value\n']]);
    const result = await runPublicTreeGate({ cwd: root });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('code=credential');
    expect(result.output).toContain('fixture/sensitive.txt');
  });

  test('scans synthetic archive members', async () => {
    const root = await fixtureRepo([['archive/payload.zip', 'placeholder']]);
    await writeFile(join(root, 'archive/payload.zip'), storedZip([['nested/data.txt', 'token: synthetic-token-value\n']]))
    await command(root, ['add', '--all']);
    const result = await runPublicTreeGate({ cwd: root });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('code=credential');
    expect(result.output).toContain('archive/payload.zip!nested/data.txt');
  });

  test('fails closed when an indexed blob cannot be read', async () => {
    const root = await fixtureRepo([['fixture/safe.txt', 'Synthetic public content.\n']]);
    const result = await runPublicTreeGate({
      cwd: root,
      runGit: async (args) => {
        if (args[0] === 'ls-files') return encoder.encode(`100644 ${'0'.repeat(40)} 0\tfixture/missing.txt\0`);
        throw new Error('synthetic blob read failure');
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('code=scan-failed');
    expect(result.output).toContain('path="$index"');
  });
});
