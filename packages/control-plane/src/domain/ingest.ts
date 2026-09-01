// Ingest 通用骨架的领域契约：把「来源属于什么平台」「通过什么服务访问」「服务能做什么」
// 「现在是否具备执行条件」建模为四类相互独立的事实（fact），并定义注册、导入计划与导入
// 运行的结果契约。本文件只含纯类型、校验和派生函数，不做任何 I/O。

/** readiness（准备情况）状态：描述“现在是否具备执行某能力的前置条件”。 */
export type ReadinessStatus = 'ready' | 'degraded' | 'blocked' | 'unavailable' | 'unknown';

/** capability（能力）支持级别：描述“该服务能不能做这件事”，与 readiness 分离。 */
export type IngestCapabilityStatus = 'supported' | 'degraded' | 'unsupported' | 'unknown';

/** Ingest 通用层承认的原子能力全集；provider 不得自造超出此集合的能力 id。 */
export type IngestCapabilityId =
  | 'source.register'
  | 'source.inspect'
  | 'source.list'
  | 'source.fetch'
  | 'content.parse'
  | 'content.transcribe'
  | 'content.persist';

export const INGEST_CAPABILITY_IDS: readonly IngestCapabilityId[] = [
  'source.register', 'source.inspect', 'source.list', 'source.fetch',
  'content.parse', 'content.transcribe', 'content.persist',
];

export const READINESS_STATUSES: readonly ReadinessStatus[] = ['ready', 'degraded', 'blocked', 'unavailable', 'unknown'];
export const INGEST_CAPABILITY_STATUSES: readonly IngestCapabilityStatus[] = ['supported', 'degraded', 'unsupported', 'unknown'];

/** 事实一：来源属于哪个平台或生态。 */
export interface PlatformFact {
  readonly platformId: string;
  readonly displayName: string;
  readonly observedAt: string;
  readonly evidenceRef: string;
}

/** 事实二：通过哪个具体服务、协议或本地 provider 访问该平台。 */
export interface ServiceFact {
  readonly serviceId: string;
  readonly platformId: string;
  readonly protocol: string;
  readonly observedAt: string;
  readonly evidenceRef: string;
}

/** 事实三：该服务可以执行哪些原子动作。 */
export interface CapabilityFact {
  readonly capabilityId: IngestCapabilityId;
  readonly serviceId: string;
  readonly status: IngestCapabilityStatus;
  readonly inputKinds: readonly string[];
  readonly outputKinds: readonly string[];
  readonly observedAt: string;
  readonly evidenceRef: string;
}

/** 事实四：当前是否满足执行某个动作的前置条件。 */
export interface ReadinessFact {
  readonly capabilityId: IngestCapabilityId;
  readonly status: ReadinessStatus;
  readonly reason: string;
  readonly checkedAt: string;
  readonly expiresAt?: string;
  readonly evidenceRef: string;
}

/** 无法证明的事实必须显式标注 unknown 及受控原因码，不允许用猜测值冒充观测。 */
export type IngestUnknownReason =
  | 'unrecognized-source'
  | 'provider-unavailable'
  | 'provider-failed'
  | 'provider-timeout'
  | 'capability-not-declared'
  | 'readiness-missing'
  | 'readiness-expired'
  | 'readiness-changed'
  | 'readiness-unknown'
  | 'import-not-implemented'
  | 'source-unregistered'
  | 'invalid-input';

export const INGEST_UNKNOWN_REASONS: readonly IngestUnknownReason[] = [
  'unrecognized-source', 'provider-unavailable', 'provider-failed', 'provider-timeout',
  'capability-not-declared', 'readiness-missing', 'readiness-expired', 'readiness-changed',
  'readiness-unknown', 'import-not-implemented', 'source-unregistered', 'invalid-input',
];

/** 单个事实的观测结果：要么给出事实本身，要么诚实标注 unknown。 */
export type ObservedFact<T> =
  | { readonly kind: 'known'; readonly fact: T }
  | { readonly kind: 'unknown'; readonly reason: IngestUnknownReason; readonly observedAt: string; readonly evidenceRef: string };

/** 来源注册输入：locator 是受控标识（URL、路径、句柄等），不得携带 secret。 */
export interface SourceInput {
  readonly locator: string;
  readonly declaredKind?: string;
}

/**
 * 来源注册事实。status 恒为 'registered'：注册成功只说明“系统认识了这个来源”，
 * 不推导 ready，更不推导 imported；后两者分别由 ReadinessFact 与 ImportRunResult 表达。
 */
export interface SourceRegistration {
  readonly sourceId: string;
  readonly locator: string;
  readonly status: 'registered';
  readonly registeredAt: string;
  readonly platform: ObservedFact<PlatformFact>;
  readonly service: ObservedFact<ServiceFact>;
  readonly capabilities: readonly CapabilityFact[];
  readonly readiness: readonly ReadinessFact[];
  readonly evidenceRef: string;
}

