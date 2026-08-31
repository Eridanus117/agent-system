import type { AgentSourcePort } from '../../application/ports/agent-registry';
import {
  agentId,
  emptyUnknownReasons,
  type AgentCapabilitySnapshot,
  type AgentDescriptor,
  type AgentId,
  type AgentKey,
  type AgentSourceError,
  type DiscoveryRecord,
  type SourceResult,
  validateAgentCapabilitySnapshot,
  validateAgentDescriptor,
} from '../../domain/agent';

export interface OrcaAgentProviderEvidence {
  readonly descriptors?: readonly (DiscoveryRecord | AgentDescriptor)[];
  readonly snapshots?: readonly AgentCapabilitySnapshot[];
  readonly candidateAgentIds?: readonly AgentId[];
}

const UNKNOWN_CAPABILITIES = ['launch', 'scheduling', 'worktree', 'sessionPolicy'] as const;
function tupleKey(sourceId: string, agentIdValue: AgentId): string {
  return JSON.stringify([sourceId, agentIdValue]);
}
function validateDiscoveryRecord(value: DiscoveryRecord): void {
  if (typeof value !== 'object' || value === null || value.sourceId !== 'orca') throw new Error('Orca discovery source invalid');
  agentId(value.agentId);
  if (value.providerId !== undefined && value.providerId !== null && (typeof value.providerId !== 'string' || value.providerId.trim().length === 0)) throw new Error('Orca discovery provider invalid');
  if (value.displayName !== undefined && (typeof value.displayName !== 'string' || value.displayName.trim().length === 0)) throw new Error('Orca discovery display name invalid');
  if (value.evidence !== undefined && !Array.isArray(value.evidence)) throw new Error('Orca discovery evidence invalid');
  if (value.unknownReason !== undefined && (typeof value.unknownReason !== 'string' || !['source-only-discovery', 'discovery-failed', 'discovery-timeout', 'probe-unavailable', 'probe-failed', 'probe-timeout', 'retry-exhausted', 'adapter-unregistered', 'backend-unregistered', 'unsupported-source', 'receipt-mismatch', 'invalid-record', 'evidence-invalid', 'identity-conflict', 'migration-conflict', 'backend-failed', 'cancel-failed'].includes(value.unknownReason))) throw new Error('Orca discovery unknown reason invalid');
  if (value.descriptor !== undefined) {
    validateAgentDescriptor(value.descriptor);
    const descriptorKey = value.descriptor.key ?? (
      value.descriptor.sourceId !== undefined && value.descriptor.agentId !== undefined
        ? { sourceId: value.descriptor.sourceId, agentId: value.descriptor.agentId }
        : undefined
    );
    if (descriptorKey === undefined || descriptorKey.sourceId !== value.sourceId || descriptorKey.agentId !== value.agentId) throw new Error('Orca discovery descriptor identity mismatch');
  }
}


function validateLegacyDescriptor(value: AgentDescriptor): void {
  if (typeof value.displayName !== 'string' || value.displayName.trim().length === 0) throw new Error('Orca descriptor display name invalid');
  if (value.provider !== undefined && (typeof value.provider !== 'string' || value.provider.trim().length === 0)) throw new Error('Orca descriptor provider invalid');
  if (value.sourceEvidence !== undefined && (typeof value.sourceEvidence !== 'string' || value.sourceEvidence.trim().length === 0)) throw new Error('Orca descriptor source evidence invalid');
}

function candidateRecord(agentIdValue: AgentId): DiscoveryRecord {
  return { sourceId: 'orca', agentId: agentIdValue, providerId: null, unknownReason: 'source-only-discovery' };
}

function isDiscoveryRecord(value: DiscoveryRecord | AgentDescriptor): value is DiscoveryRecord {
  return !('key' in value) && !('id' in value);
}

function toRecord(value: DiscoveryRecord | AgentDescriptor): DiscoveryRecord {
  if (isDiscoveryRecord(value)) {
    validateDiscoveryRecord(value);
    return value;
  }
  if ('key' in value && value.key !== undefined) {
    validateAgentDescriptor(value);
    if (value.key.sourceId !== 'orca') throw new Error('Orca descriptor source mismatch');
    return { sourceId: 'orca', agentId: value.key.agentId, providerId: value.providerId, displayName: value.displayName, evidence: value.evidence, descriptor: value, unknownReason: value.unknownReasons?.discovery ?? undefined };
  }
  if ('id' in value && value.id !== undefined) {
    validateLegacyDescriptor(value);
    agentId(value.id);
    return { sourceId: 'orca', agentId: value.id, providerId: value.provider ?? null, displayName: value.displayName, evidence: value.sourceEvidence === undefined ? [] : [value.sourceEvidence] };
  }
  throw new Error('Orca descriptor identity is required');
}

