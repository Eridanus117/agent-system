import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { known, unknown, type Fact } from '../../src/domain/facts';
import type { ClaudeCapabilityProbeResult, ClaudeProcessPort, ClaudeSpawnParams, ClaudeSpawnResult } from '../../src/application/ports';
import { BunClaudeCapabilityProbe } from '../../src/adapters/clients/claude/capability-probe';
import { BunClaudeProcessPort } from '../../src/adapters/clients/claude/process-port';
import { CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID, CLAUDE_CREDENTIALS_FILE_NAME } from '../../src/adapters/clients/claude/credentials';

const REAL_MAIN_HELP = `
Options:
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")
  --setting-sources <sources>           Comma-separated list of setting sources
                                        to load (user, project, local).
  --strict-mcp-config                   Only use MCP servers from --mcp-config,
                                        ignoring all other MCP configurations
  --include-hook-events                 Include all hook lifecycle events in the
  --plugin-dir <path>                   Load a plugin from a directory or .zip
                                        for this session only (repeatable)
  --append-system-prompt <prompt>       Append a system prompt to the default
                                        system prompt
`;

const REAL_MCP_ADD_HELP = `
Options:
  -s, --scope <scope>          Configuration scope (local, user, or project)
                               (default: "local")
`;

class FakeClaudeProcessPort implements ClaudeProcessPort {
  constructor(
    private readonly helpTexts: ReadonlyMap<string, Fact<string>>,
    private readonly version: Fact<string> = known('9.9.9'),
  ) {}

  async detectVersion(): Promise<Fact<string>> {
    return this.version;
  }

  async captureHelpText(args: readonly string[]): Promise<Fact<string>> {
    const key = args.join(' ');
    return this.helpTexts.get(key) ?? unknown(`no-fixture-for-args:${key}`, new Date().toISOString());
  }

  /** Never exercised by capability-probe tests -- Story 4.3's `claude-process-port.test.ts` covers `spawn` directly. */
  async spawn(_params: ClaudeSpawnParams): Promise<ClaudeSpawnResult> {
    throw new Error('FakeClaudeProcessPort.spawn is not exercised by capability-probe tests');
  }
}

function byId(results: readonly ClaudeCapabilityProbeResult[], id: string): ClaudeCapabilityProbeResult {
  const found = results.find((r) => r.capabilityId === id);
  if (found === undefined) {
    throw new Error(`no probe result for capabilityId ${id}`);
  }
  return found;
}

