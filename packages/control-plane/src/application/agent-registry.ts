import type { AgentAdapter, AgentAdapterRegistry } from './ports/agent-adapter';
import type { AgentLookup, AgentRegistry, AgentSourcePort, RegistryMutationResult } from './ports/agent-registry';
import {
  agentId,
  emptyUnknownReasons,
  type AgentCapabilitySnapshot,
  type AgentDescriptor,
  type AgentId,
  type AgentKey,
  type AgentSourceError,
  type AgentSourceErrorCode,
  type DiscoveryRecord,
  type SourceResult,
  type UnknownReason,
  type UnknownReasons,
  validateAgentCapabilitySnapshot,
  validateAgentDescriptor,
} from '../domain/agent';
import type { ConfigurationRevision as Revision } from '../domain/configuration';

export interface AgentRegistryDependencies {
  readonly sources?: readonly AgentSourcePort[];
  readonly provider?: AgentSourcePort;
  readonly adapters: AgentAdapterRegistry;
  readonly maxAttempts?: number;
}

type ProbeUnknownReason = Extract<UnknownReason, 'probe-unavailable' | 'probe-failed' | 'probe-timeout' | 'retry-exhausted' | 'identity-conflict'>;
function keyOf(key: AgentKey): string {
  return JSON.stringify([key.sourceId, key.agentId]);
}

function normalizeKey(value: AgentLookup): AgentKey {
  return typeof value === 'string' ? { sourceId: 'orca', agentId: value } : value;
}

function descriptorKey(descriptor: AgentDescriptor): AgentKey {
  if (descriptor.key !== undefined) return descriptor.key;
  if (descriptor.sourceId !== undefined && descriptor.agentId !== undefined) return { sourceId: descriptor.sourceId, agentId: descriptor.agentId };
  if (descriptor.id !== undefined) return { sourceId: 'orca', agentId: descriptor.id };
  throw new Error('agent descriptor identity is required');
}

function sameKey(left: AgentKey, right: AgentKey): boolean {
  return left.sourceId === right.sourceId && left.agentId === right.agentId;
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { readonly name?: unknown; readonly message?: unknown };
  return candidate.name === 'TimeoutError' || (typeof candidate.message === 'string' && /timeout/i.test(candidate.message));
}

