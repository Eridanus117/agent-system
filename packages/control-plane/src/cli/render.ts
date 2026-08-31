import type { ConfigurationRevision } from '../domain/configuration';
import type { ActivationOperation } from '../domain/activation-operation';
import type { ActivationStatus } from '../application/activation';

function renderFact(name: string, fact: { readonly kind: 'known'; readonly value: unknown } | { readonly kind: 'unknown'; readonly reason: string }): string {
  return fact.kind === 'known' ? `${name}: known (${String(fact.value)})` : `${name}: unknown (${fact.reason})`;
}
function renderCapabilities(revision: ConfigurationRevision): string {
  return revision.capabilities.map((capability) => {
    const details = [capability.source, capability.summary, capability.sourceRef, capability.contentFingerprint].filter((value): value is string => value !== undefined);
    return `${capability.kind}:${capability.name}${details.length === 0 ? '' : ` [${details.join(' | ')}]`}`;
  }).join(', ') || '(none)';
}
export function renderList(revisions: readonly ConfigurationRevision[]): string { return revisions.map((revision) => `${revision.configName} ${revision.revisionId}`).join('\n') || 'no configuration revisions'; }
export function renderDetail(revision: ConfigurationRevision): string { return [`config: ${revision.configName}`, `revision: ${revision.revisionId}`, renderFact('default marker', revision.defaultMarker), renderFact('scope boundary', revision.scopeBoundary), renderFact('availability', revision.availability), `capabilities: ${renderCapabilities(revision)}`, `supersedes: ${revision.supersedesRevisionId ?? '(none)'}`].join('\n'); }
export function renderConfirmationSummary(operation: ActivationOperation, revision: ConfigurationRevision): string { return [`Confirm activation`, `config: ${revision.configName}`, `revision: ${revision.revisionId}`, `agent: ${operation.agentId}`, renderFact('default marker', revision.defaultMarker), renderFact('scope boundary', revision.scopeBoundary), renderFact('availability', revision.availability), `capabilities: ${renderCapabilities(revision)}`, `agent capability: not probed yet`, `known differences: unavailable until agent probe`, `consequence: the agent process will start and take over this terminal`, `confirm with y/Enter, cancel with n/Esc`].join('\n'); }
export function renderStatus(status: ActivationStatus): string { return [`operation: ${status.operation.operationId}`, `operation phase: ${status.operationPhase}`, `observation stage: ${status.observationStage}`, `observations: ${status.observations.length}`, `next: ${status.nextStep}`].join('\n'); }
export function renderFailure(operation: ActivationOperation): string {
  if (operation.phase === 'cancelled') return [`activation cancelled`, `operation: ${operation.operationId}`, `reason: ${operation.terminalReason ?? 'user cancelled'}`, `recovery: choose a revision and run configs use <revision> --client ${operation.agentId}`].join('\n');
  if (operation.phase === 'requires-restart') return [`activation requires restart`, `operation: ${operation.operationId}`, `reason: ${operation.terminalReason ?? 'restart required'}`, `recovery: restart the agent, then run configs use <revision> --client ${operation.agentId}`].join('\n');
  return [`activation failed`, `operation: ${operation.operationId}`, `phase: ${operation.phase}`, `reason: ${operation.terminalReason ?? 'unknown'}`, `recovery: run configs use <revision> --client ${operation.agentId}`].join('\n');
}
export function renderSearchResults(results: readonly { readonly revisionId: string; readonly configName: string; readonly rank: number }[]): string { return results.map((result) => `${result.configName} ${result.revisionId} (${result.rank})`).join('\n') || 'no matches'; }
export function renderCompare(result: { readonly resolved: readonly ConfigurationRevision[]; readonly failed: readonly { readonly revisionId: string; readonly error: Error }[]; readonly comparison: { readonly revisionIds: readonly string[]; readonly capabilities: Readonly<Record<string, readonly { readonly name: string; readonly presentIn: readonly string[]; readonly missingIn: readonly string[] }[]>> } | null }): string {
  const lines: string[] = [];
  for (const revision of result.resolved) {
    lines.push(`${revision.configName} ${revision.revisionId}`);
    lines.push(`  ${renderFact('default marker', revision.defaultMarker)}`);
    lines.push(`  ${renderFact('scope boundary', revision.scopeBoundary)}`);
    lines.push(`  ${renderFact('availability', revision.availability)}`);
    lines.push(`  capabilities: ${renderCapabilities(revision)}`);
    lines.push(`  supersedes: ${revision.supersedesRevisionId ?? '(none)'}`);
  }
  for (const failure of result.failed) lines.push(`${failure.revisionId}: ${failure.error.message}`);
  for (const [kind, entries] of Object.entries(result.comparison?.capabilities ?? {})) {
    for (const entry of entries) lines.push(`${kind}:${entry.name} present=${entry.presentIn.join(',') || '-'} missing=${entry.missingIn.join(',') || '-'}`);
  }
  return lines.join('\n') || 'no configuration revisions';
}
export function renderQueryFailure(error: unknown): string { return error instanceof Error ? error.message : String(error); }

