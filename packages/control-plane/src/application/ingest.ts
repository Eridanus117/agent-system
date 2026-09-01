// Ingest 编排：registerSource / prepareImport / runImport 的通用实现。
// 原则：注册不推导 ready，ready 不推导 imported；prepareImport 与 runImport 都不信任
// 旧快照，一律向 provider 重新校验；没有具体 provider 时只返回结构化 blocked/unknown。

import { randomUUID } from 'node:crypto';
import {
  deriveSourceIngestView,
  isReadinessFresh,
  validateCapabilityFact,
  validateImportPlan,
  validateImportedArtifactRef,
  validateReadinessFact,
  validateSourceRegistration,
  type CapabilityFact,
  type ImportPlan,
  type ImportRequest,
  type ImportRunResult,
  type IngestUnknownReason,
  type ObservedFact,
  type PlatformFact,
  type PrepareImportResult,
  type ReadinessFact,
  type RegisterSourceResult,
  type ServiceFact,
  type SourceIngestView,
  type SourceInput,
  type SourceRegistration,
} from '../domain/ingest';
import type { IngestOrchestratorPort, IngestProviderPort, SourceRegistrationStore } from './ports/ingest';

const ORCHESTRATOR_EVIDENCE = 'control-plane:application/ingest';

/** 递归冻结计划与注册对象，保证「不可变 ImportPlan」不是口头承诺。 */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

/** in-memory 注册存储：当前阶段唯一授权的持久形态，不触碰 SQLite。 */
export class InMemorySourceRegistrationStore implements SourceRegistrationStore {
  private readonly registrations = new Map<string, SourceRegistration>();

  async save(registration: SourceRegistration): Promise<void> {
    validateSourceRegistration(registration);
    this.registrations.set(registration.sourceId, deepFreeze(registration));
  }

  async get(sourceId: string): Promise<SourceRegistration | null> {
    return this.registrations.get(sourceId) ?? null;
  }

  async list(): Promise<readonly SourceRegistration[]> {
    return [...this.registrations.values()];
  }
}

interface ResolvedFacts {
  readonly platform: ObservedFact<PlatformFact>;
  readonly service: ObservedFact<ServiceFact>;
  readonly capabilities: readonly CapabilityFact[];
  readonly readiness: readonly ReadinessFact[];
}

export interface IngestOrchestratorOptions {
  readonly providers: readonly IngestProviderPort[];
  readonly store?: SourceRegistrationStore;
  /** 可注入时钟，便于测试过期与状态变化场景。 */
  readonly now?: () => string;
}

export class IngestOrchestrator implements IngestOrchestratorPort {
  private readonly providers: readonly IngestProviderPort[];
  private readonly store: SourceRegistrationStore;
  private readonly now: () => string;
  /** 每个来源最近一次导入运行结果；只存结构化结果，不存原文。 */
  private readonly lastRuns = new Map<string, ImportRunResult>();