function thrownErrorCode(error: unknown, probe: boolean): AgentSourceErrorCode {
  if (isTimeoutError(error)) return probe ? 'probe-timeout' : 'discovery-timeout';
  return probe ? 'probe-failed' : 'discovery-failed';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sourceError(code: AgentSourceErrorCode, sourceId: string, key: AgentKey | undefined, retryable: boolean, attempt: number, maxAttempts: number, message: string): AgentSourceError {
  return { code, sourceId, key, retryable, attempt, maxAttempts, message };
}

function failure<T>(status: 'failed' | 'timeout', error: AgentSourceError): SourceResult<T> {
  return { status, value: null, error, attempts: error.attempt };
}

function discoveryReason(error: AgentSourceError): UnknownReason {
  return error.code === 'discovery-timeout' ? 'discovery-timeout' : error.code === 'invalid-record' ? 'invalid-record' : 'discovery-failed';
}

function probeReason(error: AgentSourceError, registryAttempt: number, maxAttempts: number): ProbeUnknownReason {
  if (error.retryable && (registryAttempt >= maxAttempts || error.attempt >= error.maxAttempts)) return 'retry-exhausted';
  return error.code === 'probe-timeout' ? 'probe-timeout' : 'probe-failed';
}

function withReason(reasons: UnknownReasons, stage: 'discovery' | 'probe', reason: UnknownReason | null): UnknownReasons {
  return { ...reasons, [stage]: reason };
}

function materializeDescriptor(record: DiscoveryRecord): AgentDescriptor {
  const key = { sourceId: record.sourceId, agentId: record.agentId };
  const supplied = record.descriptor;
  const reasons = supplied?.unknownReasons ?? emptyUnknownReasons();
  const providerId = supplied?.providerId ?? record.providerId ?? null;
  return {
    key,
    sourceId: key.sourceId,
    agentId: key.agentId,
    providerId,
    displayName: supplied?.displayName ?? record.displayName ?? String(record.agentId),
    evidence: supplied?.evidence ?? record.evidence ?? [],
    unknownReasons: record.unknownReason === undefined
      ? (providerId === null && reasons.discovery === null ? withReason(reasons, 'discovery', 'source-only-discovery') : reasons)
      : withReason(reasons, 'discovery', record.unknownReason),
  };
}

function unknownSnapshot(key: AgentKey, reason: ProbeUnknownReason): AgentCapabilitySnapshot {
  const observedAt = new Date().toISOString();
  return {
    key,
    sourceId: key.sourceId,
    agentId: key.agentId,
    probeId: `${key.sourceId}-${key.agentId}-probe`,
    level: 'unknown',
    version: { kind: 'unknown', reason, observedAt },
    capabilities: {},
    evidence: [],
    observedAt,
    unknownReasons: { ...emptyUnknownReasons(), probe: reason },
  };
}

function isUnknownReason(value: unknown): value is UnknownReason {
  return typeof value === 'string' && [
    'source-only-discovery', 'discovery-failed', 'discovery-timeout', 'probe-unavailable', 'probe-failed', 'probe-timeout', 'retry-exhausted',
    'adapter-unregistered', 'backend-unregistered', 'unsupported-source', 'receipt-mismatch', 'invalid-record', 'evidence-invalid', 'identity-conflict',
    'migration-conflict', 'backend-failed', 'cancel-failed',
  ].includes(value);
}

function validateRecord(record: DiscoveryRecord): void {
  if (typeof record !== 'object' || record === null || typeof record.sourceId !== 'string' || record.sourceId.trim().length === 0) throw new Error('invalid discovery record');
  if (typeof record.agentId !== 'string') throw new Error('invalid discovery record');
  agentId(record.agentId);
  if (record.providerId !== undefined && record.providerId !== null && (typeof record.providerId !== 'string' || record.providerId.trim().length === 0)) throw new Error('invalid discovery record');
  if (record.displayName !== undefined && (typeof record.displayName !== 'string' || record.displayName.trim().length === 0)) throw new Error('invalid discovery record');
  if (record.evidence !== undefined && !Array.isArray(record.evidence)) throw new Error('invalid discovery record');
  if (record.unknownReason !== undefined && !isUnknownReason(record.unknownReason)) throw new Error('invalid discovery record');
  if (record.descriptor !== undefined) {
    validateAgentDescriptor(record.descriptor);
    const suppliedKey = descriptorKey(record.descriptor);
    if (!sameKey(suppliedKey, { sourceId: record.sourceId, agentId: record.agentId })) throw new Error('discovery record identity mismatch');
  }
}

function safeRecord(value: unknown, sourceId: string): DiscoveryRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { readonly sourceId?: unknown; readonly agentId?: unknown; readonly providerId?: unknown; readonly displayName?: unknown; readonly evidence?: unknown; readonly unknownReason?: unknown };
  if (candidate.sourceId !== sourceId || typeof candidate.agentId !== 'string' || candidate.agentId.trim().length === 0) return null;
  if (candidate.providerId !== undefined && candidate.providerId !== null && (typeof candidate.providerId !== 'string' || candidate.providerId.trim().length === 0)) return null;
  if (candidate.displayName !== undefined && (typeof candidate.displayName !== 'string' || candidate.displayName.trim().length === 0)) return null;
  if (candidate.evidence !== undefined && !Array.isArray(candidate.evidence)) return null;
  if (candidate.unknownReason !== undefined && !isUnknownReason(candidate.unknownReason)) return null;
  const record: DiscoveryRecord = {
    sourceId,
    agentId: agentId(candidate.agentId),
    providerId: typeof candidate.providerId === 'string' || candidate.providerId === null ? candidate.providerId : undefined,
    displayName: typeof candidate.displayName === 'string' ? candidate.displayName : undefined,
    evidence: Array.isArray(candidate.evidence) ? candidate.evidence : undefined,
    unknownReason: 'invalid-record',
  };
  return record;
}

function validCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function validSourceError(value: unknown, sourceId: string, codes: readonly AgentSourceErrorCode[]): value is AgentSourceError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!codes.includes(candidate.code as AgentSourceErrorCode) || candidate.sourceId !== sourceId || typeof candidate.retryable !== 'boolean' || !validCounter(candidate.attempt) || !validCounter(candidate.maxAttempts) || candidate.attempt > candidate.maxAttempts || typeof candidate.message !== 'string' || candidate.message.trim().length === 0) return false;
  if (candidate.key !== undefined) {
    const key = candidate.key;
    if (typeof key !== 'object' || key === null || (key as Record<string, unknown>).sourceId !== sourceId || typeof (key as Record<string, unknown>).agentId !== 'string' || ((key as Record<string, unknown>).agentId as string).trim().length === 0) return false;
  }
  return true;
}

