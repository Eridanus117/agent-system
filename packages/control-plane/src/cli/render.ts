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

const SAFE_REFERENCE = /^(?:[A-Za-z0-9._~:/-]){1,256}$/;
const SAFE_LABEL = /^[A-Za-z0-9._ ()/:-]{1,128}$/;

function projectReference(value: string | undefined | null): string | null {
  if (value === null || value === undefined || !SAFE_REFERENCE.test(value)) return null;
  return value;
}

function projectLabel(value: string): string {
  return SAFE_LABEL.test(value) ? value : 'unknown';
}

function projectVersion(version: AgentCapabilitySnapshot['version'], observedAt: string): Record<string, string> {
  if (version.kind === 'known' && SAFE_LABEL.test(version.value)) return { kind: 'known', value: version.value };
  if (version.kind === 'unknown') return { kind: 'unknown', reason: projectLabel(version.reason), observedAt: version.observedAt };
  return { kind: 'unknown', reason: 'version-evidence-invalid', observedAt };
}

function projectCapabilities(capabilities: Readonly<Record<string, AgentCapabilitySnapshot['level']>>): Record<string, AgentCapabilitySnapshot['level']> {
  const result: Record<string, AgentCapabilitySnapshot['level']> = {};
  for (const name of Object.keys(capabilities).sort()) result[name] = capabilities[name]!;
  return result;
}

export function projectAgent(descriptor: AgentDescriptor, snapshot: AgentCapabilitySnapshot, preserveUnknownInventory = false): Record<string, unknown> {
  return {
    id: descriptor.id,
    displayName: projectLabel(descriptor.displayName),
    provider: projectLabel(descriptor.provider),
    level: preserveUnknownInventory ? 'unknown' : snapshot.level,
    version: projectVersion(snapshot.version, snapshot.observedAt),
    capabilities: projectCapabilities(snapshot.capabilities),
    evidenceRef: projectReference(snapshot.evidenceRef) ?? projectReference(descriptor.sourceEvidence) ?? 'unknown',
    observedAt: snapshot.observedAt,
  };
}

export function renderAgentListJson(items: readonly { readonly descriptor: AgentDescriptor; readonly snapshot: AgentCapabilitySnapshot }[]): string {
  return JSON.stringify({ agents: items.map((item) => projectAgent(item.descriptor, item.snapshot, item.descriptor.sourceEvidence.startsWith('unknown:'))) });
}

export function renderAgentProbeJson(descriptor: AgentDescriptor, snapshot: AgentCapabilitySnapshot): string {
  return JSON.stringify({ agent: projectAgent(descriptor, snapshot) });
}

function projectSchedule(schedule: AgentScheduleIntent): Record<string, unknown> {
  return {
    scheduleId: schedule.scheduleId,
    agentId: schedule.agentId,
    revisionId: schedule.revisionId,
    trigger: schedule.trigger,
    target: schedule.target,
    sessionPolicy: schedule.sessionPolicy,
    precheckRef: projectReference(schedule.precheckRef),
    sourceContextRef: projectReference(schedule.sourceContextRef),
    createdAt: schedule.createdAt,
  };
}

function projectOperation(operation: DispatchOperation | null): Record<string, unknown> | null {
  if (operation === null) return null;
  return {
    operationId: operation.operationId,
    scheduleId: operation.scheduleId,
    agentId: operation.agentId,
    revisionId: operation.revisionId,
    target: operation.target,
    phase: operation.phase,
    automationId: operation.automationId,
    manifestHash: operation.manifestHash,
    terminalReason: projectReference(operation.terminalReason),
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
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
      agent: { probeId: validated.snapshot.probeId, evidenceRef: projectReference(validated.snapshot.evidenceRef) ?? 'unknown' },
      revision: { revisionId: validated.revision.revisionId, evidenceRef: projectReference(validated.revision.evidenceRef) ?? 'unknown' },
    },
    timestamps: { createdAt: validated.schedule.createdAt, observedAt: validated.snapshot.observedAt },
  });
}

export function renderScheduleJson(schedule: AgentScheduleIntent, operation: DispatchOperation | null): string {
  return JSON.stringify({
    schedule: projectSchedule(schedule),
    operation: projectOperation(operation),
    evidence: { manifestHash: operation?.manifestHash ?? null },
    timestamps: {
      scheduleCreatedAt: schedule.createdAt,
      operationCreatedAt: operation?.createdAt ?? null,
      operationUpdatedAt: operation?.updatedAt ?? null,
    },
  });
}

export function renderSchedulingFailure(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && SAFE_REFERENCE.test(error.code)) {
    return `schedule error: ${error.code}`;
  }
  return 'schedule error: scheduler-failure';
}
export function renderHandoffLine(): string { return 'handing off to agent process'; }
