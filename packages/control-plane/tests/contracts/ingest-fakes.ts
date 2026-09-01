// Ingest 契约测试用的 fake provider 与事实构造器。
// fake 的所有行为都是显式配置的可变状态，便于模拟“注册后状态变化”“过期”“超时”等矩阵场景。

import type { IngestProviderPort } from '../../src/application/ports/ingest';
import type {
  CapabilityFact,
  ImportPlan,
  ImportRunResult,
  IngestCapabilityId,
  ObservedFact,
  PlatformFact,
  ReadinessFact,
  ServiceFact,
  SourceInput,
} from '../../src/domain/ingest';

export const T0 = '2026-09-01T00:00:00.000Z';

/** 递增测试时钟：每次调用前进 1 秒，保证 checkedAt/observedAt 单调且可断言。 */
export function testClock(startIso: string = T0): () => string {
  let tick = 0;
  return () => new Date(Date.parse(startIso) + tick++ * 1000).toISOString();
}

export function platformFact(overrides: Partial<PlatformFact> = {}): PlatformFact {
  return { platformId: 'fake-platform', displayName: 'Fake Platform', observedAt: T0, evidenceRef: 'tests/contracts/ingest-fakes.ts#platform', ...overrides };
}

export function serviceFact(overrides: Partial<ServiceFact> = {}): ServiceFact {
  return { serviceId: 'fake-service', platformId: 'fake-platform', protocol: 'fake-protocol', observedAt: T0, evidenceRef: 'tests/contracts/ingest-fakes.ts#service', ...overrides };
}

export function capabilityFact(capabilityId: IngestCapabilityId, overrides: Partial<CapabilityFact> = {}): CapabilityFact {
  return { capabilityId, serviceId: 'fake-service', status: 'supported', inputKinds: ['locator'], outputKinds: ['artifact-ref'], observedAt: T0, evidenceRef: 'tests/contracts/ingest-fakes.ts#capability', ...overrides };
}

export function readinessFact(capabilityId: IngestCapabilityId, overrides: Partial<ReadinessFact> = {}): ReadinessFact {
  return { capabilityId, status: 'ready', reason: 'preconditions-satisfied', checkedAt: T0, evidenceRef: 'tests/contracts/ingest-fakes.ts#readiness', ...overrides };
}

/** 'throw' 表示该步骤抛异常（模拟 provider 崩溃或超时），由编排层降级为 unknown。 */
type Faulty<T> = T | 'throw';

export interface FakeProviderState {
  acceptsPrefix: string;
  platform: Faulty<ObservedFact<PlatformFact>>;
  service: Faulty<ObservedFact<ServiceFact>>;
  capabilities: Faulty<readonly CapabilityFact[]>;
  readiness: Faulty<readonly ReadinessFact[]>;
  importResult: Faulty<ImportRunResult> | null;
  withExecuteImport: boolean;
}

export class FakeIngestProvider implements IngestProviderPort {
  readonly providerId = 'fake-provider';
  readonly state: FakeProviderState;
  readonly calls = { resolvePlatform: 0, resolveService: 0, discoverCapabilities: 0, evaluateReadiness: 0, executeImport: 0 };

  constructor(state: Partial<FakeProviderState> = {}) {
    this.state = {
      acceptsPrefix: 'fake:',
      platform: { kind: 'known', fact: platformFact() },
      service: { kind: 'known', fact: serviceFact() },
      capabilities: [capabilityFact('source.fetch'), capabilityFact('content.parse')],
      readiness: [readinessFact('source.fetch'), readinessFact('content.parse')],
      importResult: null,
      withExecuteImport: false,
      ...state,
    };
    // 未显式配置 executeImport 行为时保持“无具体导入实现”的默认形态。
    if (this.state.importResult !== null) this.state.withExecuteImport = true;
    if (!this.state.withExecuteImport) this.executeImport = undefined;
  }

  accepts(input: SourceInput): boolean {
    return input.locator.startsWith(this.state.acceptsPrefix);
  }

  async resolvePlatform(_input: SourceInput): Promise<ObservedFact<PlatformFact>> {
    this.calls.resolvePlatform += 1;
    if (this.state.platform === 'throw') throw new Error('fake platform failure');
    return this.state.platform;
  }

  async resolveService(_input: SourceInput, _platform: PlatformFact): Promise<ObservedFact<ServiceFact>> {
    this.calls.resolveService += 1;
    if (this.state.service === 'throw') throw new Error('fake service failure');
    return this.state.service;
  }

  async discoverCapabilities(_service: ServiceFact): Promise<readonly CapabilityFact[]> {
    this.calls.discoverCapabilities += 1;
    if (this.state.capabilities === 'throw') throw new Error('fake capability failure');
    return this.state.capabilities;
  }

  async evaluateReadiness(_service: ServiceFact, capabilityIds: readonly IngestCapabilityId[]): Promise<readonly ReadinessFact[]> {
    this.calls.evaluateReadiness += 1;
    if (this.state.readiness === 'throw') throw new Error('fake readiness failure');
    return this.state.readiness.filter((fact) => capabilityIds.includes(fact.capabilityId));
  }

  executeImport?: (plan: ImportPlan) => Promise<ImportRunResult> = async (plan) => {
    this.calls.executeImport += 1;
    if (this.state.importResult === 'throw') throw new Error('fake import failure');
    if (this.state.importResult === null) throw new Error('fake import result not configured');
    // 让返回结果与传入计划对齐，模拟真实 provider 按计划交付。
    return { ...this.state.importResult, planId: plan.planId };
  };
}
