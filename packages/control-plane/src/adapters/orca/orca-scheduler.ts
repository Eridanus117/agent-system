import type { AgentSchedulerPort } from '../../application/ports/scheduler';
import {
  createAgentScheduleIntent,
  type AgentScheduleIntent,
  type OrcaAutomationReceipt,
} from '../../domain/schedule';
import {
  OrcaCommandError,
  parseOrcaAutomationReceipt,
  parseOrcaCancellation,
  type OrcaCommandPort,
  type OrcaCommandResult,
} from './orca-command';

export type { OrcaCommandPort, OrcaCommandResult } from './orca-command';
export { OrcaCommandError } from './orca-command';

export interface OrcaScheduleOptions {
  readonly timezone?: string;
  readonly missedRunGrace?: string | number;
  readonly enabled?: boolean;
}

function requireOptionText(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (value.trim().length === 0) throw new OrcaCommandError('invalid-output', `${name} must not be empty`);
  return value.trim();
}

function requireMissedRunGrace(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return String(value);
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new OrcaCommandError('invalid-output', 'missedRunGrace must be a non-negative number or non-empty text');
}

export function buildOrcaCreateArgs(input: AgentScheduleIntent, options: OrcaScheduleOptions = {}): readonly string[] {
  const intent = createAgentScheduleIntent(input);
  const triggerValue = intent.trigger.kind === 'cron' ? intent.trigger.expression : intent.trigger.value;
  const args: string[] = [
    'orca', 'automations', 'create',
    '--name', intent.scheduleId,
    '--trigger', triggerValue,
    '--provider', intent.agentId,
  ];

  if (intent.target.kind === 'runtime') {
    args.push('--host', intent.target.selector);
  } else {
    args.push(`--${intent.target.kind}`, intent.target.selector);
    if (intent.target.kind === 'project' && intent.target.host !== undefined) args.push('--host', intent.target.host);
  }

  args.push(intent.sessionPolicy === 'fresh' ? '--fresh-session' : '--reuse-session');

  if (intent.precheckRef !== null) args.push('--precheck', intent.precheckRef);
  if (intent.sourceContextRef !== null) args.push('--source-context', intent.sourceContextRef);

  const timezone = requireOptionText(options.timezone, 'timezone');
  if (timezone !== undefined) args.push('--timezone', timezone);
  const missedRunGrace = requireMissedRunGrace(options.missedRunGrace);
  if (missedRunGrace !== undefined) args.push('--missed-run-grace', missedRunGrace);
  if (options.enabled === true) args.push('--enabled');
  if (options.enabled === false) args.push('--disabled');

  args.push('--json');
  return args;
}

export class OrcaScheduler implements AgentSchedulerPort {
  constructor(
    private readonly commands: OrcaCommandPort,
    private readonly defaultOptions: OrcaScheduleOptions = {},
  ) {}

  async create(input: AgentScheduleIntent, options: OrcaScheduleOptions = this.defaultOptions): Promise<OrcaAutomationReceipt> {
    const response = await this.commands.run(buildOrcaCreateArgs(input, options));
    return parseOrcaAutomationReceipt(response);
  }

  async cancel(automationId: string): Promise<void> {
    const normalizedId = automationId.trim();
    if (normalizedId.length === 0) throw new OrcaCommandError('invalid-output', 'automationId must not be empty');
    const response = await this.commands.run(['orca', 'automations', 'cancel', '--id', normalizedId, '--json']);
    parseOrcaCancellation(response, normalizedId);
  }
}

export function createOrcaScheduler(commands: OrcaCommandPort, options: OrcaScheduleOptions = {}): OrcaScheduler {
  return new OrcaScheduler(commands, options);
}
