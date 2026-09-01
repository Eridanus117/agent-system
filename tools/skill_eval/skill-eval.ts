import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

type EvalKind = 'trigger' | 'behavior';
type RunMode = 'baseline' | 'with_skill' | 'old_skill';
type TrialStatus = 'passed' | 'failed' | 'unknown';

export type EvalAssertion = {
  name: string;
  description: string;
};

export type EvalCase = {
  id: string;
  name: string;
  kind: EvalKind;
  prompt: string;
  expected_trigger: boolean;
  expected_output: string;
  files: string[];
  assertions: EvalAssertion[];
};

export type EvalDocument = {
  skill_name: string;
  evals: EvalCase[];
};

export type TrialAssertion = {
  text: string;
  passed: boolean;
  evidence: string;
};

export type TrialResult = {
  eval_id: string;
  triggered: boolean;
  status: TrialStatus;
  assertions: TrialAssertion[];
  duration_ms?: number;
  total_tokens?: number;
};

export type RunDocument = {
  skill_name: string;
  mode: RunMode;
  trials: TrialResult[];
};

type ModeSummary = {
  mode: RunMode;
  total: number;
  observed: number;
  unknown: number;
  triggerCorrect: number;
  falsePositives: number;
  falseNegatives: number;
  triggerAccuracy: number | null;
  behaviorTrials: number;
  behaviorPassed: number;
  behaviorPassRate: number | null;
  assertionTotal: number;
  assertionPassed: number;
  assertionPassRate: number | null;
  meanDurationMs: number | null;
  meanTotalTokens: number | null;
};

export type EvaluationSummary = {
  skill_name: string;
  complete: boolean;
  errors: string[];
  modes: Partial<Record<RunMode, ModeSummary>>;
  paired: {
    with_skill_minus_baseline_duration_ms: number | null;
    with_skill_minus_baseline_total_tokens: number | null;
    with_skill_minus_baseline_behavior_pass_rate: number | null;
    with_skill_minus_old_skill_duration_ms: number | null;
    with_skill_minus_old_skill_total_tokens: number | null;
    with_skill_minus_old_skill_behavior_pass_rate: number | null;
  };
};

const RUN_MODES: RunMode[] = ['baseline', 'with_skill', 'old_skill'];
const TRIAL_STATUSES: TrialStatus[] = ['passed', 'failed', 'unknown'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isOneOf<T>(values: readonly T[], value: unknown): value is T {
  return values.some((candidate) => candidate === value);
}

function fail(message: string): never {
  throw new Error(message);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fail(`${field} must be a non-empty string`);
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') return fail(`${field} must be a boolean`);
  return value;
}

function optionalNonNegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail(`${field} must be a finite non-negative number`);
  }
  return value;
}

function safeRelativePath(value: string): boolean {
  if (value.trim() === '' || value.includes('\\') || isAbsolute(value) || /^[A-Za-z]:/u.test(value)) return false;
  return !value.split('/').some((segment) => segment === '..');
}

function validateAssertion(value: unknown, prefix: string): EvalAssertion {
  const record = isRecord(value) ? value : fail(`${prefix} must be an object`);
  return {
    name: requiredString(record.name, `${prefix}.name`),
    description: requiredString(record.description, `${prefix}.description`),
  };
}

function validateEvalCase(value: unknown, index: number): EvalCase {
  const prefix = `evals[${index}]`;
  const record = isRecord(value) ? value : fail(`${prefix} must be an object`);
  const rawFiles = record.files;
  if (!Array.isArray(rawFiles)) fail(`${prefix}.files must be an array`);
  const files = rawFiles.map((file: unknown, fileIndex) => {
    const path = requiredString(file, `${prefix}.files[${fileIndex}]`);
    if (!safeRelativePath(path)) fail(`${prefix}.files[${fileIndex}] unsafe file path`);
    return path;
  });
  const rawAssertions = record.assertions;
  if (!Array.isArray(rawAssertions)) fail(`${prefix}.assertions must be an array`);
  const assertions = rawAssertions.map((assertion: unknown, assertionIndex) =>
    validateAssertion(assertion, `${prefix}.assertions[${assertionIndex}]`),
  );
  const assertionNames = new Set<string>();
  for (const assertion of assertions) {
    if (assertionNames.has(assertion.name)) fail(`${prefix} duplicate assertion name ${assertion.name}`);
    assertionNames.add(assertion.name);
  }
  const kindValue = record.kind;
  if (kindValue !== 'trigger' && kindValue !== 'behavior') fail(`${prefix}.kind must be trigger or behavior`);
  if (kindValue === 'behavior' && assertions.length === 0) {
    fail(`${prefix}.assertions must contain at least one behavior gate`);
  }
  return {
    id: requiredString(record.id, `${prefix}.id`),
    name: requiredString(record.name, `${prefix}.name`),
    kind: kindValue,
    prompt: requiredString(record.prompt, `${prefix}.prompt`),
    expected_trigger: requiredBoolean(record.expected_trigger, `${prefix}.expected_trigger`),
    expected_output: requiredString(record.expected_output, `${prefix}.expected_output`),
    files,
    assertions,
  };
}

