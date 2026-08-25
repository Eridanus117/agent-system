/**
 * `[Story 5.1]` AD-23 的凭据延续性：把宿主当前真实登录凭据（Claude Code 的
 * `.credentials.json`）只读复制进一次 fresh 启动的隔离 `invocationDir` 根
 * ——该目录本身就是新 spawn 进程的 `CLAUDE_CONFIG_DIR`，Claude Code 原生就是
 * 从这个根下读取 `.credentials.json`（不是 `materialized/` 子目录：AD-21 的
 * "不写根" 约束针对本产品自拼的 Instructions/Skills/MCP 内容，凭据是宿主原生
 * 期望的文件，约束对象不同，两条规则不冲突）。
 *
 * 这个模块**不是** `content-materializer.ts` 的 `materializeClaudeContent`
 * 那种基于 `sourceRef`（`CapabilityReference`）的物化——它读的是宿主环境状态
 * （`CLAUDE_CONFIG_DIR`/`$HOME`），不是修订里的任何引用，语义上是独立的一路，
 * 因此独立成文件，而不是并进 `content-materializer.ts`（那个函数的既有前置
 * 条件明确写着 "Read-only over `revision`'s references"）。
 *
 * 字节级 `cp` 只读复制——本模块从不把凭据内容读进 JS 字符串、从不 `JSON.parse`
 * 它、也从不把它记进日志/console（AD-6：凭据内容只在调用作用域存在，绝不进
 * 任何持久或可观察表面）。
 */
import { access, cp, rename, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ClaudeCredentialsMaterializationResult, ClaudeCredentialsPort } from '../../../application/ports';

/** Claude Code 原生凭据文件名，固定不变（本机 Windows 2026-08-25 实测确认：509 字节单一 JSON 文件，非 OS keychain）。 */
export const CLAUDE_CREDENTIALS_FILE_NAME = '.credentials.json';

/**
 * `[Story 5.1][review fix]` `claude.credentials-continuity` 这个
 * `capabilityId` 字符串字面量的唯一权威来源——`capability-probe.ts` 的
 * `probeCredentialsContinuity` 与 `application/claude-launch.ts` 的两处
 * `affectedCapabilities` 都引用这一个常量，避免三份拷贝各自漂移。放在
 * `credentials.ts`（而不是各消费点各自声明）是因为这个 id 描述的正是本文件
 * 实现的能力本身。
 */
export const CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID = 'claude.credentials-continuity';

/**
 * 凭据源目录解析规则：`process.env.CLAUDE_CONFIG_DIR` 优先，否则
 * `$HOME/.claude`——与 `application/claude-launch.ts` 给新 spawn 进程设置的
 * 同一个环境变量语义完全一致，也是 Claude Code 官方自身解析配置目录的方式
 * （不重新发明凭据发现逻辑）。`capability-probe.ts` 的
 * `claude.credentials-continuity` 探测复用同一个函数，两处解析规则永远不会
 * 漂移开。
 *
 * `[Story 5.1][review fix]` 先 `trim()` 再判断长度——一个纯空白字符串（如
 * `' '`）不是一个有意义的显式设置，必须和"未设置"一样回退到
 * `$HOME/.claude`，否则会拼出一个不存在的路径而不是真正生效的凭据目录。
 *
 * `[Story 5.1 残留风险]` 这条解析规则只在本机 Windows 环境实测过；macOS 是否
 * 改用系统 keychain 而非纯文件、其余平台是否同样以 `$HOME/.claude` 为根，都
 * 未核实——见本 Story 的 Completion Notes。
 */
