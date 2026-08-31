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
export type AgentSourceId = string;

export function agentId(value: string): AgentId {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error('agent id must not be empty');
  return trimmed as AgentId;
}

export interface AgentKey {
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
}

export type SupportLevel = 'supported' | 'degraded' | 'unsupported' | 'unknown';

export type UnknownReason =
  | 'source-only-discovery'
  | 'discovery-failed'
  | 'discovery-timeout'
  | 'probe-unavailable'
  | 'probe-failed'
  | 'probe-timeout'
  | 'retry-exhausted'
  | 'adapter-unregistered'
  | 'backend-unregistered'
  | 'unsupported-source'
  | 'receipt-mismatch'
  | 'invalid-record'
  | 'evidence-invalid'
  | 'identity-conflict'
  | 'migration-conflict'
  | 'backend-failed'
  | 'cancel-failed';

export type CapabilityStage =
  | 'discovery'
  | 'probe'
  | 'assembly'
  | 'launch'
  | 'scheduling'
  | 'dispatch'
  | 'observation'
  | 'recovery'
  | 'closure';

export type UnknownReasons = {
  readonly [stage in CapabilityStage]: UnknownReason | null;
};

export function emptyUnknownReasons(): UnknownReasons {
  return {
    discovery: null,
    probe: null,
    assembly: null,
    launch: null,
    scheduling: null,
    dispatch: null,
    observation: null,
    recovery: null,
    closure: null,
  };
}

export interface DiscoveryRecord {
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
  readonly providerId?: string | null;
  readonly displayName?: string;
  readonly evidence?: readonly unknown[];
  readonly descriptor?: AgentDescriptor;
  readonly unknownReason?: UnknownReason;
}

export type AgentSourceErrorCode =
  | 'discovery-failed'
  | 'discovery-timeout'
  | 'probe-failed'
  | 'probe-timeout'
  | 'invalid-record'
  | 'identity-conflict';

export interface AgentSourceError {
  readonly code: AgentSourceErrorCode;
  readonly sourceId: AgentSourceId;
  readonly key?: AgentKey;
  readonly retryable: boolean;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly message: string;
}

export type SourceResult<T> =
  | { readonly status: 'complete'; readonly value: T; readonly attempts: number }
  | { readonly status: 'partial'; readonly value: T; readonly error: AgentSourceError; readonly attempts: number }
  | { readonly status: 'failed' | 'timeout'; readonly value: null; readonly error: AgentSourceError; readonly attempts: number };

export interface AgentDescriptor {
  readonly key?: AgentKey;
  readonly sourceId?: AgentSourceId;
  readonly agentId?: AgentId;
  readonly providerId?: string | null;
  readonly displayName: string;
  readonly evidence?: readonly unknown[];
  readonly unknownReasons?: UnknownReasons;
  /** 兼容旧调用方，新的 source-scoped 调用必须使用 key/sourceId/agentId/providerId。 */
  readonly id?: AgentId;
  readonly provider?: string;
  readonly sourceEvidence?: string;
}

export interface AgentCapabilitySnapshot {
  readonly key?: AgentKey;
  readonly sourceId?: AgentSourceId;
  readonly agentId: AgentId;
  readonly probeId: string;
  readonly level: SupportLevel;
  readonly version: ObservedText;
  readonly capabilities: Readonly<Record<string, SupportLevel>>;
  readonly evidence?: readonly unknown[];
  readonly observedAt: string;
  readonly unknownReasons?: UnknownReasons;
  /** 兼容旧调用方，新的 source-scoped 调用必须使用 key/sourceId/agentId。 */
  readonly evidenceRef?: string;
}

const SUPPORT_LEVELS: readonly SupportLevel[] = ['supported', 'degraded', 'unsupported', 'unknown'];
const UNKNOWN_REASONS: readonly UnknownReason[] = [
  'source-only-discovery', 'discovery-failed', 'discovery-timeout', 'probe-unavailable',
  'probe-failed', 'probe-timeout', 'retry-exhausted', 'adapter-unregistered',
  'backend-unregistered', 'unsupported-source', 'receipt-mismatch', 'invalid-record',
  'evidence-invalid', 'identity-conflict', 'migration-conflict', 'backend-failed', 'cancel-failed',
];
const CAPABILITY_STAGES: readonly CapabilityStage[] = ['discovery', 'probe', 'assembly', 'launch', 'scheduling', 'dispatch', 'observation', 'recovery', 'closure'];

function isSupportLevel(value: unknown): value is SupportLevel {
  return typeof value === 'string' && SUPPORT_LEVELS.includes(value as SupportLevel);
}