import type { AgentCapabilitySnapshot, AgentDescriptor } from '../domain/agent';
import type { AgentScheduleIntent } from '../domain/schedule';
import type { DispatchOperation } from '../domain/dispatch-operation';
import type { ValidatedSchedule } from '../application/scheduling';

const CONTROLLED_REFERENCE = /^(?:evidence:\/\/[A-Za-z0-9._~/-]+|context:\/\/[A-Za-z0-9._~/-]+|orca:[A-Za-z0-9._~:/-]+)$/;
const SAFE_LABEL = /^[A-Za-z0-9._ ()/:-]{1,128}$/;
const SAFE_TEXT = /^(?!.*(?:credential|prompt|task|transcript|environment|secret))[A-Za-z0-9._ ()/:-]{1,128}$/i;
const SAFE_SELECTOR = /^[A-Za-z0-9._~:/\\ -]{1,256}$/;
const SAFE_CRON = /^[0-9*/?, -]{1,128}$/;
const SAFE_RRULE = /^FREQ=(?:MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(?:;(?:INTERVAL|BYDAY|BYHOUR|BYMINUTE|BYMONTHDAY|BYMONTH|COUNT|UNTIL|WKST|BYSETPOS)=[A-Za-z0-9,.*?+TZ-]+)*$/;
const SAFE_CAPABILITY = /^(?!.*(?:credential|prompt|task|transcript|environment|secret))[a-z][a-z0-9._-]{0,63}$/i;
const SAFE_PROBE_ID = /^(?!.*(?:credential|prompt|task|transcript|environment|secret))[A-Za-z0-9._~:/-]{1,128}$/i;
const SAFE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const OPERATION_PHASES = new Set(['planned', 'dispatched', 'observing', 'succeeded', 'degraded', 'failed', 'skipped', 'unknown']);
const SUPPORT_LEVELS = new Set<AgentCapabilitySnapshot['level']>(['supported', 'degraded', 'unsupported', 'unknown']);

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}
function safeSelector(value: unknown): value is string {
  return matches(value, SAFE_SELECTOR) && !value.includes('://') && !value.includes('=');
}
function projectReference(value: unknown): string | null {
  return matches(value, CONTROLLED_REFERENCE) ? value : null;
}
function projectTimestamp(value: unknown): string {
  if (!matches(value, SAFE_TIMESTAMP)) return 'unknown';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 'unknown' : new Date(parsed).toISOString();
}
function projectIdentifier(value: unknown): string {
  return matches(value, SAFE_PROBE_ID) ? value : 'unknown';
}
function projectLabel(value: unknown): string {
  return matches(value, SAFE_TEXT) ? value : 'unknown';
}
function projectVersion(version: unknown, observedAt: unknown): Record<string, string> {
  const value = typeof version === 'object' && version !== null ? version as Record<string, unknown> : {};
  const safeObservedAt = projectTimestamp(observedAt);
  if (value.kind === 'known' && projectLabel(value.value) !== 'unknown') return { kind: 'known', value: value.value as string };
  if (value.kind === 'unknown') return { kind: 'unknown', reason: projectLabel(value.reason), observedAt: projectTimestamp(value.observedAt) };
  return { kind: 'unknown', reason: 'version-evidence-invalid', observedAt: safeObservedAt };
}