export function validateDocument(value: unknown, sourcePath?: string): EvalDocument {
  const record = isRecord(value) ? value : fail('evaluation document must be an object');
  const skillName = requiredString(record.skill_name, 'skill_name');
  if (sourcePath) {
    const parentSkillName = basename(dirname(dirname(resolve(sourcePath))));
    if (skillName !== parentSkillName) fail(`skill_name must match parent Skill directory ${parentSkillName}`);
  }
  if (!Array.isArray(record.evals) || record.evals.length < 2) fail('evals must contain at least two cases');
  const evals = record.evals.map(validateEvalCase);
  const ids = new Set<string>();
  let hasPositive = false;
  let hasNegative = false;
  for (const evaluation of evals) {
    if (ids.has(evaluation.id)) fail(`duplicate eval id ${evaluation.id}`);
    ids.add(evaluation.id);
    hasPositive ||= evaluation.expected_trigger;
    hasNegative ||= !evaluation.expected_trigger;
  }
  if (!hasPositive || !hasNegative) fail('evals must include positive and negative trigger cases');
  return { skill_name: skillName, evals };
}

function validateTrialAssertion(value: unknown, prefix: string): TrialAssertion {
  const record = isRecord(value) ? value : fail(`${prefix} must be an object`);
  return {
    text: requiredString(record.text, `${prefix}.text`),
    passed: requiredBoolean(record.passed, `${prefix}.passed`),
    evidence: requiredString(record.evidence, `${prefix}.evidence`),
  };
}

export function validateRunDocument(value: unknown, evalDocument: EvalDocument): RunDocument {
  const record = isRecord(value) ? value : fail('run document must be an object');
  const skillName = requiredString(record.skill_name, 'run.skill_name');
  if (skillName !== evalDocument.skill_name) fail('run.skill_name must match eval skill_name');
  const modeValue = record.mode;
  if (!isOneOf(RUN_MODES, modeValue)) fail('run.mode must be baseline, with_skill, or old_skill');
  const mode = modeValue;
  if (!Array.isArray(record.trials)) fail('run.trials must be an array');
  const knownEvaluations = new Map(evalDocument.evals.map((evaluation) => [evaluation.id, evaluation]));
  const trialIds = new Set<string>();
  const trials = record.trials.map((trial, index) => {
    const prefix = `run.trials[${index}]`;
    const trialRecord = isRecord(trial) ? trial : fail(`${prefix} must be an object`);
    const evalId = requiredString(trialRecord.eval_id, `${prefix}.eval_id`);
    const evaluation = knownEvaluations.get(evalId);
    if (!evaluation) fail(`${prefix}.eval_id is not declared`);
    if (trialIds.has(evalId)) fail(`duplicate trial eval id ${evalId}`);
    trialIds.add(evalId);
    const statusValue = trialRecord.status;
    if (!isOneOf(TRIAL_STATUSES, statusValue)) fail(`${prefix}.status is invalid`);
    const rawAssertions = trialRecord.assertions;
    if (!Array.isArray(rawAssertions)) fail(`${prefix}.assertions must be an array`);
    if (rawAssertions.length !== evaluation.assertions.length) {
      fail(`${prefix}.assertions must contain ${evaluation.assertions.length} entries`);
    }
    return {
      eval_id: evalId,
      triggered: requiredBoolean(trialRecord.triggered, `${prefix}.triggered`),
      status: statusValue,
      assertions: rawAssertions.map((assertion: unknown, assertionIndex) =>
        validateTrialAssertion(assertion, `${prefix}.assertions[${assertionIndex}]`),
      ),
      duration_ms: optionalNonNegativeNumber(trialRecord.duration_ms, `${prefix}.duration_ms`),
      total_tokens: optionalNonNegativeNumber(trialRecord.total_tokens, `${prefix}.total_tokens`),
    } satisfies TrialResult;
  });
  return { skill_name: skillName, mode, trials };
}

function mean(values: Array<number | undefined>): number | null {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0) / present.length;
}