function snapshotKey(snapshot: AgentCapabilitySnapshot): AgentKey {
  const key = snapshot.key ?? (snapshot.sourceId === undefined ? undefined : { sourceId: snapshot.sourceId, agentId: snapshot.agentId });
  if (key === undefined) throw new Error('Orca snapshot identity is required');
  if (key.sourceId !== 'orca' || key.agentId !== snapshot.agentId) throw new Error('Orca snapshot identity mismatch');
  validateAgentCapabilitySnapshot(snapshot);
  return key;
}

function invalidResult<T>(message: string, key?: AgentKey): SourceResult<T> {
  const error: AgentSourceError = { code: 'invalid-record', sourceId: 'orca', key, retryable: false, attempt: 1, maxAttempts: 1, message };
  return { status: 'failed', value: null, error, attempts: 1 };
}

function unknownSnapshot(key: AgentKey): AgentCapabilitySnapshot {
  const observedAt = new Date().toISOString();
  const capabilities: Record<string, 'unknown'> = {};
  for (const capability of UNKNOWN_CAPABILITIES) capabilities[capability] = 'unknown';
  return {
    key,
    sourceId: key.sourceId,
    agentId: key.agentId,
    probeId: `orca-${key.agentId}-probe`,
    level: 'unknown',
    version: { kind: 'unknown', reason: 'probe-unavailable', observedAt },
    capabilities,
    evidence: [],
    observedAt,
    unknownReasons: { ...emptyUnknownReasons(), probe: 'probe-unavailable' },
  };
}

/** 只接受 Orca 已捕获的结构化证据，不读取或解析人类可读终端输出。 */
export class OrcaAgentProvider implements AgentSourcePort {
  readonly sourceId = 'orca';
  private readonly descriptors: readonly DiscoveryRecord[];
  private readonly snapshots: ReadonlyMap<string, AgentCapabilitySnapshot>;
  private readonly discoveryError: string | null;
  private readonly invalidSnapshotKeys: ReadonlySet<string>;

  constructor(evidence: OrcaAgentProviderEvidence | readonly (DiscoveryRecord | AgentDescriptor)[] = {}) {
    const normalized = (Array.isArray(evidence) ? { descriptors: evidence } : evidence) as OrcaAgentProviderEvidence;
    let discoveryError: string | null = null;
    const descriptors: DiscoveryRecord[] = [];
    for (const descriptor of normalized.descriptors ?? (normalized.candidateAgentIds ?? []).map(candidateRecord)) {
      try {
        descriptors.push(toRecord(descriptor));
      } catch (error) {
        discoveryError ??= error instanceof Error ? error.message : String(error);
      }
    }
    this.discoveryError = discoveryError;
    this.descriptors = descriptors;

    const invalidSnapshotKeys = new Set<string>();
    const snapshots = new Map<string, AgentCapabilitySnapshot>();
    for (const snapshot of normalized.snapshots ?? []) {
      try {
        const key = snapshotKey(snapshot);
        snapshots.set(tupleKey(key.sourceId, key.agentId), snapshot);
      } catch {
        const candidate = snapshot as unknown as { readonly key?: unknown; readonly sourceId?: unknown; readonly agentId?: unknown };
        const candidateKey = typeof candidate.key === 'object' && candidate.key !== null
          ? candidate.key as { readonly sourceId?: unknown; readonly agentId?: unknown }
          : candidate;
        if (candidateKey.sourceId === 'orca' && typeof candidateKey.agentId === 'string' && candidateKey.agentId.trim().length > 0) invalidSnapshotKeys.add(tupleKey('orca', candidateKey.agentId as AgentId));
      }
    }
    this.invalidSnapshotKeys = invalidSnapshotKeys;
    this.snapshots = snapshots;
  }

  async discover(): Promise<SourceResult<readonly DiscoveryRecord[]>> {
    if (this.discoveryError === null) return { status: 'complete', value: this.descriptors, attempts: 1 };
    const error: AgentSourceError = { code: 'invalid-record', sourceId: 'orca', retryable: false, attempt: 1, maxAttempts: 1, message: this.discoveryError };
    return this.descriptors.length === 0 ? { status: 'failed', value: null, error, attempts: 1 } : { status: 'partial', value: this.descriptors, error, attempts: 1 };
  }

  async probe(key: AgentKey): Promise<SourceResult<AgentCapabilitySnapshot>> {
    if (key.sourceId !== 'orca') return invalidResult('Orca probe source mismatch', key);
    if (this.invalidSnapshotKeys.has(tupleKey(key.sourceId, key.agentId))) return invalidResult('Orca probe snapshot identity invalid', key);
    const snapshot = this.snapshots.get(tupleKey(key.sourceId, key.agentId)) ?? unknownSnapshot(key);
    return { status: 'complete', value: snapshot, attempts: 1 };
  }
}