function projectTrigger(trigger: unknown): Record<string, string> {
  if (typeof trigger !== 'object' || trigger === null || Array.isArray(trigger)) return { kind: 'unknown' };
  const value = trigger as Record<string, unknown>;
  if (value.kind === 'preset' && matches(value.value, /^(?:hourly|daily|weekdays|weekly)$/)) return { kind: 'preset', value: value.value };
  if (value.kind === 'cron' && matches(value.expression, SAFE_CRON)) return { kind: 'cron', expression: value.expression };
  if (value.kind === 'rrule' && matches(value.value, SAFE_RRULE)) return { kind: 'rrule', value: value.value };
  return { kind: 'unknown' };
}

function projectTarget(target: unknown): Record<string, string> {
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return { kind: 'unknown' };
  const value = target as Record<string, unknown>;
  if (!matches(value.kind, /^(?:repo|workspace|project|runtime)$/) || !safeSelector(value.selector)) return { kind: 'unknown' };
  const result: Record<string, string> = { kind: value.kind, selector: value.selector };
  if (value.kind === 'project' && value.host !== undefined) {
    if (!safeSelector(value.host)) return { kind: 'unknown' };
    result.host = value.host;
  }
  return result;
}

function projectCapabilities(capabilities: unknown): Record<string, AgentCapabilitySnapshot['level']> {
  const result: Record<string, AgentCapabilitySnapshot['level']> = {};
  if (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities)) return result;
  for (const name of Object.keys(capabilities).sort()) {
    const level = (capabilities as Record<string, unknown>)[name];
    if (SAFE_CAPABILITY.test(name) && typeof level === 'string' && SUPPORT_LEVELS.has(level as AgentCapabilitySnapshot['level'])) result[name] = level as AgentCapabilitySnapshot['level'];
  }
  return result;
}
export function projectAgent(descriptor: AgentDescriptor, snapshot: AgentCapabilitySnapshot, preserveUnknownInventory = false): Record<string, unknown> {
  const value = typeof snapshot === 'object' && snapshot !== null ? snapshot as unknown as Record<string, unknown> : {};
  const level = typeof value.level === 'string' && SUPPORT_LEVELS.has(value.level as AgentCapabilitySnapshot['level']) ? value.level : 'unknown';
  return {
    id: projectIdentifier(descriptor.id),
    displayName: projectLabel(descriptor.displayName),
    provider: projectLabel(descriptor.provider),
    level: preserveUnknownInventory ? 'unknown' : level,
    version: projectVersion(value.version, value.observedAt),
    probeId: matches(value.probeId, SAFE_PROBE_ID) ? value.probeId : 'unknown',
    capabilities: projectCapabilities(value.capabilities),
    evidenceRef: projectReference(value.evidenceRef) ?? projectReference(descriptor.sourceEvidence) ?? 'unknown',
    observedAt: projectTimestamp(value.observedAt),
  };
}

export function renderAgentListJson(items: readonly { readonly descriptor: AgentDescriptor; readonly snapshot: AgentCapabilitySnapshot }[]): string {
  return JSON.stringify({
    agents: items.map((item) => projectAgent(
      item.descriptor,
      item.snapshot,
      typeof item.descriptor.sourceEvidence === 'string' && item.descriptor.sourceEvidence.startsWith('unknown:'),
    )),
  });
}
export function renderAgentProbeJson(descriptor: AgentDescriptor, snapshot: AgentCapabilitySnapshot): string {
  return JSON.stringify({ agent: projectAgent(descriptor, snapshot) });
}

