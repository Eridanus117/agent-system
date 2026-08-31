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
const CONTROLLED_REFERENCE = /^[A-Za-z][A-Za-z0-9+.-]*:[A-Za-z0-9._~:/-]+$/;
const FORBIDDEN_REFERENCE_SCHEMES: Record<string, true> = {
  prompt: true,
  task: true,
  secret: true,
  credential: true,
  credentials: true,
  transcript: true,
};
const SCHEDULE_INTENT_KEYS = ['scheduleId', 'agentId', 'revisionId', 'trigger', 'target', 'sessionPolicy', 'precheckRef', 'sourceContextRef', 'createdAt'] as const;
const PRESET_TRIGGER_KEYS = ['kind', 'value'] as const;
const CRON_TRIGGER_KEYS = ['kind', 'expression'] as const;
const RRULE_TRIGGER_KEYS = ['kind', 'value'] as const;
const SIMPLE_TARGET_KEYS = ['kind', 'selector'] as const;
const PROJECT_TARGET_KEYS = ['kind', 'selector', 'host'] as const;
const RECEIPT_KEYS = ['automationId', 'provider', 'target', 'trigger', 'createdAt', 'sourceEvidence'] as const;

function requireExactKeys(value: object, allowedKeys: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) throw new Error(`${label} contains unknown field: ${key}`);
  }
}

function kindOf(value: object): unknown {
  return 'kind' in value ? value.kind : undefined;
}
function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
}

function requireNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

function validateControlledReference(value: unknown, label: string): asserts value is string {
  requireNonEmptyText(value, label);
  if (!CONTROLLED_REFERENCE.test(value)) throw new Error(`${label} must be a controlled reference`);
  const scheme = value.slice(0, value.indexOf(':')).toLowerCase();
  if (FORBIDDEN_REFERENCE_SCHEMES[scheme]) throw new Error(`${label} must be a controlled reference`);
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
  requireRecord(trigger, 'schedule trigger');
  if (trigger.kind === 'preset') {
    requireExactKeys(trigger, PRESET_TRIGGER_KEYS, 'preset trigger');
    if (!PRESET_VALUES.includes(trigger.value as string)) throw new Error(`invalid schedule preset: ${String(trigger.value)}`);
    return;
  }
  if (trigger.kind === 'cron') {
    requireExactKeys(trigger, CRON_TRIGGER_KEYS, 'cron trigger');
    requireNonEmptyText(trigger.expression, 'cron expression');
    if (trigger.expression.trim().split(/\s+/).length !== 5) throw new Error('cron expression must have five fields');
    return;
  }
  if (trigger.kind === 'rrule') {
    requireExactKeys(trigger, RRULE_TRIGGER_KEYS, 'RRULE trigger');
    requireNonEmptyText(trigger.value, 'RRULE value');
    return;
  }
  throw new Error(`invalid schedule trigger kind: ${String(kindOf(trigger))}`);
}

function normalizeScheduleTrigger(trigger: ScheduleTrigger): ScheduleTrigger {
  validateScheduleTrigger(trigger);
  if (trigger.kind === 'preset') return { kind: 'preset', value: trigger.value };
  if (trigger.kind === 'cron') return { kind: 'cron', expression: trigger.expression.trim() };
  return { kind: 'rrule', value: trigger.value.trim() };
}

export function validateScheduleTarget(target: ScheduleTarget): void {
  requireRecord(target, 'schedule target');
  if (target.kind === 'repo' || target.kind === 'workspace' || target.kind === 'runtime') {
    requireExactKeys(target, SIMPLE_TARGET_KEYS, `${target.kind} target`);
    requireNonEmptyText(target.selector, `${target.kind} selector`);
    return;
  }
  if (target.kind === 'project') {
    requireExactKeys(target, PROJECT_TARGET_KEYS, 'project target');
    requireNonEmptyText(target.selector, 'project selector');
    if (target.host !== undefined) requireNonEmptyText(target.host, 'project host');
    return;
  }
  throw new Error(`invalid schedule target kind: ${String(kindOf(target))}`);
}

function normalizeScheduleTarget(target: ScheduleTarget): ScheduleTarget {
  validateScheduleTarget(target);
  if (target.kind === 'project') {
    return target.host === undefined
      ? { kind: 'project', selector: target.selector.trim() }
      : { kind: 'project', selector: target.selector.trim(), host: target.host.trim() };
  }
  return { kind: target.kind, selector: target.selector.trim() };
}

export function validateAgentScheduleIntent(intent: AgentScheduleIntent): void {
  requireRecord(intent, 'schedule intent');
  requireExactKeys(intent, SCHEDULE_INTENT_KEYS, 'schedule intent');
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
  if (value !== null) validateControlledReference(value, label);
}

export function createAgentScheduleIntent(input: AgentScheduleIntent): AgentScheduleIntent {
  validateAgentScheduleIntent(input);
  return {
    scheduleId: input.scheduleId.trim(),
    agentId: agentId(input.agentId),
    revisionId: input.revisionId.trim(),
    trigger: normalizeScheduleTrigger(input.trigger),
    target: normalizeScheduleTarget(input.target),
    sessionPolicy: input.sessionPolicy,
    precheckRef: input.precheckRef === null ? null : input.precheckRef,
    sourceContextRef: input.sourceContextRef === null ? null : input.sourceContextRef,
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
  requireRecord(receipt, 'automation receipt');
  requireExactKeys(receipt, RECEIPT_KEYS, 'automation receipt');
  requireNonEmptyText(receipt.automationId, 'automation id');
  requireNonEmptyText(receipt.provider, 'automation provider');
  validateScheduleTarget(receipt.target);
  validateScheduleTrigger(receipt.trigger);
  validateRfc3339Timestamp(receipt.createdAt, 'createdAt');
  validateControlledReference(receipt.sourceEvidence, 'source evidence');
}

export function createOrcaAutomationReceipt(input: OrcaAutomationReceipt): OrcaAutomationReceipt {
  validateOrcaAutomationReceipt(input);
  return {
    automationId: input.automationId.trim(),
    provider: input.provider.trim(),
    target: normalizeScheduleTarget(input.target),
    trigger: normalizeScheduleTrigger(input.trigger),
    createdAt: input.createdAt,
    sourceEvidence: input.sourceEvidence,
  };
}
