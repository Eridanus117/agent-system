/**
 * `[Story 5.1]` 凭据源目录用 `CLAUDE_CONFIG_DIR` 隔离到一个真实的 `mkdtemp`
 * 目录（而不是依赖本机真实的 `$HOME/.claude`），与本仓其余环境变量覆盖测试
 * 同一纪律：覆盖值**保存并恢复**，不是只 `delete`，本文件不可能把值泄漏给
 * 别的测试文件。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CLAUDE_CREDENTIALS_FILE_NAME,
  FsClaudeCredentialsPort,
  materializeClaudeCredentials,
  resolveClaudeCredentialsSourcePath,
} from '../../src/adapters/clients/claude/credentials';

let sourceDir: string;
let invocationDir: string;
let originalConfigDir: string | undefined;

beforeEach(() => {
  sourceDir = mkdtempSync(path.join(os.tmpdir(), 'control-plane-claude-credentials-src-'));
  invocationDir = mkdtempSync(path.join(os.tmpdir(), 'control-plane-claude-credentials-inv-'));
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = sourceDir;
});

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
  }
  rmSync(sourceDir, { recursive: true, force: true });
  rmSync(invocationDir, { recursive: true, force: true });
});

describe('resolveClaudeCredentialsSourcePath', () => {
  test('CLAUDE_CONFIG_DIR 已设置: 优先使用它', () => {
    expect(resolveClaudeCredentialsSourcePath()).toBe(path.join(sourceDir, CLAUDE_CREDENTIALS_FILE_NAME));
  });

  test('CLAUDE_CONFIG_DIR 未设置: 回退到 $HOME/.claude', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(resolveClaudeCredentialsSourcePath()).toBe(path.join(os.homedir(), '.claude', CLAUDE_CREDENTIALS_FILE_NAME));
  });

  test('CLAUDE_CONFIG_DIR 为空字符串: 视同未设置, 回退到 $HOME/.claude', () => {
    process.env.CLAUDE_CONFIG_DIR = '';
    expect(resolveClaudeCredentialsSourcePath()).toBe(path.join(os.homedir(), '.claude', CLAUDE_CREDENTIALS_FILE_NAME));
  });

  test('[review fix] CLAUDE_CONFIG_DIR 为纯空白字符串: 同样视同未设置（trim 后判空), 回退到 $HOME/.claude, 不拼出一个不存在的路径', () => {
    process.env.CLAUDE_CONFIG_DIR = '   ';
    expect(resolveClaudeCredentialsSourcePath()).toBe(path.join(os.homedir(), '.claude', CLAUDE_CREDENTIALS_FILE_NAME));
  });
});

describe('materializeClaudeCredentials', () => {
  test('源文件存在且可读: 字节级复制进 invocationDir 根, 内容与源逐字节一致', async () => {
    const rawContent = '{"claudeAiOauth":{"accessToken":"tok","refreshToken":"ref","expiresAt":1,"refreshTokenExpiresAt":2,"scopes":["a"]},"subscriptionType":"pro","rateLimitTier":"default"}';
    writeFileSync(path.join(sourceDir, CLAUDE_CREDENTIALS_FILE_NAME), rawContent, 'utf8');

    const result = await materializeClaudeCredentials(invocationDir);

    expect(result).toEqual({ status: 'materialized', reason: null });
    const destPath = path.join(invocationDir, CLAUDE_CREDENTIALS_FILE_NAME);
    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath, 'utf8')).toBe(rawContent);
    // No temp artifact left behind after the atomic rename.
    expect(readFileSync(destPath, 'utf8')).not.toContain('.tmp');
  });

  test('源文件不存在: fail-closed, 报告失败原因, 从不抛异常', async () => {
    // Deliberately never writing the credentials file into `sourceDir`.
    const result = await materializeClaudeCredentials(invocationDir);

    expect(result.status).toBe('failed');
    expect(result.reason).toContain(path.join(sourceDir, CLAUDE_CREDENTIALS_FILE_NAME));
    expect(existsSync(path.join(invocationDir, CLAUDE_CREDENTIALS_FILE_NAME))).toBe(false);
  });

  test('源文件存在但不可读（权限拒绝）: fail-closed, 报告失败原因', async () => {
    if (process.platform === 'win32') {
      // `chmod`-based unreadability is not reliably enforceable on Windows
      // (the same caveat this repo's other permission-dependent tests
      // already carry); this scenario is exercised on POSIX runners only.
      return;
    }
    const filePath = path.join(sourceDir, CLAUDE_CREDENTIALS_FILE_NAME);
    writeFileSync(filePath, '{}', 'utf8');
    chmodSync(filePath, 0o000);

    try {
      const result = await materializeClaudeCredentials(invocationDir);
      expect(result.status).toBe('failed');
      expect(result.reason).toContain(filePath);
    } finally {
      chmodSync(filePath, 0o600);
    }
  });

  test('凭据内容从不被解析为 JSON: 即使源文件不是合法 JSON, 复制依然逐字节成功', async () => {
    const notJson = 'this is not valid json at all {{{';
    writeFileSync(path.join(sourceDir, CLAUDE_CREDENTIALS_FILE_NAME), notJson, 'utf8');

    const result = await materializeClaudeCredentials(invocationDir);

    expect(result).toEqual({ status: 'materialized', reason: null });
    expect(readFileSync(path.join(invocationDir, CLAUDE_CREDENTIALS_FILE_NAME), 'utf8')).toBe(notJson);
  });

  test('[review fix] 源文件是符号链接: 复制的是链接指向的真实内容（dereference）, 不是链接本身', async () => {
    if (process.platform === 'win32') {
      // Creating a file symlink on Windows requires elevated privileges (or
      // Developer Mode) not guaranteed to be available on CI/dev machines --
      // same caveat this repo's other symlink-dependent tests already carry
      // (see `tests/integration/cli-supply.test.ts`'s `FILE_LINKS_AVAILABLE`
      // skip pattern). Exercised on POSIX runners only.
      return;
    }
    const realTargetPath = path.join(sourceDir, 'real-credentials.json');
    const linkPath = path.join(sourceDir, CLAUDE_CREDENTIALS_FILE_NAME);
    const realContent = '{"claudeAiOauth":{"accessToken":"real-content-behind-the-link"}}';
    writeFileSync(realTargetPath, realContent, 'utf8');
    symlinkSync(realTargetPath, linkPath);

    const result = await materializeClaudeCredentials(invocationDir);

    expect(result).toEqual({ status: 'materialized', reason: null });
    const destPath = path.join(invocationDir, CLAUDE_CREDENTIALS_FILE_NAME);
    // The copy is a real, standalone file with the link's *target* content --
    // not a (potentially dangling, host-path-leaking) symlink copy.
    expect(readFileSync(destPath, 'utf8')).toBe(realContent);
  });

  test('[review fix] cp 成功但 rename 失败（目标已被占用为目录）: 孤儿临时文件被清理, 不残留', async () => {
    writeFileSync(path.join(sourceDir, CLAUDE_CREDENTIALS_FILE_NAME), '{"a":1}', 'utf8');
    const destPath = path.join(invocationDir, CLAUDE_CREDENTIALS_FILE_NAME);
    // Force `rename(tempPath, destPath)` to fail (rename onto an existing,
    // non-empty-of-identity directory path is rejected on both POSIX and
    // Windows) while leaving `cp(sourcePath, tempPath)` free to succeed --
    // this is exactly the "cp succeeded, rename failed" split the orphan
    // cleanup fix targets.
    mkdirSync(destPath, { recursive: true });

    const result = await materializeClaudeCredentials(invocationDir);

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('复制凭据文件失败');
    // No leftover `<file>.<pid>.<time>.tmp` orphan anywhere under invocationDir.
    const entries = readdirSync(invocationDir);
    const orphanedTempFiles = entries.filter((name) => name.startsWith(CLAUDE_CREDENTIALS_FILE_NAME) && name.endsWith('.tmp'));
    expect(orphanedTempFiles).toEqual([]);
  });
});

describe('FsClaudeCredentialsPort', () => {
  test('实现委托给 materializeClaudeCredentials, 行为逐字段一致', async () => {
    writeFileSync(path.join(sourceDir, CLAUDE_CREDENTIALS_FILE_NAME), '{"a":1}', 'utf8');
    const port = new FsClaudeCredentialsPort();

    const result = await port.materialize(invocationDir);

    expect(result).toEqual({ status: 'materialized', reason: null });
    expect(readFileSync(path.join(invocationDir, CLAUDE_CREDENTIALS_FILE_NAME), 'utf8')).toBe('{"a":1}');
  });
});
