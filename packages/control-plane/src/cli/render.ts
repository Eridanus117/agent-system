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
export function renderHandoffLine(): string { return 'handing off to agent process'; }
