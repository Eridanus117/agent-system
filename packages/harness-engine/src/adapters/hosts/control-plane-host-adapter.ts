import type { AgentCapability, AgentId, AssemblyManifestRef, ConfigRevisionRef, ControlPlaneFacade, ControlPlaneUnknown, LaunchPlanRef } from '../../application/control-plane-port.ts';
import type { CapabilityResult, HostAdapter, HostAssignment, HostContext, HostObservation, HostOperation } from '../../ports/host.ts';

function unknown(host: HostContext, reasonCode: string): CapabilityResult {
  return { status: 'unknown', hostId: host.hostId, hostVersion: host.hostVersion, reasonCode };
}

function isUnknown(value: unknown): value is ControlPlaneUnknown {
  return typeof value === 'object' && value !== null && (value as Record<string, unknown>).kind === 'unknown';
}

function factsConsistent(capability: AgentCapability, revision: ConfigRevisionRef, manifest: AssemblyManifestRef, launch: LaunchPlanRef): boolean {
  const facts = [capability, revision, manifest, launch];
  return facts.every((fact) => fact.source === capability.source
    && fact.sourceVersion === capability.sourceVersion
    && fact.observedAt === capability.observedAt)
    && revision.revisionId === manifest.revisionId
    && manifest.revisionId === launch.revisionId;
}

function supported(host: HostContext, capability: AgentCapability, revision: ConfigRevisionRef, manifest: AssemblyManifestRef, launch: LaunchPlanRef): CapabilityResult {
  if (capability.status === 'unsupported') {
    return { status: 'unsupported', hostId: host.hostId, hostVersion: host.hostVersion, reasonCode: capability.reasonCode ?? 'control-plane.capability.unsupported' };
  }
  if (capability.status === 'unknown') {
    return { status: 'unknown', hostId: host.hostId, hostVersion: host.hostVersion, reasonCode: capability.reasonCode ?? 'control-plane.capability.unknown' };
  }
  if (capability.status === 'degraded') {
    return { status: 'degraded', hostId: host.hostId, hostVersion: host.hostVersion, reasonCode: capability.reasonCode ?? 'control-plane.capability.degraded' };
  }
  if (capability.agentVersion !== host.hostVersion
    || !factsConsistent(capability, revision, manifest, launch)
    || revision.agentId !== host.hostId || manifest.agentId !== host.hostId || launch.agentId !== host.hostId
    || revision.revisionId !== manifest.revisionId || launch.revisionId !== revision.revisionId) {
    return { status: 'degraded', hostId: host.hostId, hostVersion: host.hostVersion, reasonCode: 'control-plane.capability.version-or-identity-mismatch' };
  }
  return {
    status: 'supported',
    hostId: host.hostId,
    hostVersion: host.hostVersion,
    evidence: {
      source: 'control-plane.harness-facade',
      observedAt: launch.observedAt,
      locator: `${revision.revisionId}:${manifest.manifestDigest}:${launch.planDigest}`,
      hostId: host.hostId,
      hostVersion: host.hostVersion,
    },
  };
}

export class ControlPlaneHostAdapter implements HostAdapter {
  public constructor(private readonly facade: ControlPlaneFacade, private readonly revisionId: string, private readonly agentId: AgentId) {}

  public async probe(host: HostContext): Promise<CapabilityResult> {
    if (host.hostId !== this.agentId) return unknown(host, 'host.client.identity-mismatch');
    const [capability, revision, manifest, launch] = await Promise.all([
      this.facade.probeAgent(this.agentId),
      this.facade.readConfigRevision(this.revisionId, this.agentId),
      this.facade.readAssemblyManifest(this.revisionId, this.agentId),
      this.facade.prepareLaunch(this.revisionId, this.agentId),
    ]);
    if (isUnknown(capability)) return unknown(host, capability.reasonCode);
    if (isUnknown(revision)) return unknown(host, revision.reasonCode);
    if (isUnknown(manifest)) return unknown(host, manifest.reasonCode);
    if (isUnknown(launch)) return unknown(host, launch.reasonCode);
    return supported(host, capability, revision, manifest, launch);
  }

  public async prepare(assignment: HostAssignment): Promise<CapabilityResult> {
    return this.probe(assignment);
  }

  public async observe(operation: HostOperation): Promise<CapabilityResult> {
    return this.probe(operation);
  }

  public async interpret(observation: HostObservation): Promise<CapabilityResult> {
    return observation.status === 'supported'
      ? this.probe(observation)
      : unknown(observation, `host.observation.${observation.status}`);
  }
}