function validSourceResult<T>(value: unknown, sourceId: string, valueCheck: (candidate: unknown) => boolean, errorCodes: readonly AgentSourceErrorCode[]): value is SourceResult<T> {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  if (!validCounter(result.attempts) || typeof result.status !== 'string') return false;
  if (result.status === 'complete') return valueCheck(result.value) && !('error' in result);
  if (result.status === 'partial') return valueCheck(result.value) && validSourceError(result.error, sourceId, errorCodes) && result.attempts === (result.error as AgentSourceError).attempt;
  if (result.status === 'failed' || result.status === 'timeout') {
    if (result.value !== null || !validSourceError(result.error, sourceId, errorCodes) || result.attempts !== (result.error as AgentSourceError).attempt) return false;
    const timeoutCode = errorCodes.includes('discovery-timeout') ? 'discovery-timeout' : 'probe-timeout';
    if (result.status === 'timeout') return result.error.code === timeoutCode;
    return result.error.code !== timeoutCode;
  }
  return false;
}

export class InMemoryAgentRegistry implements AgentRegistry {
  private readonly sources: ReadonlyMap<string, AgentSourcePort>;
  private readonly adapters: AgentAdapterRegistry;
  private readonly descriptors = new Map<string, AgentDescriptor>();
  private readonly maxAttempts: number;

  constructor(dependencies: AgentRegistryDependencies) {
    const sources = dependencies.sources ?? (dependencies.provider === undefined ? [] : [dependencies.provider]);
    const sourceMap = new Map<string, AgentSourcePort>();
    for (const source of sources) {
      if (sourceMap.has(source.sourceId)) throw new Error(`duplicate source id: ${source.sourceId}`);
      sourceMap.set(source.sourceId, source);
    }
    this.sources = sourceMap;
    this.adapters = dependencies.adapters;
    this.maxAttempts = Math.max(1, dependencies.maxAttempts ?? 3);
  }

  private async discoverOnce(source: AgentSourcePort, registryAttempt: number): Promise<SourceResult<readonly DiscoveryRecord[]>> {
    try {
      const raw: unknown = await source.discover();
      if (!validSourceResult<readonly DiscoveryRecord[]>(raw, source.sourceId, (value) => Array.isArray(value), ['discovery-failed', 'discovery-timeout', 'invalid-record', 'identity-conflict'])) {
        return failure('failed', sourceError('invalid-record', source.sourceId, undefined, registryAttempt < this.maxAttempts, registryAttempt, this.maxAttempts, 'invalid discovery result'));
      }
      return raw;
    } catch (error) {
      const code = thrownErrorCode(error, false);
      return failure(code === 'discovery-timeout' ? 'timeout' : 'failed', sourceError(code, source.sourceId, undefined, false, registryAttempt, this.maxAttempts, errorMessage(error)));
    }
  }
  private async runDiscovery(source: AgentSourcePort): Promise<{ readonly result: SourceResult<readonly DiscoveryRecord[]>; readonly attempts: number }> {
    let registryAttempt = 1;
    let result = await this.discoverOnce(source, registryAttempt);
    while (result.status !== 'complete' && result.error.retryable && registryAttempt < this.maxAttempts) {
      registryAttempt += 1;
      result = await this.discoverOnce(source, registryAttempt);
    }
    return { result, attempts: registryAttempt };
  }