export type RegisterSourceResult =
  | { readonly status: 'registered'; readonly registration: SourceRegistration }
  | { readonly status: 'invalid'; readonly reason: IngestUnknownReason; readonly message: string };

export interface ImportRequest {
  readonly sourceId: string;
  readonly capabilityId: IngestCapabilityId;
}

/** 不可变导入计划：只携带本次导入所需的四类事实的最新校验快照。 */
export interface ImportPlan {
  readonly planId: string;
  readonly sourceId: string;
  readonly capabilityId: IngestCapabilityId;
  readonly platform: PlatformFact;
  readonly service: ServiceFact;
  readonly capability: CapabilityFact;
  readonly readiness: ReadinessFact;
  readonly createdAt: string;
  readonly evidenceRef: string;
}

export type PrepareImportResult =
  | { readonly status: 'planned'; readonly plan: ImportPlan }
  | { readonly status: 'blocked'; readonly sourceId: string; readonly capabilityId: IngestCapabilityId; readonly reason: string; readonly readiness: readonly ReadinessFact[]; readonly checkedAt: string }
  | { readonly status: 'unknown'; readonly sourceId: string; readonly capabilityId: IngestCapabilityId; readonly reason: IngestUnknownReason; readonly checkedAt: string };

/** 导入产物引用：只存引用与指纹，不存原文、secret、prompt 或原始外部响应。 */
export interface ImportedArtifactRef {
  readonly artifactId: string;
  readonly sourceId: string;
  readonly capabilityId: IngestCapabilityId;
  readonly contentFingerprint: string | null;
  readonly evidenceRef: string;
}

export type ImportRunResult =
  | { readonly status: 'imported'; readonly planId: string; readonly artifacts: readonly ImportedArtifactRef[]; readonly completedAt: string; readonly evidenceRef: string }
  | { readonly status: 'blocked'; readonly planId: string; readonly reason: string; readonly blockingFacts: readonly ReadinessFact[]; readonly checkedAt: string; readonly evidenceRef: string }
  | { readonly status: 'unknown'; readonly planId: string; readonly reason: IngestUnknownReason; readonly checkedAt: string; readonly evidenceRef: string };

/**
 * 派生汇总视图（projection）：由四类事实与最近一次导入结果推导，本身不是事实来源，
 * 也不持久化任何 raw 内容。registered / ready / imported 用三个独立字段表达，禁止合并。
 */
