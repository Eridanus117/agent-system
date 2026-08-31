import {
  createOrcaAutomationReceipt,
  type OrcaAutomationReceipt,
} from '../../domain/schedule';

export interface OrcaCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface OrcaCommandPort {
  run(args: readonly string[]): Promise<OrcaCommandResult>;
}
export type OrcaCommandFailureCode =
  | 'non-zero-exit'
  | 'invalid-json'
  | 'invalid-output'
  | 'missing-automation-id'
  | 'missing-provider'
  | 'missing-creation-evidence'
  | 'invalid-receipt'
  | 'missing-cancellation-confirmation'
  | 'cancellation-mismatch';

export class OrcaCommandError extends Error {
  readonly code: OrcaCommandFailureCode;
  readonly exitCode: number | null;

  constructor(code: OrcaCommandFailureCode, message: string, exitCode: number | null = null) {
    super(message);
    this.name = 'OrcaCommandError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function parseJson(stdout: string): Record<string, unknown> {
  if (stdout.trim().length === 0) throw new OrcaCommandError('invalid-json', 'Orca --json output is empty');
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new OrcaCommandError('invalid-json', 'Orca --json output is not valid JSON');
  }
  if (!isRecord(value)) throw new OrcaCommandError('invalid-output', 'Orca --json output must be an object');
  return value;
}

function requireText(value: unknown, code: 'missing-automation-id' | 'missing-provider' | 'missing-creation-evidence', label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new OrcaCommandError(code, `Orca JSON is missing ${label}`);
  return value.trim();
}

export function parseOrcaAutomationReceipt(response: OrcaCommandResult): OrcaAutomationReceipt {
  if (response.exitCode !== 0) {
    throw new OrcaCommandError('non-zero-exit', `Orca command exited with ${response.exitCode}`, response.exitCode);
  }

  const output = parseJson(response.stdout);
  const automationId = requireText(output.automationId, 'missing-automation-id', 'automationId');
  const provider = requireText(output.provider, 'missing-provider', 'provider');
  const sourceEvidence = requireText(output.sourceEvidence, 'missing-creation-evidence', 'sourceEvidence');

  try {
    return createOrcaAutomationReceipt({
      automationId,
      provider,
      target: output.target as OrcaAutomationReceipt['target'],
      trigger: output.trigger as OrcaAutomationReceipt['trigger'],
      createdAt: output.createdAt as string,
      sourceEvidence,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Orca JSON receipt is invalid';
    throw new OrcaCommandError('invalid-receipt', message);
  }
}

export function parseOrcaCancellation(response: OrcaCommandResult, expectedAutomationId: string): void {
  if (response.exitCode !== 0) {
    throw new OrcaCommandError('non-zero-exit', `Orca command exited with ${response.exitCode}`, response.exitCode);
  }

  const output = parseJson(response.stdout);
  if (output.automationId !== expectedAutomationId) {
    throw new OrcaCommandError('cancellation-mismatch', 'Orca cancellation receipt has a different automationId');
  }
  const confirmed = output.cancelled === true
    || output.canceled === true
    || output.status === 'cancelled'
    || output.status === 'canceled';
  if (!confirmed) throw new OrcaCommandError('missing-cancellation-confirmation', 'Orca did not confirm cancellation');
}