function isUnknownReason(value: unknown): value is UnknownReason {
  return typeof value === 'string' && UNKNOWN_REASONS.includes(value as UnknownReason);
}

function requireNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

function validateAgentKey(key: AgentKey): void {
  if (typeof key !== 'object' || key === null) throw new Error('agent key must be an object');
  requireNonEmptyText(key.sourceId, 'agent source id');
  agentId(key.agentId);
}

function validateUnknownReasons(reasons: UnknownReasons): void {
  if (typeof reasons !== 'object' || reasons === null || Array.isArray(reasons)) throw new Error('unknown reasons must be an object');
  for (const stage of CAPABILITY_STAGES) {
    const reason = reasons[stage];
    if (reason !== null && !isUnknownReason(reason)) throw new Error(`invalid unknown reason for ${stage}`);
  }
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

export function validateAgentDescriptor(descriptor: AgentDescriptor): void {
  if (typeof descriptor !== 'object' || descriptor === null) throw new Error('agent descriptor must be an object');
  const key = descriptor.key ?? (descriptor.sourceId === undefined || descriptor.agentId === undefined ? undefined : { sourceId: descriptor.sourceId, agentId: descriptor.agentId });
  if (key === undefined) throw new Error('agent descriptor identity is required');
  validateAgentKey(key);
  if (descriptor.sourceId !== undefined && descriptor.sourceId !== key.sourceId) throw new Error('agent descriptor identity mismatch');
  if (descriptor.agentId !== undefined && descriptor.agentId !== key.agentId) throw new Error('agent descriptor identity mismatch');
  requireNonEmptyText(descriptor.displayName, 'agent descriptor display name');
  if (descriptor.providerId !== undefined && descriptor.providerId !== null) requireNonEmptyText(descriptor.providerId, 'agent descriptor provider id');
  if (descriptor.evidence !== undefined && !Array.isArray(descriptor.evidence)) throw new Error('agent descriptor evidence must be an array');
  if (descriptor.unknownReasons !== undefined) validateUnknownReasons(descriptor.unknownReasons);
  if (descriptor.id !== undefined) {
    agentId(descriptor.id);
    if (key.sourceId !== 'orca' || descriptor.id !== key.agentId) throw new Error('agent descriptor legacy id mismatch');
  }
  if (descriptor.provider !== undefined) requireNonEmptyText(descriptor.provider, 'agent descriptor provider');
  if (descriptor.sourceEvidence !== undefined) requireNonEmptyText(descriptor.sourceEvidence, 'agent descriptor source evidence');
}

export function validateAgentCapabilitySnapshot(snapshot: AgentCapabilitySnapshot): void {
  if (typeof snapshot !== 'object' || snapshot === null) throw new Error('agent capability snapshot must be an object');
  const key = snapshot.key ?? (snapshot.sourceId === undefined ? undefined : { sourceId: snapshot.sourceId, agentId: snapshot.agentId });
  if (key !== undefined) {
    validateAgentKey(key);
    if (snapshot.sourceId !== undefined && snapshot.sourceId !== key.sourceId) throw new Error('agent capability snapshot identity mismatch');
    if (snapshot.agentId !== key.agentId) throw new Error('agent capability snapshot identity mismatch');
  }
  requireNonEmptyText(snapshot.probeId, 'agent capability snapshot probe id');
  agentId(snapshot.agentId);
  if (!isSupportLevel(snapshot.level)) throw new Error(`invalid agent support level: ${String(snapshot.level)}`);
  validateObservedText(snapshot.version);
  if (typeof snapshot.capabilities !== 'object' || snapshot.capabilities === null || Array.isArray(snapshot.capabilities)) throw new Error('agent capability snapshot capabilities must be an object');
  for (const [name, level] of Object.entries(snapshot.capabilities)) {
    requireNonEmptyText(name, 'agent capability name');
    if (!isSupportLevel(level)) throw new Error(`invalid agent capability support level: ${String(level)}`);
  }
  if (snapshot.evidence !== undefined && !Array.isArray(snapshot.evidence)) throw new Error('agent capability snapshot evidence must be an array');
  requireNonEmptyText(snapshot.observedAt, 'agent capability snapshot observedAt');
  if (snapshot.evidenceRef !== undefined) requireNonEmptyText(snapshot.evidenceRef, 'agent capability snapshot evidence reference');
  if (snapshot.unknownReasons !== undefined) validateUnknownReasons(snapshot.unknownReasons);
}