function delta(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function summarizeMode(document: EvalDocument, run: RunDocument, errors: string[]): ModeSummary {
  const trials = new Map(run.trials.map((trial) => [trial.eval_id, trial]));
  let observed = 0;
  let unknown = 0;
  let triggerCorrect = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let behaviorTrials = 0;
  let behaviorPassed = 0;
  let assertionTotal = 0;
  let assertionPassed = 0;
  for (const evaluation of document.evals) {
    const trial = trials.get(evaluation.id);
    if (!trial) {
      unknown += 1;
      errors.push(`${run.mode}: missing trial ${evaluation.id}`);
      continue;
    }
    if (trial.status === 'unknown') {
      unknown += 1;
      errors.push(`${run.mode}: unknown trial ${evaluation.id}`);
      continue;
    }
    observed += 1;
    if (trial.triggered === evaluation.expected_trigger) {
      triggerCorrect += 1;
    } else if (trial.triggered) {
      falsePositives += 1;
      errors.push(`${run.mode}: false positive ${evaluation.id}`);
    } else {
      falseNegatives += 1;
      errors.push(`${run.mode}: false negative ${evaluation.id}`);
    }
    if (trial.status === 'failed') errors.push(`${run.mode}: failed trial ${evaluation.id}`);
    if (evaluation.kind === 'behavior') {
      behaviorTrials += 1;
      if (trial.status === 'passed' && trial.assertions.every((assertion) => assertion.passed)) behaviorPassed += 1;
    }
    assertionTotal += trial.assertions.length;
    assertionPassed += trial.assertions.filter((assertion) => assertion.passed).length;
    if (trial.assertions.some((assertion) => !assertion.passed)) {
      errors.push(`${run.mode}: failed assertion ${evaluation.id}`);
    }
  }
  return {
    mode: run.mode,
    total: document.evals.length,
    observed,
    unknown,
    triggerCorrect,
    falsePositives,
    falseNegatives,
    triggerAccuracy: observed === 0 ? null : triggerCorrect / observed,
    behaviorTrials,
    behaviorPassed,
    behaviorPassRate: behaviorTrials === 0 ? null : behaviorPassed / behaviorTrials,
    assertionTotal,
    assertionPassed,
    assertionPassRate: assertionTotal === 0 ? null : assertionPassed / assertionTotal,
    meanDurationMs: mean(run.trials.map((trial) => trial.duration_ms)),
    meanTotalTokens: mean(run.trials.map((trial) => trial.total_tokens)),
  };
}

export function summarizeResultSet(documentValue: unknown, runValues: unknown[]): EvaluationSummary {
  const document = validateDocument(documentValue);
  const runs = runValues.map((run) => validateRunDocument(run, document));
  const errors: string[] = [];
  const modes: Partial<Record<RunMode, ModeSummary>> = {};
  for (const run of runs) {
    if (modes[run.mode]) fail(`duplicate run mode ${run.mode}`);
    modes[run.mode] = summarizeMode(document, run, errors);
  }
  if (!modes.with_skill) errors.push('missing run with_skill');
  if (!modes.baseline && !modes.old_skill) errors.push('missing comparison run baseline or old_skill');
  const baseline = modes.baseline;
  const oldSkill = modes.old_skill;
  const withSkill = modes.with_skill;
  return {
    skill_name: document.skill_name,
    complete: errors.length === 0,
    errors,
    modes,
    paired: {
      with_skill_minus_baseline_duration_ms: delta(withSkill?.meanDurationMs ?? null, baseline?.meanDurationMs ?? null),
      with_skill_minus_baseline_total_tokens: delta(withSkill?.meanTotalTokens ?? null, baseline?.meanTotalTokens ?? null),
      with_skill_minus_baseline_behavior_pass_rate: delta(
        withSkill?.behaviorPassRate ?? null,
        baseline?.behaviorPassRate ?? null,
      ),
      with_skill_minus_old_skill_duration_ms: delta(withSkill?.meanDurationMs ?? null, oldSkill?.meanDurationMs ?? null),
      with_skill_minus_old_skill_total_tokens: delta(withSkill?.meanTotalTokens ?? null, oldSkill?.meanTotalTokens ?? null),
      with_skill_minus_old_skill_behavior_pass_rate: delta(
        withSkill?.behaviorPassRate ?? null,
        oldSkill?.behaviorPassRate ?? null,
      ),
    },
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function usage(): never {
  process.stderr.write(
    'Usage: bun tools/skill_eval/skill-eval.ts validate <evals.json>\n' +
      '       bun tools/skill_eval/skill-eval.ts summarize <result-dir> --evals <evals.json>\n',
  );
  process.exit(2);
}

function main(): void {
  const [, , command, firstPath, ...rest] = process.argv;
  if (command === 'validate' && firstPath) {
    const document = validateDocument(readJson(resolve(firstPath)), firstPath);
    process.stdout.write(`VALID: ${document.skill_name} (${document.evals.length} evals)\n`);
    return;
  }
  if (command === 'summarize' && firstPath) {
    const evalsIndex = rest.indexOf('--evals');
    const evalsPath = evalsIndex >= 0 ? rest[evalsIndex + 1] : undefined;
    const evalsFile = evalsPath ?? usage();
    const document = validateDocument(readJson(resolve(evalsFile)), evalsFile);
    const resultDir = resolve(firstPath);
    const runs = RUN_MODES.flatMap((mode) => {
      const path = join(resultDir, `${mode}.json`);
      if (!existsSync(path)) return [];
      const run = readJson(path);
      if (!isRecord(run) || run.mode !== mode) fail(`${path}: run.mode must match filename ${mode}`);
      return [run];
    });
    const summary = summarizeResultSet(document, runs);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.complete) process.exitCode = 1;
    return;
  }
  usage();
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
