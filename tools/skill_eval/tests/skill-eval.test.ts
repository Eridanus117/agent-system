import { describe, expect, test } from 'bun:test';
import {
  summarizeResultSet,
  validateDocument,
  validateRunDocument,
  type EvalDocument,
  type RunDocument,
} from '../skill-eval.ts';

function baseDocument(): EvalDocument {
  return {
    skill_name: 'skill-maintenance',
    evals: [
      {
        id: 'explicit-maintenance',
        name: 'Explicit maintenance request',
        kind: 'behavior',
        prompt: 'Audit the existing skill contract and update its caller list.',
        expected_trigger: true,
        expected_output: 'Returns a bounded maintenance plan and preserves lifecycle gates.',
        files: ['fixtures/skill.md'],
        assertions: [{ name: 'bounded-plan', description: 'The response contains a bounded maintenance plan.' }],
      },
      {
        id: 'business-debugging',
        name: 'Business debugging near miss',
        kind: 'trigger',
        prompt: 'Debug the checkout calculation in the application service.',
        expected_trigger: false,
        expected_output: 'Routes to ordinary debugging without Skill maintenance.',
        files: [],
        assertions: [],
      },
    ],
  };
}

function run(mode: RunDocument['mode'], overrides: Partial<RunDocument['trials'][number]> = {}): RunDocument {
  return {
    skill_name: 'skill-maintenance',
    mode,
    trials: [
      {
        eval_id: 'explicit-maintenance',
        triggered: true,
        status: 'passed',
        assertions: [{ text: 'The response contains a bounded maintenance plan.', passed: true, evidence: 'plan section' }],
        duration_ms: 100,
        total_tokens: 200,
        ...overrides,
      },
      {
        eval_id: 'business-debugging',
        triggered: false,
        status: 'passed',
        assertions: [],
        duration_ms: 80,
        total_tokens: 150,
      },
    ],
  };
}

describe('validateDocument', () => {
  test('accepts a complete document with explicit assertion arrays', () => {
    const document = baseDocument();
    expect(validateDocument(document)).toEqual(document);
  });

  test('rejects null assertions and mismatched Skill directories', () => {
    const malformed: unknown = {
      ...baseDocument(),
      evals: baseDocument().evals.map((evaluation, index) =>
        index === 0 ? { ...evaluation, assertions: null } : evaluation,
      ),
    };
    expect(() => validateDocument(malformed)).toThrow('assertions must be an array');

    const invalidRun: unknown = {
      ...run('with_skill'),
      trials: run('with_skill').trials.map((trial, index) =>
        index === 0 ? { ...trial, assertions: null } : trial,
      ),
    };
    expect(() => validateRunDocument(invalidRun, baseDocument())).toThrow('run.trials[0].assertions must be an array');
    const invalidMode: unknown = { ...run('with_skill'), mode: 'invalid' };
    expect(() => validateRunDocument(invalidMode, baseDocument())).toThrow('run.mode must be baseline');

    const wrongSkill = baseDocument();
    wrongSkill.skill_name = 'other-skill';
    expect(() => validateDocument(wrongSkill, 'plugins/skill-maintenance/skills/skill-maintenance/evals/evals.json')).toThrow(
      'parent Skill directory skill-maintenance',
    );
  });

  test('rejects duplicate IDs and missing positive or negative trigger cases', () => {
    const duplicate = baseDocument();
    duplicate.evals[1].id = duplicate.evals[0].id;
    expect(() => validateDocument(duplicate)).toThrow('duplicate eval id');

    const onlyPositive = baseDocument();
    onlyPositive.evals[1].expected_trigger = true;
    expect(() => validateDocument(onlyPositive)).toThrow('positive and negative trigger cases');
  });

  test('rejects unsafe file paths', () => {
    const parentTraversal = baseDocument();
    parentTraversal.evals[0].files = ['../secret.txt'];
    expect(() => validateDocument(parentTraversal)).toThrow('unsafe file path');

    const absolutePath = baseDocument();
    absolutePath.evals[0].files = ['C:/secret.txt'];
    expect(() => validateDocument(absolutePath)).toThrow('unsafe file path');
  });
});

describe('summarizeResultSet', () => {
  test('reports trigger accuracy, behavior rate, and cost deltas', () => {
    const document = baseDocument();
    const summary = summarizeResultSet(document, [run('baseline'), run('with_skill')]);

    expect(summary.complete).toBe(true);
    expect(summary.errors).toEqual([]);
    expect(summary.modes.baseline.triggerAccuracy).toBe(1);
    expect(summary.modes.with_skill.behaviorPassRate).toBe(1);
    expect(summary.paired.with_skill_minus_baseline_duration_ms).toBe(0);
    expect(summary.paired.with_skill_minus_baseline_total_tokens).toBe(0);
  });
  test('accepts old Skill comparison without requiring a baseline', () => {
    const document = baseDocument();
    const summary = summarizeResultSet(document, [run('old_skill'), run('with_skill')]);

    expect(summary.complete).toBe(true);
    expect(summary.modes.old_skill.triggerAccuracy).toBe(1);
    expect(summary.paired.with_skill_minus_old_skill_duration_ms).toBe(0);
    expect(summary.paired.with_skill_minus_old_skill_total_tokens).toBe(0);
  });

  test('keeps unknown results visible and flags incomplete paired runs', () => {
    const document = baseDocument();
    const incomplete = run('with_skill');
    incomplete.trials = [
      {
        eval_id: 'explicit-maintenance',
        triggered: false,
        status: 'unknown',
        assertions: [{ text: 'The response contains a bounded maintenance plan.', passed: true, evidence: 'unknown' }],
      },
    ];
    const summary = summarizeResultSet(document, [run('baseline'), incomplete]);

    expect(summary.complete).toBe(false);
    expect(summary.errors).toContain('with_skill: missing trial business-debugging');
    expect(summary.modes.with_skill.unknown).toBe(2);
  });

  test('counts false positives, false negatives, and assertion failures', () => {
    const document = baseDocument();
    const withSkill = run('with_skill');
    withSkill.trials[0].triggered = false;
    withSkill.trials[0].assertions = [{ text: 'bad', passed: false, evidence: 'missing' }];
    withSkill.trials[1].triggered = true;
    const summary = summarizeResultSet(document, [run('baseline'), withSkill]);

    expect(summary.modes.with_skill.falseNegatives).toBe(1);
    expect(summary.modes.with_skill.falsePositives).toBe(1);
    expect(summary.modes.with_skill.assertionPassRate).toBe(0);
    expect(summary.complete).toBe(false);
    expect(summary.errors).toContain('with_skill: false negative explicit-maintenance');
    expect(summary.errors).toContain('with_skill: false positive business-debugging');
    expect(summary.errors).toContain('with_skill: failed assertion explicit-maintenance');
  });

  test('rejects result assertions that do not match declared gates', () => {
    const malformed: unknown = {
      ...run('with_skill'),
      trials: run('with_skill').trials.map((trial, index) =>
        index === 0 ? { ...trial, assertions: [] } : trial,
      ),
    };
    expect(() => validateRunDocument(malformed, baseDocument())).toThrow('must contain 1 entries');
  });
});