export interface SourceIngestView {
  readonly sourceId: string;
  readonly platformId: string;
  readonly serviceId: string;
  readonly registrationStatus: 'registered';
  readonly capabilityStatuses: Readonly<Partial<Record<IngestCapabilityId, IngestCapabilityStatus>>>;
  readonly readinessStatuses: Readonly<Partial<Record<IngestCapabilityId, ReadinessStatus>>>;
  readonly overallReadiness: ReadinessStatus;
  readonly lastImport: { readonly status: 'imported' | 'blocked' | 'unknown'; readonly at: string } | null;
  readonly derivedAt: string;
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

function requireNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

function requireTimestamp(value: unknown, label: string): asserts value is string {
  requireNonEmptyText(value, label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a parseable timestamp`);
}

const SECRET_LIKE_PATTERN = /(token|secret|password|authorization|cookie|api[-_]?key)\s*[=:]/i;

/** evidenceRef 是受控引用：拒绝换行、超长与形似凭据的内容，防止 secret 借证据字段泄漏。 */
export function requireEvidenceRef(value: unknown, label: string): asserts value is string {
  requireNonEmptyText(value, label);
  if (/[\r\n]/.test(value)) throw new Error(`${label} must not contain line breaks`);
  if (value.length > 256) throw new Error(`${label} must not exceed 256 characters`);
  if (SECRET_LIKE_PATTERN.test(value)) throw new Error(`${label} must not embed secret-like content`);
}

export function isIngestCapabilityId(value: unknown): value is IngestCapabilityId {
  return typeof value === 'string' && INGEST_CAPABILITY_IDS.includes(value as IngestCapabilityId);
}

export function isReadinessStatus(value: unknown): value is ReadinessStatus {
  return typeof value === 'string' && READINESS_STATUSES.includes(value as ReadinessStatus);
}

export function isIngestUnknownReason(value: unknown): value is IngestUnknownReason {
  return typeof value === 'string' && INGEST_UNKNOWN_REASONS.includes(value as IngestUnknownReason);
}

export function validatePlatformFact(fact: PlatformFact): void {
  if (typeof fact !== 'object' || fact === null) throw new Error('platform fact must be an object');
  requireNonEmptyText(fact.platformId, 'platform fact platformId');
  requireNonEmptyText(fact.displayName, 'platform fact displayName');
  requireTimestamp(fact.observedAt, 'platform fact observedAt');
  requireEvidenceRef(fact.evidenceRef, 'platform fact evidenceRef');
}

export function validateServiceFact(fact: ServiceFact): void {
  if (typeof fact !== 'object' || fact === null) throw new Error('service fact must be an object');
  requireNonEmptyText(fact.serviceId, 'service fact serviceId');
  requireNonEmptyText(fact.platformId, 'service fact platformId');
  requireNonEmptyText(fact.protocol, 'service fact protocol');
  requireTimestamp(fact.observedAt, 'service fact observedAt');
  requireEvidenceRef(fact.evidenceRef, 'service fact evidenceRef');
}

export function validateCapabilityFact(fact: CapabilityFact): void {
  if (typeof fact !== 'object' || fact === null) throw new Error('capability fact must be an object');
  if (!isIngestCapabilityId(fact.capabilityId)) throw new Error(`invalid ingest capability id: ${String(fact.capabilityId)}`);
  requireNonEmptyText(fact.serviceId, 'capability fact serviceId');
  if (!INGEST_CAPABILITY_STATUSES.includes(fact.status)) throw new Error(`invalid capability status: ${String(fact.status)}`);
  if (!Array.isArray(fact.inputKinds) || !Array.isArray(fact.outputKinds)) throw new Error('capability fact input/output kinds must be arrays');
  for (const kind of [...fact.inputKinds, ...fact.outputKinds]) requireNonEmptyText(kind, 'capability fact kind');
  requireTimestamp(fact.observedAt, 'capability fact observedAt');
  requireEvidenceRef(fact.evidenceRef, 'capability fact evidenceRef');
}

export function validateReadinessFact(fact: ReadinessFact): void {
  if (typeof fact !== 'object' || fact === null) throw new Error('readiness fact must be an object');
  if (!isIngestCapabilityId(fact.capabilityId)) throw new Error(`invalid ingest capability id: ${String(fact.capabilityId)}`);
  if (!isReadinessStatus(fact.status)) throw new Error(`invalid readiness status: ${String(fact.status)}`);
  requireNonEmptyText(fact.reason, 'readiness fact reason');
  requireTimestamp(fact.checkedAt, 'readiness fact checkedAt');
  if (fact.expiresAt !== undefined) requireTimestamp(fact.expiresAt, 'readiness fact expiresAt');
  requireEvidenceRef(fact.evidenceRef, 'readiness fact evidenceRef');
}

function validateObservedFact<T>(observed: ObservedFact<T>, label: string, validateKnown: (fact: T) => void): void {
  if (typeof observed !== 'object' || observed === null) throw new Error(`${label} must be an object`);
  if (observed.kind === 'known') {
    validateKnown(observed.fact);
    return;
  }
  if (observed.kind === 'unknown') {
    if (!isIngestUnknownReason(observed.reason)) throw new Error(`invalid unknown reason for ${label}: ${String(observed.reason)}`);
    requireTimestamp(observed.observedAt, `${label} observedAt`);
    requireEvidenceRef(observed.evidenceRef, `${label} evidenceRef`);
    return;
  }
  throw new Error(`invalid observed fact kind for ${label}`);
}

export function validateSourceRegistration(registration: SourceRegistration): void {
  if (typeof registration !== 'object' || registration === null) throw new Error('source registration must be an object');
  requireNonEmptyText(registration.sourceId, 'source registration sourceId');
  requireNonEmptyText(registration.locator, 'source registration locator');
  if (registration.status !== 'registered') throw new Error(`invalid source registration status: ${String(registration.status)}`);
  requireTimestamp(registration.registeredAt, 'source registration registeredAt');
  requireEvidenceRef(registration.evidenceRef, 'source registration evidenceRef');
  validateObservedFact(registration.platform, 'source registration platform', validatePlatformFact);
  validateObservedFact(registration.service, 'source registration service', validateServiceFact);
  if (!Array.isArray(registration.capabilities) || !Array.isArray(registration.readiness)) throw new Error('source registration capabilities/readiness must be arrays');
  const serviceId = registration.service.kind === 'known' ? registration.service.fact.serviceId : null;
  const seen = new Set<IngestCapabilityId>();
  for (const capability of registration.capabilities) {
    validateCapabilityFact(capability);
    if (serviceId !== null && capability.serviceId !== serviceId) throw new Error('capability fact serviceId must match resolved service');
    if (seen.has(capability.capabilityId)) throw new Error(`duplicate capability fact: ${capability.capabilityId}`);
    seen.add(capability.capabilityId);
  }
  for (const readiness of registration.readiness) validateReadinessFact(readiness);
}

export function validateImportPlan(plan: ImportPlan): void {
  if (typeof plan !== 'object' || plan === null) throw new Error('import plan must be an object');
  requireNonEmptyText(plan.planId, 'import plan planId');
  requireNonEmptyText(plan.sourceId, 'import plan sourceId');
  if (!isIngestCapabilityId(plan.capabilityId)) throw new Error(`invalid ingest capability id: ${String(plan.capabilityId)}`);
  validatePlatformFact(plan.platform);
  validateServiceFact(plan.service);
  validateCapabilityFact(plan.capability);
  validateReadinessFact(plan.readiness);
  if (plan.capability.capabilityId !== plan.capabilityId) throw new Error('import plan capability fact mismatch');
  if (plan.readiness.capabilityId !== plan.capabilityId) throw new Error('import plan readiness fact mismatch');
  if (plan.capability.serviceId !== plan.service.serviceId) throw new Error('import plan capability/service mismatch');
  if (plan.service.platformId !== plan.platform.platformId) throw new Error('import plan service/platform mismatch');
  requireTimestamp(plan.createdAt, 'import plan createdAt');
  requireEvidenceRef(plan.evidenceRef, 'import plan evidenceRef');
}

export function validateImportedArtifactRef(artifact: ImportedArtifactRef): void {
  if (typeof artifact !== 'object' || artifact === null) throw new Error('imported artifact ref must be an object');
  requireNonEmptyText(artifact.artifactId, 'imported artifact artifactId');
  requireNonEmptyText(artifact.sourceId, 'imported artifact sourceId');
  if (!isIngestCapabilityId(artifact.capabilityId)) throw new Error(`invalid ingest capability id: ${String(artifact.capabilityId)}`);
  if (artifact.contentFingerprint !== null) requireEvidenceRef(artifact.contentFingerprint, 'imported artifact contentFingerprint');
  requireEvidenceRef(artifact.evidenceRef, 'imported artifact evidenceRef');
}

// ---------------------------------------------------------------------------
// 纯派生函数
// ---------------------------------------------------------------------------

/** readiness 严重度：ready < degraded < unknown < blocked < unavailable。 */
const READINESS_SEVERITY: Readonly<Record<ReadinessStatus, number>> = {
  ready: 0, degraded: 1, unknown: 2, blocked: 3, unavailable: 4,
};

/** 聚合多条 readiness：取最差者；空集合不可假设为 ready，返回 unknown。 */
export function worstReadiness(statuses: readonly ReadinessStatus[]): ReadinessStatus {
  let worst: ReadinessStatus = 'ready';
  if (statuses.length === 0) return 'unknown';
  for (const status of statuses) {
    if (!isReadinessStatus(status)) throw new Error(`invalid readiness status: ${String(status)}`);
    if (READINESS_SEVERITY[status] > READINESS_SEVERITY[worst]) worst = status;
  }
  return worst;
}

/** readiness 快照是否仍在有效期内；未声明 expiresAt 视为不设过期。 */
export function isReadinessFresh(fact: ReadinessFact, nowIso: string): boolean {
  validateReadinessFact(fact);
  requireTimestamp(nowIso, 'readiness freshness now');
  if (fact.expiresAt === undefined) return true;
  return Date.parse(nowIso) < Date.parse(fact.expiresAt);
}

/**
 * 从注册事实与最近一次导入结果派生汇总视图。视图只做汇总，不新增事实：
 * 未知平台/服务显示为 'unknown'，没有导入记录时 lastImport 为 null（而不是伪造状态）。
 */
export function deriveSourceIngestView(
  registration: SourceRegistration,
  lastRun: ImportRunResult | null,
  derivedAt: string,
): SourceIngestView {
  validateSourceRegistration(registration);
  requireTimestamp(derivedAt, 'source ingest view derivedAt');
  const capabilityStatuses: Partial<Record<IngestCapabilityId, IngestCapabilityStatus>> = {};
  for (const capability of registration.capabilities) capabilityStatuses[capability.capabilityId] = capability.status;
  const readinessStatuses: Partial<Record<IngestCapabilityId, ReadinessStatus>> = {};
  for (const readiness of registration.readiness) readinessStatuses[readiness.capabilityId] = readiness.status;
  let lastImport: SourceIngestView['lastImport'] = null;
  if (lastRun !== null) {
    const at = lastRun.status === 'imported' ? lastRun.completedAt : lastRun.checkedAt;
    lastImport = { status: lastRun.status, at };
  }
  return {
    sourceId: registration.sourceId,
    platformId: registration.platform.kind === 'known' ? registration.platform.fact.platformId : 'unknown',
    serviceId: registration.service.kind === 'known' ? registration.service.fact.serviceId : 'unknown',
    registrationStatus: 'registered',
    capabilityStatuses,
    readinessStatuses,
    overallReadiness: worstReadiness(registration.readiness.map((fact) => fact.status)),
    lastImport,
    derivedAt,
  };
}
