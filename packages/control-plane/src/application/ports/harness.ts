export interface HarnessUnknown {
  readonly kind: 'unknown';
  readonly reasonCode: string;
  readonly observedAt: string;
  readonly recovery: string;
}

export type HarnessAgentId = 'omp' | 'claude';
export type HarnessProbeAgentId = HarnessAgentId | 'codex' | 'opencode';

export interface HarnessConfigRevisionRef {
  readonly revisionId: string;
  readonly schemaVersion: number;
  readonly agentId: HarnessAgentId;
  readonly source: string;
  readonly sourceVersion: string;
  readonly observedAt: string;
}

export interface HarnessAssemblyManifestRef {
  readonly revisionId: string;
  readonly agentId: HarnessAgentId;
  readonly manifestDigest: string;
  readonly itemCount: number;
  readonly source: string;
  readonly sourceVersion: string;
  readonly observedAt: string;
}

export interface HarnessAgentCapability {
  readonly agentId: HarnessProbeAgentId;
  readonly agentVersion: string;
  readonly status: 'supported' | 'degraded' | 'unsupported' | 'unknown';
  readonly source: string;
  readonly sourceVersion: string;
  readonly reasonCode?: string;
  readonly observedAt: string;
}

export interface HarnessLaunchPlanRef {
  readonly revisionId: string;
  readonly agentId: HarnessAgentId;
  readonly planDigest: string;
  readonly launchBoundary: 'invocation-scoped';
  readonly source: string;
  readonly sourceVersion: string;
  readonly observedAt: string;
}

export interface HarnessControlPlanePort {
  readConfigRevision(revisionId: string, agentId: HarnessAgentId): Promise<HarnessConfigRevisionRef | HarnessUnknown>;
  readAssemblyManifest(revisionId: string, agentId: HarnessAgentId): Promise<HarnessAssemblyManifestRef | HarnessUnknown>;
  probeAgent(agentId: HarnessProbeAgentId): Promise<HarnessAgentCapability | HarnessUnknown>;
  prepareLaunch(revisionId: string, agentId: HarnessAgentId): Promise<HarnessLaunchPlanRef | HarnessUnknown>;
}

export interface ExistingPublicApplicationPorts {
  readonly readRevision: HarnessControlPlanePort['readConfigRevision'];
  readonly readManifest: HarnessControlPlanePort['readAssemblyManifest'];
  readonly probe: HarnessControlPlanePort['probeAgent'];
  readonly planLaunch: HarnessControlPlanePort['prepareLaunch'];
}

export interface HarnessControlPlanePortFactory {
  createHarnessControlPlaneFacade(): HarnessControlPlanePort;
}