function projectSchedule(schedule: AgentScheduleIntent): Record<string, unknown> {
  return {
    scheduleId: projectIdentifier(schedule.scheduleId),
    agentId: projectIdentifier(schedule.agentId),
    revisionId: projectIdentifier(schedule.revisionId),
    trigger: projectTrigger(schedule.trigger),
    target: projectTarget(schedule.target),
    sessionPolicy: matches(schedule.sessionPolicy, /^(?:fresh|reuse)$/) ? schedule.sessionPolicy : 'unknown',
    precheckRef: projectReference(schedule.precheckRef),
    sourceContextRef: projectReference(schedule.sourceContextRef),
    createdAt: projectTimestamp(schedule.createdAt),
  };
}

function projectReason(reason: unknown): string | null {
  if (reason === null) return null;
  if (typeof reason !== 'string') return 'unknown';
  const known = ['cancelled', 'precheck-failed', 'scheduler-failure', 'correlation-mismatch', 'unknown', 'incomplete'];
  return known.find((code) => reason === code || reason.startsWith(`${code}:`)) ?? 'unknown';
}

function projectOperation(operation: DispatchOperation | null): Record<string, unknown> | null {
  if (operation === null) return null;
  return {
    operationId: projectIdentifier(operation.operationId),
    scheduleId: projectIdentifier(operation.scheduleId),
    agentId: projectIdentifier(operation.agentId),
    revisionId: projectIdentifier(operation.revisionId),
    target: projectTarget(operation.target),
    phase: typeof operation.phase === 'string' && OPERATION_PHASES.has(operation.phase) ? operation.phase : 'unknown',
    automationId: projectReference(operation.automationId),
    manifestHash: matches(operation.manifestHash, /^[a-f0-9]{64}$/i) ? operation.manifestHash : null,
    terminalReason: projectReason(operation.terminalReason),
    createdAt: projectTimestamp(operation.createdAt),
    updatedAt: projectTimestamp(operation.updatedAt),
  };
}


export function renderScheduleDryRunJson(validated: ValidatedSchedule, manifestHash: string, argv: readonly string[]): string {
  return JSON.stringify({
    schedule: projectSchedule(validated.schedule),
    manifest: { hash: manifestHash },
    argv: [...argv],
    spec: { argv: [...argv] },
    externalCall: false,
    evidence: {
      agent: { probeId: matches(validated.snapshot.probeId, SAFE_PROBE_ID) ? validated.snapshot.probeId : 'unknown', evidenceRef: projectReference(validated.snapshot.evidenceRef) ?? 'unknown' },
      revision: { revisionId: projectIdentifier(validated.revision.revisionId), evidenceRef: projectReference(validated.revision.evidenceRef) ?? 'unknown' },
    },
    timestamps: { createdAt: projectTimestamp(validated.schedule.createdAt), observedAt: projectTimestamp(validated.snapshot.observedAt) },
  });
}

export function renderScheduleJson(schedule: AgentScheduleIntent, operation: DispatchOperation | null): string {
  return JSON.stringify({
    schedule: projectSchedule(schedule),
    operation: projectOperation(operation),
    evidence: { manifestHash: operation === null || !matches(operation.manifestHash, /^[a-f0-9]{64}$/i) ? null : operation.manifestHash },
    timestamps: {
      scheduleCreatedAt: projectTimestamp(schedule.createdAt),
      operationCreatedAt: operation === null ? null : projectTimestamp(operation.createdAt),
      operationUpdatedAt: operation === null ? null : projectTimestamp(operation.updatedAt),
    },
  });
}
export function renderSchedulingFailure(error: unknown): string {
  const knownCodes = [
    'invalid-arguments', 'invalid-trigger', 'invalid-target', 'invalid-session-policy', 'confirmation-required',
    'agent-not-found', 'schedule-not-found', 'operation-not-found', 'duplicate-schedule', 'duplicate-operation',
    'operation-correlation-mismatch', 'invalid-precheck', 'agent-capability-unsupported', 'revision-not-found',
    'revision-agent-mismatch', 'scheduler-failure', 'correlation-mismatch', 'automation-missing',
  ];
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && knownCodes.includes(error.code)) return `schedule error: ${error.code}`;
  return 'schedule error: scheduler-failure';
}
export function renderHandoffLine(): string { return 'handing off to agent process'; }
