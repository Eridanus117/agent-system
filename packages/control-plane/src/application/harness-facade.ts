import type { ExistingPublicApplicationPorts, HarnessAssemblyManifestRef, HarnessAgentCapability, HarnessConfigRevisionRef, HarnessControlPlanePort, HarnessLaunchPlanRef, HarnessUnknown } from './ports/harness';

function unknownResult(reasonCode: string): HarnessUnknown {
  return { kind: 'unknown', reasonCode, observedAt: new Date().toISOString(), recovery: 're-read the public control-plane facade inputs' };
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validUnknown(value: unknown): value is HarnessUnknown { return record(value) && value.kind === 'unknown' && typeof value.reasonCode === 'string' && typeof value.observedAt === 'string' && typeof value.recovery === 'string'; }
function validRevision(value: unknown): value is HarnessConfigRevisionRef { return record(value) && typeof value.revisionId === 'string' && typeof value.schemaVersion === 'number' && (value.agentId === 'omp' || value.agentId === 'claude') && typeof value.source === 'string' && typeof value.sourceVersion === 'string' && typeof value.observedAt === 'string'; }
function validManifest(value: unknown): value is HarnessAssemblyManifestRef { return record(value) && typeof value.revisionId === 'string' && (value.agentId === 'omp' || value.agentId === 'claude') && typeof value.manifestDigest === 'string' && typeof value.itemCount === 'number' && typeof value.source === 'string' && typeof value.sourceVersion === 'string' && typeof value.observedAt === 'string'; }
function validCapability(value: unknown): value is HarnessAgentCapability { return record(value) && typeof value.agentId === 'string' && typeof value.agentVersion === 'string' && ['supported', 'degraded', 'unsupported', 'unknown'].includes(String(value.status)) && typeof value.source === 'string' && typeof value.sourceVersion === 'string' && typeof value.observedAt === 'string'; }
function validPlan(value: unknown): value is HarnessLaunchPlanRef { return record(value) && typeof value.revisionId === 'string' && (value.agentId === 'omp' || value.agentId === 'claude') && typeof value.planDigest === 'string' && value.launchBoundary === 'invocation-scoped' && typeof value.source === 'string' && typeof value.sourceVersion === 'string' && typeof value.observedAt === 'string'; }
function projectUnknown(value: HarnessUnknown): HarnessUnknown { return { kind: value.kind, reasonCode: value.reasonCode, observedAt: value.observedAt, recovery: value.recovery }; }
function projectRevision(value: HarnessConfigRevisionRef): HarnessConfigRevisionRef { return { revisionId: value.revisionId, schemaVersion: value.schemaVersion, agentId: value.agentId, source: value.source, sourceVersion: value.sourceVersion, observedAt: value.observedAt }; }
function projectManifest(value: HarnessAssemblyManifestRef): HarnessAssemblyManifestRef { return { revisionId: value.revisionId, agentId: value.agentId, manifestDigest: value.manifestDigest, itemCount: value.itemCount, source: value.source, sourceVersion: value.sourceVersion, observedAt: value.observedAt }; }
function projectCapability(value: HarnessAgentCapability): HarnessAgentCapability { return { agentId: value.agentId, agentVersion: value.agentVersion, status: value.status, source: value.source, sourceVersion: value.sourceVersion, observedAt: value.observedAt, reasonCode: value.reasonCode }; }
function projectPlan(value: HarnessLaunchPlanRef): HarnessLaunchPlanRef { return { revisionId: value.revisionId, agentId: value.agentId, planDigest: value.planDigest, launchBoundary: value.launchBoundary, source: value.source, sourceVersion: value.sourceVersion, observedAt: value.observedAt }; }

export function createHarnessControlPlaneFacade(ports: ExistingPublicApplicationPorts): HarnessControlPlanePort {
  return {
    async readConfigRevision(revisionId, agentId) {
      try { const value = await ports.readRevision(revisionId, agentId); return validUnknown(value) ? projectUnknown(value) : validRevision(value) ? projectRevision(value) : unknownResult('control-plane.revision.shape-invalid'); } catch { return unknownResult('control-plane.revision.unavailable'); }
    },
    async readAssemblyManifest(revisionId, agentId) {
      try { const value = await ports.readManifest(revisionId, agentId); return validUnknown(value) ? projectUnknown(value) : validManifest(value) ? projectManifest(value) : unknownResult('control-plane.manifest.shape-invalid'); } catch { return unknownResult('control-plane.manifest.unavailable'); }
    },
    async probeAgent(agentId) {
      try { const value = await ports.probe(agentId); return validUnknown(value) ? projectUnknown(value) : validCapability(value) ? projectCapability(value) : unknownResult('control-plane.capability.shape-invalid'); } catch { return unknownResult('control-plane.capability.unavailable'); }
    },
    async prepareLaunch(revisionId, agentId) {
      try { const value = await ports.planLaunch(revisionId, agentId); return validUnknown(value) ? projectUnknown(value) : validPlan(value) ? projectPlan(value) : unknownResult('control-plane.launch.shape-invalid'); } catch { return unknownResult('control-plane.launch.unavailable'); }
    },
  };
}
