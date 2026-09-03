// 控制面合同的真源是 @agent-system/control-plane 的 ports/harness.ts（经 public-entry 发布）。
// 本文件只做类型别名，不再手抄一份接口：此前的手抄副本在控制面把 client 改名为 agent
// （提交 6556d8c）后没有跟上，导致 host-smoke 无法通过类型检查。
import type {
  HarnessAgentCapability,
  HarnessAgentId,
  HarnessAssemblyManifestRef,
  HarnessConfigRevisionRef,
  HarnessControlPlanePort,
  HarnessLaunchPlanRef,
  HarnessProbeAgentId,
  HarnessUnknown,
} from '@agent-system/control-plane/application/public-entry';

export type ControlPlaneUnknown = HarnessUnknown;
export type ConfigRevisionRef = HarnessConfigRevisionRef;
export type AssemblyManifestRef = HarnessAssemblyManifestRef;
export type AgentCapability = HarnessAgentCapability;
export type LaunchPlanRef = HarnessLaunchPlanRef;
export type AgentId = HarnessAgentId;
export type ProbeAgentId = HarnessProbeAgentId;
export type ControlPlaneFacade = HarnessControlPlanePort;
