// Ingest 的 application ports：定义 provider、注册存储与编排入口的边界。
// 通用层只依赖这些接口，不感知任何具体平台（GitHub、Gitea、本地文件、Web、媒体等）。

import type {
  CapabilityFact,
  ImportPlan,
  ImportRequest,
  ImportRunResult,
  IngestCapabilityId,
  ObservedFact,
  PlatformFact,
  PrepareImportResult,
  ReadinessFact,
  RegisterSourceResult,
  ServiceFact,
  SourceIngestView,
  SourceInput,
  SourceRegistration,
} from '../../domain/ingest';

/**
 * provider 边界：每个 provider 负责一类来源的平台/服务解析、能力发现与 readiness 评估。
 * executeImport 可选——没有实现时，通用层必须返回结构化 unknown，不得伪造导入成功。
 */
export interface IngestProviderPort {
  readonly providerId: string;
  /** 声明是否认识该来源；不认识时通用层记录 unrecognized-source，不做猜测。 */
  accepts(input: SourceInput): boolean;
  resolvePlatform(input: SourceInput): Promise<ObservedFact<PlatformFact>>;
  resolveService(input: SourceInput, platform: PlatformFact): Promise<ObservedFact<ServiceFact>>;
  discoverCapabilities(service: ServiceFact): Promise<readonly CapabilityFact[]>;
  evaluateReadiness(service: ServiceFact, capabilityIds: readonly IngestCapabilityId[]): Promise<readonly ReadinessFact[]>;
  executeImport?(plan: ImportPlan): Promise<ImportRunResult>;
}

/** 注册事实的存储边界；当前阶段只要求 in-memory 实现，不触碰 SQLite 持久模型。 */
export interface SourceRegistrationStore {
  save(registration: SourceRegistration): Promise<void>;
  get(sourceId: string): Promise<SourceRegistration | null>;
  list(): Promise<readonly SourceRegistration[]>;
}

/** 编排入口：registered、planned/ready、imported 是三个互不推导的独立结果。 */
export interface IngestOrchestratorPort {
  registerSource(input: SourceInput): Promise<RegisterSourceResult>;
  prepareImport(request: ImportRequest): Promise<PrepareImportResult>;
  runImport(plan: ImportPlan): Promise<ImportRunResult>;
  view(sourceId: string): Promise<SourceIngestView | null>;
}

export type {
  CapabilityFact,
  ImportPlan,
  ImportRequest,
  ImportRunResult,
  IngestCapabilityId,
  ObservedFact,
  PlatformFact,
  PrepareImportResult,
  ReadinessFact,
  RegisterSourceResult,
  ServiceFact,
  SourceIngestView,
  SourceInput,
  SourceRegistration,
};
