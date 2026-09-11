import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import registerAgentStatusExtension from '../../src/adapters/omp/extensions/agent-status-extension';

type SessionHandler = (event: { readonly type: 'session_start' }, context: { readonly ui: { setStatus(key: string, text?: string): void }; readonly cwd: string }) => void | Promise<void>;
type ToolCallHandler = (event: { readonly type: 'tool_call'; readonly toolName: string; readonly toolCallId: string; readonly input: Record<string, unknown> }, context: { readonly ui: { setStatus(key: string, text?: string): void }; readonly cwd: string }) => unknown;
type CommandHandler = (args: string[], context: { readonly ui: { notify(message: string, type?: string): void }; readonly cwd: string }) => void | Promise<void>;

function registeredHandlers(): {
  readonly sessionStart: SessionHandler;
  readonly toolCall: ToolCallHandler;
  readonly commands: Record<string, CommandHandler>;
} {
  let sessionStart: SessionHandler | undefined;
  let toolCall: ToolCallHandler | undefined;
  const commands: Record<string, CommandHandler> = {};
  const api = {
    on(event: string, callback: SessionHandler | ToolCallHandler): void {
      if (event === 'session_start') sessionStart = callback as SessionHandler;
      if (event === 'tool_call') toolCall = callback as ToolCallHandler;
    },
    registerCommand(name: string, opts: { readonly handler: CommandHandler }): void {
      commands[name] = opts.handler;
    },
  };
  registerAgentStatusExtension(api as never);
  if (sessionStart === undefined || toolCall === undefined) throw new Error('expected extension handlers');
  return { sessionStart, toolCall, commands };
}

async function withLaunchContext(value: string | undefined, run: () => Promise<void>): Promise<void> {
  const previous = process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
  if (value === undefined) delete process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
  else process.env.AGENT_SYSTEM_LAUNCH_CONTEXT = value;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
    else process.env.AGENT_SYSTEM_LAUNCH_CONTEXT = previous;
  }
}

const context = { cwd: process.cwd() };

describe('OMP agent status launch context', () => {
  test('presents direct OMP launch as a normal neutral state', async () => {
    await withLaunchContext(undefined, async () => {
      const handlers = registeredHandlers();
      let status = '';
      let detail = '';
      await handlers.sessionStart({ type: 'session_start' }, {
        ...context,
        ui: { setStatus: (_key, text) => { status = text ?? ''; } },
      });
      await handlers.commands['agent-config']?.([], {
        ...context,
        ui: { notify: (message) => { detail = message; } },
      });
      expect(status).toBe('Agent System: direct OMP launch');
      expect(detail).toBe('Agent System: direct OMP launch');
    });
  });

  test('presents a valid control-plane context', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-status-extension-'));
    const contextPath = path.join(root, 'launch-context.json');
    await writeFile(contextPath, JSON.stringify({ version: 1, operationId: 'operation-1', configName: 'default', revisionId: 'revision-1', client: 'omp' }));
    try {
      await withLaunchContext(contextPath, async () => {
        const handlers = registeredHandlers();
        let status = '';
        await handlers.sessionStart({ type: 'session_start' }, {
          ...context,
          ui: { setStatus: (_key, text) => { status = text ?? ''; } },
        });
        let detail = '';
        await handlers.commands['agent-config']?.([], {
          ...context,
          ui: { notify: (message) => { detail = message; } },
        });
        expect(detail).toContain('configName: default');
        expect(detail).toContain('revisionId: revision-1');
        expect(detail).toContain('client: omp');
        expect(detail).toContain('operationId: operation-1');
        expect(status).toBe('Agent System: default@revision-1 [omp]');
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('reports a missing control-plane context as managed but unavailable', async () => {
    const contextPath = path.join(os.tmpdir(), 'agent-status-extension-missing-context.json');
    await rm(contextPath, { force: true });
    await withLaunchContext(contextPath, async () => {
      const handlers = registeredHandlers();
      let status = '';
      await handlers.sessionStart({ type: 'session_start' }, {
        ...context,
        ui: { setStatus: (_key, text) => { status = text ?? ''; } },
      });
      expect(status).toBe('Agent System: managed launch context unavailable (missing-file)');
      let detail = '';
      await handlers.commands['agent-config']?.([], {
        ...context,
        ui: { notify: (message) => { detail = message; } },
      });
      expect(detail).toContain('managed launch context unavailable');
      expect(detail).toContain('missing-file');
      expect(detail).toContain(contextPath);
    });
  });
  test('reports a directory context path as unreadable', async () => {
    const contextPath = await mkdtemp(path.join(os.tmpdir(), 'agent-status-extension-unreadable-'));
    try {
      await withLaunchContext(contextPath, async () => {
        const handlers = registeredHandlers();
        let status = '';
        await handlers.sessionStart({ type: 'session_start' }, {
          ...context,
          ui: { setStatus: (_key, text) => { status = text ?? ''; } },
        });
        expect(status).toBe('Agent System: managed launch context unavailable (unreadable)');
        let detail = '';
        await handlers.commands['agent-config']?.([], {
          ...context,
          ui: { notify: (message) => { detail = message; } },
        });
        expect(detail).toContain('managed launch context unavailable');
        expect(detail).toContain('unreadable');
        expect(detail).toContain(contextPath);
      });
    } finally {
      await rm(contextPath, { recursive: true, force: true });
    }
  });

  test('reports malformed and invalid contexts without disabling tool_call', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-status-extension-invalid-'));
    const malformedPath = path.join(root, 'malformed.json');
    await writeFile(malformedPath, '{');
    try {
      await withLaunchContext(malformedPath, async () => {
        const handlers = registeredHandlers();
        let status = '';
        await handlers.sessionStart({ type: 'session_start' }, {
          ...context,
          ui: { setStatus: (_key, text) => { status = text ?? ''; } },
        });
        expect(status).toBe('Agent System: managed launch context unavailable (malformed)');
        expect(handlers.toolCall).toBeDefined();
        let detail = '';
        await handlers.commands['agent-config']?.([], {
          ...context,
          ui: { notify: (message) => { detail = message; } },
        });
        expect(detail).toContain('managed launch context unavailable');
        expect(detail).toContain('malformed');
      });
      const invalidPath = path.join(root, 'invalid.json');
      await writeFile(invalidPath, '{}');
      await withLaunchContext(invalidPath, async () => {
        const handlers = registeredHandlers();
        let status = '';
        await handlers.sessionStart({ type: 'session_start' }, {
          ...context,
          ui: { setStatus: (_key, text) => { status = text ?? ''; } },
        });
        expect(status).toBe('Agent System: managed launch context unavailable (invalid-shape)');
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
