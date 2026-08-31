import type { OrcaAgentProviderPort } from '../../application/ports/agent-registry';
import type { AgentCapabilitySnapshot, AgentDescriptor, AgentId } from '../../domain/agent';

export interface OrcaAgentProviderEvidence {
  readonly descriptors?: readonly AgentDescriptor[];
  readonly snapshots?: readonly AgentCapabilitySnapshot[];
  readonly candidateAgentIds?: readonly AgentId[];
}

const UNKNOWN_CAPABILITIES = ['launch', 'scheduling', 'worktree', 'sessionPolicy'] as const;

function unknownDescriptor(agentIdValue: AgentId): AgentDescriptor {
  return {
    id: agentIdValue,
    displayName: agentIdValue,
    provider: 'orca',
    sourceEvidence: 'unknown:orca-provider-inventory-unavailable',
  };
}

function unknownSnapshot(agentIdValue: AgentId): AgentCapabilitySnapshot {
  const observedAt = new Date().toISOString();
  const capabilities: Record<string, 'unknown'> = {};
  for (const capability of UNKNOWN_CAPABILITIES) capabilities[capability] = 'unknown';
  return {
    probeId: `orca-${agentIdValue}-probe`,
    agentId: agentIdValue,
    level: 'unknown',
    version: { kind: 'unknown', reason: 'orca-provider-inventory-unavailable', observedAt },
    capabilities,
    observedAt,
    evidenceRef: 'unknown:orca-provider-inventory-unavailable',
  };
}

/** 只接受 Orca 已捕获的结构化证据，不读取或解析人类可读终端输出。 */
export class OrcaAgentProvider implements OrcaAgentProviderPort {
  private readonly descriptors: readonly AgentDescriptor[];
  private readonly snapshots: ReadonlyMap<AgentId, AgentCapabilitySnapshot>;

  constructor(evidence: OrcaAgentProviderEvidence | readonly AgentDescriptor[] = {}) {
    const normalized: OrcaAgentProviderEvidence = Array.isArray(evidence as unknown[]) ? { descriptors: evidence as readonly AgentDescriptor[] } : evidence as OrcaAgentProviderEvidence;
    const descriptors = normalized.descriptors ?? (normalized.candidateAgentIds ?? []).map(unknownDescriptor);
    this.descriptors = descriptors;
    this.snapshots = new Map(normalized.snapshots?.map((snapshot) => [snapshot.agentId, snapshot]) ?? []);
  }

  async discover(): Promise<readonly AgentDescriptor[]> {
    return this.descriptors;
  }

  async probe(agentIdValue: AgentId): Promise<AgentCapabilitySnapshot> {
    return this.snapshots.get(agentIdValue) ?? unknownSnapshot(agentIdValue);
  }
}