describe('BunClaudeCapabilityProbe (fixture-driven interpretation)', () => {
  test('binary unreachable: every --help-derived capability resolves to unknown, never a default supported', async () => {
    // `[Story 5.1][review fix]` Isolate `CLAUDE_CONFIG_DIR` to a real, empty
    // temp directory here too -- without this, `claude.credentials-continuity`
    // would probe *this machine's* real credentials state, making the
    // assertion below true or false depending on who runs the suite (i.e.
    // not really testing anything). Isolated, it deterministically resolves
    // to `unsupported` (no `.credentials.json` in the empty temp dir).
    const isolatedConfigDir = mkdtempSync(path.join(os.tmpdir(), 'control-plane-claude-probe-unreachable-'));
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = isolatedConfigDir;
    try {
      const port = new FakeClaudeProcessPort(
        new Map([
          ['', unknown('claude-binary-not-found', '2026-01-01T00:00:00Z')],
          ['mcp add', unknown('claude-binary-not-found', '2026-01-01T00:00:00Z')],
        ]),
      );
      const probe = new BunClaudeCapabilityProbe(port);
      const results = await probe.probeHardControlCapabilities();

      expect(results).toHaveLength(7);
      // `[Story 5.1]` `claude.credentials-continuity` is deliberately excluded
      // from this loop: unlike every other capability here, it is a real
      // filesystem existence/readability check, entirely independent of
      // whether the `claude` binary itself is reachable -- it must never be
      // forced to `unknown` just because `--help` capture failed.
      for (const result of results.filter((r) => r.capabilityId !== CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID)) {
        expect(result.status).toBe('unknown');
        expect(result.evidenceRef.length).toBeGreaterThan(0);
      }
      const credentialsResult = byId(results, CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID);
      expect(credentialsResult.status).toBe('unsupported');
      expect(credentialsResult.evidenceRef.length).toBeGreaterThan(0);
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
      }
      rmSync(isolatedConfigDir, { recursive: true, force: true });
    }
  });

  test('all real, verified evidence present: permission-mode/mcp-scope/setting-sources resolve to supported', async () => {
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(REAL_MAIN_HELP)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.permission-mode-control').status).toBe('supported');
    expect(byId(results, 'claude.mcp-project-scope-control').status).toBe('supported');
    expect(byId(results, 'claude.setting-sources-control').status).toBe('supported');

    // `[Story 4.5b]` AD-21's content-materialization delivery gates: simple
    // presence checks, supported once the flag genuinely appears in --help.
    expect(byId(results, 'claude.plugin-dir-delivery').status).toBe('supported');
    expect(byId(results, 'claude.append-system-prompt-delivery').status).toBe('supported');

    // The hook-deny example capability is never resolved above `unknown` by
    // this Story's probe -- a real controlled-integration observation
    // (Story 4.3/4.4) is required before it could ever become `supported`.
    const hookResult = byId(results, 'claude.hook-deny-return-value');
    expect(hookResult.status).toBe('unknown');
    expect(hookResult.required).toBe(false);
  });

  test('[Story 4.5b] plugin-dir/append-system-prompt flags absent from --help: unsupported, required, never a fabricated supported', async () => {
    const helpWithoutDeliveryFlags = `
  --setting-sources <sources>           Comma-separated list of setting sources
                                        to load (user, project, local).
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(helpWithoutDeliveryFlags)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    const pluginDir = byId(results, 'claude.plugin-dir-delivery');
    const appendPrompt = byId(results, 'claude.append-system-prompt-delivery');
    expect(pluginDir.status).toBe('unsupported');
    expect(pluginDir.required).toBe(true);
    expect(appendPrompt.status).toBe('unsupported');
    expect(appendPrompt.required).toBe(true);
  });

  test('permission-mode flag present but enum incomplete: degraded, not silently supported', async () => {
    const partialHelp = `
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "manual", "bypassPermissions")
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(partialHelp)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.permission-mode-control').status).toBe('degraded');
  });

  test('permission-mode flag entirely absent: unsupported, not unknown', async () => {
    const noPermissionModeHelp = `
  --setting-sources <sources>           Comma-separated list of setting sources
                                        to load (user, project, local).
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(noPermissionModeHelp)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.permission-mode-control').status).toBe('unsupported');
  });

  test('permission-mode enum is a superset (extra unrecognized mode): degraded, never silently supported', async () => {
    const supersetHelp = `
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan", "totallyNewMode")
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(supersetHelp)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.permission-mode-control').status).toBe('degraded');
  });

  test('a longer, unrelated flag that merely starts with the same prefix is not mistaken for the real flag', async () => {
    const lookalikeHelp = `
  --permission-mode-legacy <mode>       Some unrelated future flag (choices: "manual")
  --setting-sources <sources>           Comma-separated list of setting sources
                                        to load (user, project, local).
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(lookalikeHelp)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    // The real `--permission-mode` flag genuinely does not exist in this
    // help text -- only a longer, unrelated lookalike does -- so this must
    // resolve to `unsupported`, never `supported`/`degraded` from a false
    // prefix match.
    expect(byId(results, 'claude.permission-mode-control').status).toBe('unsupported');
  });

  test('mcp scope fully unevidenced (neither --strict-mcp-config nor a real --scope enum): unsupported', async () => {
    const mainHelpWithoutStrictMcp = `
  --setting-sources <sources>           Comma-separated list of setting sources
                                        to load (user, project, local).
`;
    const mcpAddHelpWithoutScope = `
Options:
  -h, --help                   Display help for command
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(mainHelpWithoutStrictMcp)],
        ['mcp add', known(mcpAddHelpWithoutScope)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.mcp-project-scope-control').status).toBe('unsupported');
  });

  test('setting-sources fully unevidenced (flag absent): unsupported', async () => {
    const helpWithoutSettingSources = `
  --permission-mode <mode>              (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(helpWithoutSettingSources)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.setting-sources-control').status).toBe('unsupported');
  });

  test('a stray, unrelated mention of the same words elsewhere in the help text does not fabricate evidence', async () => {
    // No real --permission-mode/--setting-sources/--scope options anywhere,
    // but the enum words themselves appear scattered in unrelated prose --
    // a whole-blob substring scan would misread this as evidence.
    const noisyHelp = `
  --add-dir <directories...>   Additional directories the user may auto-manage
                                per project or local machine preference (plan
                                ahead before invoking).
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(noisyHelp)],
        ['mcp add', known(noisyHelp)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.permission-mode-control').status).toBe('unsupported');
    expect(byId(results, 'claude.setting-sources-control').status).toBe('unsupported');
    expect(byId(results, 'claude.mcp-project-scope-control').status).toBe('unsupported');
  });

  test('mcp scope only partially evidenced: degraded, not silently supported', async () => {
    const mainHelpWithoutStrictMcp = `
  --permission-mode <mode>              (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")
`;
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(mainHelpWithoutStrictMcp)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.mcp-project-scope-control').status).toBe('degraded');
  });

  test('every result carries a stable capabilityId, subject, required flag, validationMethod and observedAt', async () => {
    const port = new FakeClaudeProcessPort(
      new Map<string, Fact<string>>([
        ['', known(REAL_MAIN_HELP)],
        ['mcp add', known(REAL_MCP_ADD_HELP)],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    const ids = results.map((r) => r.capabilityId);
    expect(new Set(ids).size).toBe(ids.length); // all stable ids are unique
    for (const result of results) {
      expect(result.subject.length).toBeGreaterThan(0);
      expect(typeof result.required).toBe('boolean');
      expect(['supported', 'degraded', 'unsupported', 'unknown']).toContain(result.status);
      // This Story only ever performs static --help inspection -- never a
      // real enforced-effect observation -- so every result must say so
      // explicitly (AD-11's independent validationMethod axis), not just
      // imply it in a comment a downstream consumer might never read.
      expect(result.validationMethod).toBe('mechanical');
      expect(result.observedAt.length).toBeGreaterThan(0);
      expect(() => new Date(result.observedAt).toISOString()).not.toThrow();
    }
  });

  test('an Unknown result carries the underlying evidence gap\'s own observedAt, not a fabricated "now"', async () => {
    const port = new FakeClaudeProcessPort(
      new Map([
        ['', unknown('claude-binary-not-found', '2020-01-01T00:00:00.000Z')],
        ['mcp add', unknown('claude-binary-not-found', '2020-01-01T00:00:00.000Z')],
      ]),
    );
    const probe = new BunClaudeCapabilityProbe(port);
    const results = await probe.probeHardControlCapabilities();

    // `[Story 5.1]` `claude.credentials-continuity`'s `observedAt` is always
    // its own real-time filesystem check timestamp, not derived from
    // `mainHelp`/`mcpAddHelp` at all -- excluded from this assertion for the
    // same reason as the "binary unreachable" test above.
    for (const result of results.filter((r) => r.capabilityId !== CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID)) {
      expect(result.observedAt).toBe('2020-01-01T00:00:00.000Z');
    }
  });
});

/**
 * `[Story 5.1]` `claude.credentials-continuity`'s own dedicated coverage:
 * unlike every other capability in this file, it is a real filesystem
 * existence/readability check, isolated here via a temp directory pointed
 * to by `CLAUDE_CONFIG_DIR` -- never depends on this machine's real
 * `~/.claude` content (Task 5's explicit requirement).
 */
describe('BunClaudeCapabilityProbe (claude.credentials-continuity, isolated temp CLAUDE_CONFIG_DIR)', () => {
  let tmpDir: string;
  let originalConfigDir: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'control-plane-claude-credentials-probe-'));
    originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = tmpDir;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function unusedHelpPort(): ClaudeProcessPort {
    return new (class implements ClaudeProcessPort {
      async detectVersion() {
        return known('9.9.9');
      }
      async captureHelpText() {
        return unknown('not-exercised-by-this-describe-block', new Date().toISOString());
      }
      async spawn(_params: ClaudeSpawnParams): Promise<ClaudeSpawnResult> {
        throw new Error('not exercised by this describe block');
      }
    })();
  }

  test('凭据源文件存在且可读: supported, evidenceRef 描述路径, 从不读取/转述文件内容', async () => {
    writeFileSync(path.join(tmpDir, CLAUDE_CREDENTIALS_FILE_NAME), '{"claudeAiOauth":{"accessToken":"secret-value-must-never-appear-in-evidenceRef"}}', 'utf8');
    const probe = new BunClaudeCapabilityProbe(unusedHelpPort());

    const results = await probe.probeHardControlCapabilities();
    const result = byId(results, CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID);

    expect(result.status).toBe('supported');
    expect(result.required).toBe(true);
    expect(result.validationMethod).toBe('mechanical');
    expect(result.evidenceRef).toContain(path.join(tmpDir, CLAUDE_CREDENTIALS_FILE_NAME));
    // AD-6: `evidenceRef` must never leak the credential's own content.
    expect(result.evidenceRef).not.toContain('secret-value-must-never-appear-in-evidenceRef');
  });

  test('凭据源文件不存在: unsupported, 不默认 supported', async () => {
    // Deliberately never writing the credentials file into `tmpDir`.
    const probe = new BunClaudeCapabilityProbe(unusedHelpPort());

    const results = await probe.probeHardControlCapabilities();
    const result = byId(results, CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID);

    expect(result.status).toBe('unsupported');
    expect(result.required).toBe(true);
    expect(result.evidenceRef).toContain(path.join(tmpDir, CLAUDE_CREDENTIALS_FILE_NAME));
  });
});

