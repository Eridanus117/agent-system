import { agentId, type AgentId } from './agent';

export type ScheduleTrigger =
  | { readonly kind: 'preset'; readonly value: 'hourly' | 'daily' | 'weekdays' | 'weekly' }
  | { readonly kind: 'cron'; readonly expression: string }
  | { readonly kind: 'rrule'; readonly value: string };

export type ScheduleTarget =
  | { readonly kind: 'repo'; readonly selector: string }
  | { readonly kind: 'workspace'; readonly selector: string }
  | { readonly kind: 'project'; readonly selector: string; readonly host?: string }
  | { readonly kind: 'runtime'; readonly selector: string };

export type SessionPolicy = 'fresh' | 'reuse';

export interface AgentScheduleIntent {
  readonly scheduleId: string;
  readonly agentId: AgentId;
  readonly revisionId: string;
  readonly trigger: ScheduleTrigger;
  readonly target: ScheduleTarget;
  readonly sessionPolicy: SessionPolicy;
  readonly precheckRef: string | null;
  readonly sourceContextRef: string | null;
  readonly createdAt: string;
}

const PRESET_VALUES: readonly string[] = ['hourly', 'daily', 'weekdays', 'weekly'];
const SESSION_POLICIES: readonly string[] = ['fresh', 'reuse'];
const RFC3339_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function requireNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

export function validateRfc3339Timestamp(value: unknown, label = 'timestamp'): asserts value is string {
  requireNonEmptyText(value, label);
  if (!RFC3339_TIMESTAMP.test(value)) throw new Error(`${label} must be RFC3339`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be RFC3339`);

  const [, year, month, day, hour, minute, second, offset] = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  ) ?? [];
  if (!year || !month || !day || !hour || !minute || !second || !offset) throw new Error(`${label} must be RFC3339`);
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31 || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new Error(`${label} must be RFC3339`);
  }
  if (offset !== 'Z') {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) throw new Error(`${label} must be RFC3339`);
  }
  const calendarDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (calendarDate.getUTCFullYear() !== Number(year) || calendarDate.getUTCMonth() + 1 !== Number(month) || calendarDate.getUTCDate() !== Number(day)) {
    throw new Error(`${label} must be RFC3339`);
  }
}

export function validateScheduleTrigger(trigger: ScheduleTrigger): void {
  if (typeof trigger !== 'object' || trigger === null || Array.isArray(trigger)) throw new Error('schedule trigger must be an object');
  if (trigger.kind === 'preset') {
    if (!PRESET_VALUES.includes(trigger.value)) throw new Error(`invalid schedule preset: ${String(trigger.value)}`);
    return;
  }
  if (trigger.kind === 'cron') {
    requireNonEmptyText(trigger.expression, 'cron expression');
    if (trigger.expression.trim().split(/\s+/).length !== 5) throw new Error('cron expression must have five fields');
    return;
  }
  if (trigger.kind === 'rrule') {
    requireNonEmptyText(trigger.value, 'RRULE value');
    return;
  }
  throw new Error(`invalid schedule trigger kind: ${String(trigger.kind)}`);
}

export function validateScheduleTarget(target: ScheduleTarget): void {
  if (typeof target !== 'object' || target === null || Array.isArray(target)) throw new Error('schedule target must be an object');
  if (target.kind === 'repo' || target.kind === 'workspace' || target.kind === 'runtime') {
    requireNonEmptyText(target.selector, `${target.kind} selector`);
    if ('host' in target) throw new Error(`${target.kind} target does not support host`);
    return;
  }
  if (target.kind === 'project') {
    requireNonEmptyText(target.selector, 'project selector');
    if (target.host !== undefined) requireNonEmptyText(target.host, 'project host');
    return;
  }
  throw new Error(`invalid schedule target kind: ${String(target.kind)}`);
}

export function validateAgentScheduleIntent(intent: AgentScheduleIntent): void {
  if (typeof intent !== 'object' || intent === null || Array.isArray(intent)) throw new Error('schedule intent must be an object');
  requireNonEmptyText(intent.scheduleId, 'schedule id');
  agentId(intent.agentId);
  requireNonEmptyText(intent.revisionId, 'revision id');
  validateScheduleTrigger(intent.trigger);
  validateScheduleTarget(intent.target);
  if (!SESSION_POLICIES.includes(intent.sessionPolicy)) throw new Error(`invalid session policy: ${String(intent.sessionPolicy)}`);
  validateOptionalReference(intent.precheckRef, 'precheck reference');
  validateOptionalReference(intent.sourceContextRef, 'source context reference');
  validateRfc3339Timestamp(intent.createdAt, 'createdAt');
}

function validateOptionalReference(value: string | null, label: string): void {
  if (value !== null) requireNonEmptyText(value, label);
}

export function createAgentScheduleIntent(input: AgentScheduleIntent): AgentScheduleIntent {
  validateAgentScheduleIntent(input);
  return {
    scheduleId: input.scheduleId.trim(),
    agentId: agentId(input.agentId),
    revisionId: input.revisionId.trim(),
    trigger: input.trigger,
    target: input.target,
    sessionPolicy: input.sessionPolicy,
    precheckRef: input.precheckRef === null ? null : input.precheckRef.trim(),
    sourceContextRef: input.sourceContextRef === null ? null : input.sourceContextRef.trim(),
    createdAt: input.createdAt,
  };
}
export interface OrcaAutomationReceipt {
  readonly automationId: string;
  readonly provider: string;
  readonly target: ScheduleTarget;
  readonly trigger: ScheduleTrigger;
  readonly createdAt: string;
  readonly sourceEvidence: string;
}

export function validateOrcaAutomationReceipt(receipt: OrcaAutomationReceipt): void {
  if (typeof receipt !== 'object' || receipt === null || Array.isArray(receipt)) throw new Error('automation receipt must be an object');
  requireNonEmptyText(receipt.automationId, 'automation id');
  requireNonEmptyText(receipt.provider, 'automation provider');
  validateScheduleTarget(receipt.target);
  validateScheduleTrigger(receipt.trigger);
  validateRfc3339Timestamp(receipt.createdAt, 'createdAt');
  requireNonEmptyText(receipt.sourceEvidence, 'source evidence');
}