  constructor(options: IngestOrchestratorOptions) {
    this.providers = options.providers;
    this.store = options.store ?? new InMemorySourceRegistrationStore();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async registerSource(input: SourceInput): Promise<RegisterSourceResult> {
    if (typeof input !== 'object' || input === null || typeof input.locator !== 'string' || input.locator.trim().length === 0) {
      return { status: 'invalid', reason: 'invalid-input', message: 'source input locator must not be empty' };
    }
    const locator = input.locator.trim();
    const sourceId = `src:${locator}`;
    const provider = this.providers.find((candidate) => candidate.accepts(input)) ?? null;
    const facts = await this.resolveFacts(provider, { ...input, locator });
    const registration: SourceRegistration = deepFreeze({
      sourceId,
      locator,
      status: 'registered',
      registeredAt: this.now(),
      platform: facts.platform,
      service: facts.service,
      capabilities: facts.capabilities,
      readiness: facts.readiness,
      evidenceRef: ORCHESTRATOR_EVIDENCE,
    });
    await this.store.save(registration);
    return { status: 'registered', registration };
  }

  async prepareImport(request: ImportRequest): Promise<PrepareImportResult> {
    const checkedAt = this.now();
    const unknown = (reason: IngestUnknownReason): PrepareImportResult =>
      ({ status: 'unknown', sourceId: request.sourceId, capabilityId: request.capabilityId, reason, checkedAt });

    const registration = await this.store.get(request.sourceId);
    if (registration === null) return unknown('source-unregistered');
    const input: SourceInput = { locator: registration.locator };
    const provider = this.providers.find((candidate) => candidate.accepts(input)) ?? null;
    if (provider === null) return unknown('provider-unavailable');

    // 不复用注册时的快照：针对本次导入重新解析 platform/service/capability/readiness。
    const facts = await this.resolveFacts(provider, input);
    await this.store.save({ ...registration, platform: facts.platform, service: facts.service, capabilities: facts.capabilities, readiness: facts.readiness });
    if (facts.platform.kind === 'unknown') return unknown(facts.platform.reason);
    if (facts.service.kind === 'unknown') return unknown(facts.service.reason);

    const capability = facts.capabilities.find((fact) => fact.capabilityId === request.capabilityId) ?? null;
    if (capability === null) return unknown('capability-not-declared');
    if (capability.status === 'unknown') return unknown('capability-not-declared');
    const readiness = facts.readiness.find((fact) => fact.capabilityId === request.capabilityId) ?? null;
    if (capability.status === 'unsupported') {
      return { status: 'blocked', sourceId: request.sourceId, capabilityId: request.capabilityId, reason: 'capability-unsupported', readiness: readiness === null ? [] : [readiness], checkedAt };
    }
    if (readiness === null) return unknown('readiness-missing');
    if (!isReadinessFresh(readiness, checkedAt)) return unknown('readiness-expired');
    if (readiness.status === 'unknown') return unknown('readiness-unknown');
    if (readiness.status === 'blocked' || readiness.status === 'unavailable') {
      return { status: 'blocked', sourceId: request.sourceId, capabilityId: request.capabilityId, reason: readiness.reason, readiness: [readiness], checkedAt };
    }

    const plan: ImportPlan = deepFreeze({
      planId: randomUUID(),
      sourceId: request.sourceId,
      capabilityId: request.capabilityId,
      platform: facts.platform.fact,
      service: facts.service.fact,
      capability,
      readiness,
      createdAt: checkedAt,
      evidenceRef: ORCHESTRATOR_EVIDENCE,
    });
    validateImportPlan(plan);
    return { status: 'planned', plan };
  }

  async runImport(plan: ImportPlan): Promise<ImportRunResult> {
    const checkedAt = this.now();
    const unknown = (reason: IngestUnknownReason): ImportRunResult =>
      ({ status: 'unknown', planId: typeof plan?.planId === 'string' ? plan.planId : 'invalid-plan', reason, checkedAt, evidenceRef: ORCHESTRATOR_EVIDENCE });

    try {
      validateImportPlan(plan);
    } catch {
      return unknown('invalid-input');
    }
    const registration = await this.store.get(plan.sourceId);
    if (registration === null) return this.recordRun(plan.sourceId, unknown('source-unregistered'));
    const provider = this.providers.find((candidate) => candidate.accepts({ locator: registration.locator })) ?? null;
    if (provider === null) return this.recordRun(plan.sourceId, unknown('provider-unavailable'));

    // 计划里的 readiness 只是历史快照；执行前重新评估，状态变化即拒绝执行。
    let current: ReadinessFact | null = null;
    try {
      const facts = await provider.evaluateReadiness(plan.service, [plan.capabilityId]);
      for (const fact of facts) validateReadinessFact(fact);
      current = facts.find((fact) => fact.capabilityId === plan.capabilityId) ?? null;
    } catch {
      return this.recordRun(plan.sourceId, unknown('provider-failed'));
    }
    if (current === null) return this.recordRun(plan.sourceId, unknown('readiness-missing'));
    if (current.status === 'unknown') return this.recordRun(plan.sourceId, unknown('readiness-unknown'));
    if (current.status === 'blocked' || current.status === 'unavailable') {
      const reason = current.status === plan.readiness.status ? current.reason : 'readiness-changed';
      return this.recordRun(plan.sourceId, { status: 'blocked', planId: plan.planId, reason, blockingFacts: [current], checkedAt, evidenceRef: ORCHESTRATOR_EVIDENCE });
    }
    if (!isReadinessFresh(current, checkedAt)) return this.recordRun(plan.sourceId, unknown('readiness-expired'));

    // 没有具体 provider 实现导入动作时，唯一诚实的结果是结构化 unknown。
    if (provider.executeImport === undefined) return this.recordRun(plan.sourceId, unknown('import-not-implemented'));
    let result: ImportRunResult;
    try {
      result = await provider.executeImport(plan);
    } catch {
      return this.recordRun(plan.sourceId, unknown('provider-failed'));
    }
    if (result.status === 'imported') {
      // 校验 provider 交回的产物只是引用；引用非法视为无法证明导入发生。
      try {
        for (const artifact of result.artifacts) validateImportedArtifactRef(artifact);
      } catch {
        return this.recordRun(plan.sourceId, unknown('provider-failed'));
      }
    }
    return this.recordRun(plan.sourceId, result);
  }

  async view(sourceId: string): Promise<SourceIngestView | null> {
    const registration = await this.store.get(sourceId);
    if (registration === null) return null;
    return deriveSourceIngestView(registration, this.lastRuns.get(sourceId) ?? null, this.now());
  }

  private recordRun(sourceId: string, result: ImportRunResult): ImportRunResult {
    this.lastRuns.set(sourceId, result);
    return result;
  }

  /** 逐步解析四类事实；provider 抛错时降级为 unknown 事实，绝不让异常冒充观测。 */
  private async resolveFacts(provider: IngestProviderPort | null, input: SourceInput): Promise<ResolvedFacts> {
    const observedAt = this.now();
    const unknownFact = (reason: IngestUnknownReason): ObservedFact<never> =>
      ({ kind: 'unknown', reason, observedAt, evidenceRef: ORCHESTRATOR_EVIDENCE });
    if (provider === null) {
      return { platform: unknownFact('unrecognized-source'), service: unknownFact('unrecognized-source'), capabilities: [], readiness: [] };
    }

    let platform: ObservedFact<PlatformFact>;
    try {
      platform = await provider.resolvePlatform(input);
    } catch {
      platform = unknownFact('provider-failed');
    }
    if (platform.kind === 'unknown') return { platform, service: unknownFact(platform.reason), capabilities: [], readiness: [] };

    let service: ObservedFact<ServiceFact>;
    try {
      service = await provider.resolveService(input, platform.fact);
    } catch {
      service = unknownFact('provider-failed');
    }
    if (service.kind === 'unknown') return { platform, service, capabilities: [], readiness: [] };

    let capabilities: readonly CapabilityFact[];
    try {
      capabilities = await provider.discoverCapabilities(service.fact);
      for (const fact of capabilities) validateCapabilityFact(fact);
    } catch {
      return { platform, service, capabilities: [], readiness: [] };
    }

    let readiness: readonly ReadinessFact[];
    try {
      readiness = await provider.evaluateReadiness(service.fact, capabilities.map((fact) => fact.capabilityId));
      for (const fact of readiness) validateReadinessFact(fact);
    } catch {
      readiness = [];
    }
    return { platform, service, capabilities, readiness };
  }
}