describe('BunClaudeCapabilityProbe (real environment)', () => {
  test('probing the real, installed claude binary (if any) never fabricates supported evidence', async () => {
    // `[Story 5.1][review fix]` Isolate `CLAUDE_CONFIG_DIR` to a real, empty
    // temp directory: this test's `claude.*` --help-derived assertions are
    // meant to exercise this machine's real `claude` binary (or its real
    // absence), but `claude.credentials-continuity` is a *different* kind of
    // evidence (filesystem, not `--help`) -- leaving it pointed at this
    // machine's real `~/.claude` would make its assertion below true or
    // false depending on whoever happens to run the suite, which is not a
    // real assertion at all. Isolated, it deterministically resolves to
    // `unsupported`.
    const isolatedConfigDir = mkdtempSync(path.join(os.tmpdir(), 'control-plane-claude-probe-real-env-'));
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = isolatedConfigDir;
    try {
      const probe = new BunClaudeCapabilityProbe(new BunClaudeProcessPort());
      const results = await probe.probeHardControlCapabilities();

      expect(results).toHaveLength(7);
      for (const result of results) {
        expect(['supported', 'degraded', 'unsupported', 'unknown']).toContain(result.status);
        expect(result.evidenceRef.length).toBeGreaterThan(0);
      }

      // hook-deny-return-value must never be reported above `unknown` by this
      // Story's static --help-only probe (AC1: no controlled-integration
      // observation has been performed).
      expect(byId(results, 'claude.hook-deny-return-value').status).toBe('unknown');

      // `[Story 5.1]` Deterministic now that `CLAUDE_CONFIG_DIR` is isolated
      // to an empty temp dir, independent of whether `claude` itself is on
      // PATH -- see comment above.
      expect(byId(results, CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID).status).toBe('unsupported');

      if (Bun.which('claude') === null) {
        for (const result of results.filter((r) => r.capabilityId !== CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID)) {
          expect(result.status).toBe('unknown');
        }
      }
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
      }
      rmSync(isolatedConfigDir, { recursive: true, force: true });
    }
  });

  test('[Story 5.1] claude.credentials-continuity 在真实环境下从不返回 unknown: 要么真的找到凭据源文件, 要么真的没找到', async () => {
    const probe = new BunClaudeCapabilityProbe(new BunClaudeProcessPort());
    const results = await probe.probeHardControlCapabilities();

    const credentialsResult = byId(results, CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID);
    expect(['supported', 'unsupported']).toContain(credentialsResult.status);
    expect(credentialsResult.required).toBe(true);
    expect(credentialsResult.validationMethod).toBe('mechanical');
    expect(credentialsResult.evidenceRef.length).toBeGreaterThan(0);
  });

  test('[Story 4.5b][patch] --plugin-dir/--append-system-prompt genuinely resolve to supported on this machine\'s real claude binary (AD-21\'s "must re-run probe, not reuse an old snapshot" requirement)', async () => {
    if (Bun.which('claude') === null) {
      console.warn('[Story 4.5b] claude 二进制在本环境不可达，跳过 claude.plugin-dir-delivery/claude.append-system-prompt-delivery 的真实 supported 断言。');
      return;
    }

    const probe = new BunClaudeCapabilityProbe(new BunClaudeProcessPort());
    const results = await probe.probeHardControlCapabilities();

    expect(byId(results, 'claude.plugin-dir-delivery').status).toBe('supported');
    expect(byId(results, 'claude.append-system-prompt-delivery').status).toBe('supported');
  });

  // `[Story 4.7][patch]` Restores the assertion strength `.cap/` retirement's
  // deleted `claude-capability-probe-cap-parity.test.ts` used to provide for
  // these three capabilities specifically resolving to `supported`/
  // `degraded` (not merely one of the four enum values, which the test
  // above already checks generically and which `unsupported` would also
  // satisfy). This is a pure probe-parsing regression check against real
  // `claude --help` output -- it has nothing to do with `.cap/`'s existence
  // -- and mirrors the pattern immediately above for
  // `plugin-dir-delivery`/`append-system-prompt-delivery`.
  test('[Story 4.7][patch] permission-mode/mcp-scope/setting-sources genuinely resolve to supported or degraded (never unsupported/unknown) on this machine\'s real claude binary', async () => {
    if (Bun.which('claude') === null) {
      console.warn('[Story 4.7] claude 二进制在本环境不可达，跳过 permission-mode/mcp-scope/setting-sources 的真实 supported/degraded 断言。');
      return;
    }

    const probe = new BunClaudeCapabilityProbe(new BunClaudeProcessPort());
    const results = await probe.probeHardControlCapabilities();

    expect(['supported', 'degraded']).toContain(byId(results, 'claude.permission-mode-control').status);
    expect(['supported', 'degraded']).toContain(byId(results, 'claude.mcp-project-scope-control').status);
    expect(['supported', 'degraded']).toContain(byId(results, 'claude.setting-sources-control').status);
  });
});