  private async applyDiscoveryResult(sourceId: string, result: SourceResult<readonly DiscoveryRecord[]>, registryAttempts: number): Promise<void> {
    for (const rawRecord of result.value ?? []) {
      try {
        if (typeof rawRecord !== 'object' || rawRecord === null || rawRecord.sourceId !== sourceId) continue;
        const record = rawRecord as DiscoveryRecord;
        validateRecord(record);
        const mutation = result.status === 'complete' ? await this.upsert(record) : await this.register(record);
        if (result.status !== 'complete' && mutation.status !== 'conflict' && result.error.key !== undefined && sameKey(result.error.key, { sourceId: record.sourceId, agentId: record.agentId })) {
          const current = this.descriptors.get(keyOf({ sourceId: record.sourceId, agentId: record.agentId }));
          if (current !== undefined) {
            const exhausted = result.error.retryable && (registryAttempts >= this.maxAttempts || result.error.attempt >= result.error.maxAttempts);
            const reason = exhausted ? 'retry-exhausted' : discoveryReason(result.error);
            this.descriptors.set(keyOf(descriptorKey(current)), { ...current, unknownReasons: withReason(current.unknownReasons ?? emptyUnknownReasons(), 'discovery', reason) });
          }
        }
      } catch {
        const record = rawRecord as { readonly descriptor?: unknown };
        if (record.descriptor !== undefined) continue;
        const safe = safeRecord(rawRecord, sourceId);
        if (safe !== null) await this.upsert(safe);
      }
    }
    if (result.status !== 'complete' && result.value === null && result.error.key !== undefined) {
      if (result.error.key.sourceId !== sourceId) return;
      const exhausted = result.error.retryable && (registryAttempts >= this.maxAttempts || result.error.attempt >= result.error.maxAttempts);
      const reason = exhausted ? 'retry-exhausted' : discoveryReason(result.error);
      await this.upsert({ sourceId, agentId: result.error.key.agentId, unknownReason: reason });
    }
  }

  async list(): Promise<readonly AgentDescriptor[]> {
    for (const source of this.sources.values()) {
      const { result, attempts } = await this.runDiscovery(source);
      await this.applyDiscoveryResult(source.sourceId, result, attempts);
    }
    return [...this.descriptors.values()].sort((left, right) => keyOf(descriptorKey(left)).localeCompare(keyOf(descriptorKey(right))));
  }

  async get(value: AgentLookup): Promise<AgentDescriptor | null> {
    const key = normalizeKey(value);
    await this.list();
    return this.descriptors.get(keyOf(key)) ?? null;
  }

  private async probeSourceOnce(source: AgentSourcePort, key: AgentKey, revision: Revision | undefined, registryAttempt: number): Promise<SourceResult<AgentCapabilitySnapshot>> {
    try {
      const raw: unknown = await source.probe!(key, revision);
      if (!validSourceResult<AgentCapabilitySnapshot>(raw, source.sourceId, (value) => typeof value === 'object' && value !== null && !Array.isArray(value), ['probe-failed', 'probe-timeout', 'invalid-record', 'identity-conflict'])) {
        return failure('failed', sourceError('probe-failed', source.sourceId, key, registryAttempt < this.maxAttempts, registryAttempt, this.maxAttempts, 'invalid probe result'));
      }
      return raw;
    } catch (error) {
      const code = thrownErrorCode(error, true);
      return failure(code === 'probe-timeout' ? 'timeout' : 'failed', sourceError(code, source.sourceId, key, false, registryAttempt, this.maxAttempts, errorMessage(error)));
    }
  }

  private async runProbe(source: AgentSourcePort, key: AgentKey, revision: Revision | undefined): Promise<{ readonly result: SourceResult<AgentCapabilitySnapshot>; readonly attempts: number }> {
    let registryAttempt = 1;
    let result = await this.probeSourceOnce(source, key, revision, registryAttempt);
    while (result.status !== 'complete' && result.error.retryable && registryAttempt < this.maxAttempts) {
      registryAttempt += 1;
      result = await this.probeSourceOnce(source, key, revision, registryAttempt);
    }
    return { result, attempts: registryAttempt };
  }