export function resolveClaudeCredentialsSourcePath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  const baseDir = configDir !== undefined && configDir.length > 0 ? configDir : path.join(os.homedir(), '.claude');
  return path.join(baseDir, CLAUDE_CREDENTIALS_FILE_NAME);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 只读、字节级地把凭据源文件复制进 `invocationDir` 根。同目录临时文件 +
 * `rename` 的原子替换纪律（AD-9），与 `content-materializer.ts` 的
 * `writeFileAtomic`/`adapters/system/atomic-write.ts` 的
 * `writeToSameDirTempFile` 同一纪律，但这里直接 `cp` 到临时路径再 `rename`，
 * 不经过 `writeToSameDirTempFile`——那个 primitive 的入参是
 * `string | Uint8Array`，会强迫先把整个文件内容读进内存，这正是本 Story要
 * 避免的（Task 3：`cp` 字节级复制，不解析/不经手内容）。
 *
 * 从不抛异常——每一步 IO 失败都被捕获并转成 `{ status: 'failed', reason }`，
 * 与 `ClaudeContentMaterializerPort` 同一纪律，让 `launchClaudeFresh` 的调用
 * 点可以像处理内容物化失败一样处理凭据物化失败（同一个 fail-closed 模式）。
 *
 * `[Story 5.1][review fix]` `resolveClaudeCredentialsSourcePath()` 本身的
 * 调用也挪进了这个函数唯一的 try 边界内——它自己的文档虽然承诺"从不抛异常"，
 * 但那份承诺只覆盖了它内部的逻辑本身；把调用点也纳入同一个 try，是让这份
 * "从不抛异常"的纪律对*调用方*同样成立的防御性写法，不依赖被调用者的文档
 * 承诺永远不被未来的改动打破。
 */
export async function materializeClaudeCredentials(invocationDir: string): Promise<ClaudeCredentialsMaterializationResult> {
  const destPath = path.join(invocationDir, CLAUDE_CREDENTIALS_FILE_NAME);

  // `sourcePath` starts `null` so the catch below can still describe *which*
  // path failed when `access` itself throws (the common case), while still
  // degrading gracefully (never throwing) on the rare case where
  // `resolveClaudeCredentialsSourcePath()` itself throws, in which case no
  // path was ever resolved to report.
  let sourcePath: string | null = null;
  try {
    sourcePath = resolveClaudeCredentialsSourcePath();
    await access(sourcePath, fsConstants.R_OK);
  } catch (error) {
    const sourceDescription = sourcePath ?? '（无法解析凭据源路径）';
    return { status: 'failed', reason: `凭据源文件不存在或不可读：${sourceDescription}（${errorMessage(error)}）` };
  }

  const tempPath = `${destPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    // `[Story 5.1][review fix]` `dereference: true`：凭据源如果是符号链接
    // （极少见，但不是不可能——例如用户自己把 `~/.claude` 软链到别处），必须
    // 复制链接**指向的真实内容**，而不是把链接本身原样复制过去——后者会在
    // 隔离 invocationDir 里留下一个可能悬空、且指向宿主真实路径的链接，既可能
    // 失效，也可能意外让新进程读到隔离目录之外的文件。
    await cp(sourcePath, tempPath, { dereference: true });
    await rename(tempPath, destPath);
  } catch (error) {
    // `[Story 5.1][review fix]` `cp` 可能已经成功但 `rename` 失败（例如目标
    // 磁盘满、或目标路径被其他进程占用）：这种情况下 `tempPath` 会变成一个
    // 孤儿凭据副本，永远留在 invocationDir 里，直到该目录整体被清理
    // （`ClaudeInvocationDirPort.cleanup`）为止——但清理时机可能远晚于此刻，
    // 且清理是 best-effort。主动尝试删除它；用 `force: true` 忽略"本来就不
    // 存在"（`cp` 本身失败、`tempPath` 从未写出的情形），且这次清理自身的
    // 失败绝不覆盖/掩盖原始错误（吞掉，只在旁路 catch 里丢弃）。
    try {
      await rm(tempPath, { force: true });
    } catch {
      // Intentionally swallowed -- the original `error` below is the real
      // failure this call must report; a cleanup-of-cleanup failure must
      // never mask it.
    }
    return { status: 'failed', reason: `复制凭据文件失败：${errorMessage(error)}` };
  }

  return { status: 'materialized', reason: null };
}

/**
 * `[Story 5.1]` 真实 `ClaudeCredentialsPort` 实现——薄包装
 * `materializeClaudeCredentials`，与 `content-materializer.ts` 的
 * `FsClaudeContentMaterializer` 同一模式：`application/claude-launch.ts` 只
 * 依赖端口接口，从不直接调用这个模块的自由函数。
 */
export class FsClaudeCredentialsPort implements ClaudeCredentialsPort {
  async materialize(invocationDir: string): Promise<ClaudeCredentialsMaterializationResult> {
    return materializeClaudeCredentials(invocationDir);
  }
}
