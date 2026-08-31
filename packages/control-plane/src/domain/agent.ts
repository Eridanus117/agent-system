export interface KnownText {
  readonly kind: 'known';
  readonly value: string;
}

export interface UnknownText {
  readonly kind: 'unknown';
  readonly reason: string;
  readonly observedAt: string;
}

export type ObservedText = KnownText | UnknownText;

export type AgentId = string & { readonly __agentId: unique symbol };

export function agentId(value: string): AgentId {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error('agent id must not be empty');
  return trimmed as AgentId;
}

export type SupportLevel = 'supported' | 'degraded' | 'unsupported' | 'unknown';

export interface AgentDescriptor {
  readonly id: AgentId;
  readonly displayName: string;
  readonly provider: string;
  readonly sourceEvidence: string;
}

export interface AgentCapabilitySnapshot {
  readonly probeId: string;
  readonly agentId: AgentId;
  readonly level: SupportLevel;
  readonly version: ObservedText;
  readonly capabilities: Readonly<Record<string, SupportLevel>>;
  readonly observedAt: string;
  readonly evidenceRef: string;
}

const SUPPORT_LEVELS: readonly SupportLevel[] = ['supported', 'degraded', 'unsupported', 'unknown'];

function isSupportLevel(value: unknown): value is SupportLevel {
  return typeof value === 'string' && SUPPORT_LEVELS.includes(value as SupportLevel);
}

function requireNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

function validateObservedText(value: ObservedText): void {
  if (typeof value !== 'object' || value === null) throw new Error('observed text must be an object');
  if (value.kind === 'known') {
    if (typeof value.value !== 'string') throw new Error('known observed text value must be a string');
    return;
  }
  if (value.kind === 'unknown') {
    requireNonEmptyText(value.reason, 'unknown observed text reason');
    requireNonEmptyText(value.observedAt, 'unknown observed text observedAt');
    return;
  }
  throw new Error('invalid observed text kind');
}

export function validateAgentCapabilitySnapshot(snapshot: AgentCapabilitySnapshot): void {
  if (typeof snapshot !== 'object' || snapshot === null) throw new Error('agent capability snapshot must be an object');
  requireNonEmptyText(snapshot.probeId, 'agent capability snapshot probe id');
  agentId(snapshot.agentId);
  if (!isSupportLevel(snapshot.level)) throw new Error(`invalid agent support level: ${String(snapshot.level)}`);
  validateObservedText(snapshot.version);
  if (typeof snapshot.capabilities !== 'object' || snapshot.capabilities === null || Array.isArray(snapshot.capabilities)) throw new Error('agent capability snapshot capabilities must be an object');
  for (const [name, level] of Object.entries(snapshot.capabilities)) {
    requireNonEmptyText(name, 'agent capability name');
    if (!isSupportLevel(level)) throw new Error(`invalid agent capability support level: ${String(level)}`);
  }
  requireNonEmptyText(snapshot.observedAt, 'agent capability snapshot observedAt');
  requireNonEmptyText(snapshot.evidenceRef, 'agent capability snapshot evidence reference');
}