  async probe(value: AgentLookup, revision?: Revision): Promise<AgentCapabilitySnapshot> {
    const key = normalizeKey(value);
    const adapter = this.adapter(key);
    if (adapter !== null) {
      try {
        const snapshot = await adapter.probe(revision === undefined ? undefined : { revision });
        validateAgentCapabilitySnapshot(snapshot);
        const snapshotKey = snapshot.key ?? (snapshot.sourceId !== undefined && snapshot.agentId !== undefined ? { sourceId: snapshot.sourceId, agentId: snapshot.agentId } : undefined);
        return snapshotKey !== undefined && sameKey(snapshotKey, key) ? snapshot : unknownSnapshot(key, 'identity-conflict');
      } catch (error) {
        if (error instanceof Error && error.message.includes('identity')) return unknownSnapshot(key, 'identity-conflict');
        return unknownSnapshot(key, isTimeoutError(error) ? 'probe-timeout' : 'probe-failed');
      }
    }
    const source = this.sources.get(key.sourceId);
    if (source?.probe === undefined) return unknownSnapshot(key, 'probe-unavailable');
    const { result, attempts } = await this.runProbe(source, key, revision);
    if (result.status === 'complete') {
      try {
        validateAgentCapabilitySnapshot(result.value);
        const snapshotKey = result.value.key ?? (result.value.sourceId !== undefined && result.value.agentId !== undefined ? { sourceId: result.value.sourceId, agentId: result.value.agentId } : undefined);
        return snapshotKey !== undefined && sameKey(snapshotKey, key) ? result.value : unknownSnapshot(key, 'identity-conflict');
      } catch {
        return unknownSnapshot(key, 'identity-conflict');
      }
    }
    if (result.status === 'partial' && result.value !== null) {
      try {
        validateAgentCapabilitySnapshot(result.value);
        const snapshotKey = result.value.key ?? (result.value.sourceId !== undefined && result.value.agentId !== undefined ? { sourceId: result.value.sourceId, agentId: result.value.agentId } : undefined);
        if (snapshotKey === undefined || !sameKey(snapshotKey, key)) return unknownSnapshot(key, 'identity-conflict');
        return {
          ...result.value,
          level: 'unknown',
          unknownReasons: withReason(result.value.unknownReasons ?? emptyUnknownReasons(), 'probe', probeReason(result.error, attempts, this.maxAttempts)),
        };
      } catch {
        return unknownSnapshot(key, 'identity-conflict');
      }
    }
    return unknownSnapshot(key, probeReason(result.error, attempts, this.maxAttempts));
  }

  adapter(value: AgentLookup): AgentAdapter | null {
    return this.adapters.get(normalizeKey(value));
  }

  async register(record: DiscoveryRecord): Promise<RegistryMutationResult> {
    try { validateRecord(record); } catch { return { status: 'conflict', error: 'invalid-record' }; }
    const descriptor = materializeDescriptor(record);
    const key = keyOf(descriptorKey(descriptor));
    const existing = this.descriptors.get(key);
    if (existing === undefined) {
      this.descriptors.set(key, descriptor);
      return { status: 'inserted', descriptor };
    }
    if (existing.providerId !== null && descriptor.providerId !== null && existing.providerId !== descriptor.providerId) return { status: 'conflict', error: 'provider-mismatch' };
    if (JSON.stringify(existing) === JSON.stringify(descriptor)) return { status: 'unchanged', descriptor: existing };
    return { status: 'conflict', error: 'identity-mismatch' };
  }

  async upsert(record: DiscoveryRecord): Promise<RegistryMutationResult> {
    try { validateRecord(record); } catch { return { status: 'conflict', error: 'invalid-record' }; }
    const descriptor = materializeDescriptor(record);
    const key = keyOf(descriptorKey(descriptor));
    const existing = this.descriptors.get(key);
    if (existing !== undefined && existing.providerId !== null && descriptor.providerId !== null && existing.providerId !== descriptor.providerId) return { status: 'conflict', error: 'provider-mismatch' };
    this.descriptors.set(key, descriptor);
    return { status: existing === undefined ? 'inserted' : 'updated', descriptor };
  }

  async merge(record: DiscoveryRecord): Promise<RegistryMutationResult> {
    try { validateRecord(record); } catch { return { status: 'conflict', error: 'invalid-record' }; }
    const descriptor = materializeDescriptor(record);
    const key = keyOf(descriptorKey(descriptor));
    const existing = this.descriptors.get(key);
    if (existing === undefined) {
      this.descriptors.set(key, descriptor);
      return { status: 'inserted', descriptor };
    }
    if (existing.providerId !== null && descriptor.providerId !== null && existing.providerId !== descriptor.providerId) return { status: 'conflict', error: 'provider-mismatch' };
    const evidence = [...new Set([...(existing.evidence ?? []), ...(descriptor.evidence ?? [])].map((item) => JSON.stringify(item)))].sort().map((item) => JSON.parse(item) as unknown);
    const merged = { ...existing, providerId: existing.providerId ?? descriptor.providerId, evidence, unknownReasons: descriptor.unknownReasons };
    this.descriptors.set(key, merged);
    return { status: JSON.stringify(existing) === JSON.stringify(merged) ? 'unchanged' : 'merged', descriptor: merged };
  }
}

export function createAgentRegistry(dependencies: AgentRegistryDependencies): AgentRegistry {
  return new InMemoryAgentRegistry(dependencies);
}
