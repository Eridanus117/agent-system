import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { validateDocument } from '../../tools/skill_eval/skill-eval.ts';

const pluginsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(path, 'utf8').replace(/^\ufeff/u, '').replace(/\r\n/gu, '\n');

const evalPath = join(
  pluginsRoot,
  'skill-maintenance',
  'skills',
  'skill-maintenance',
  'evals',
  'evals.json',
);
const skillPath = join(pluginsRoot, 'skill-maintenance', 'skills', 'skill-maintenance', 'SKILL.md');
const referencePath = join(
  pluginsRoot,
  'skill-maintenance',
  'skills',
  'skill-maintenance',
  'references',
  'evaluation-loop.md',
);

test('skill-maintenance evaluation sample satisfies the portable contract', () => {
  const document = validateDocument(JSON.parse(read(evalPath)));
  assert.equal(document.skill_name, 'skill-maintenance');
  assert.equal(document.evals.length, 4);
  assert.ok(document.evals.some((evaluation) => evaluation.expected_trigger));
  assert.ok(document.evals.some((evaluation) => !evaluation.expected_trigger));
});

test('skill-maintenance routes behavior changes to the evaluation reference', () => {
  const skill = read(skillPath);
  const reference = read(referencePath);
  assert.match(skill, /references\/evaluation-loop\.md/u);
  assert.match(skill, /配对评估/u);
  assert.match(reference, /baseline\.json/u);
  assert.match(reference, /with_skill\.json/u);
  assert.match(reference, /评估结果不能单独证明/u);
});

test('evaluation support does not change the default profile import', () => {
  const imports = read(join(pluginsRoot, 'skill-imports.toml'));
  assert.match(imports, /source = "plugins\/grilling\/skills\/grilling"/u);
  assert.doesNotMatch(imports, /skill-maintenance/u);
});
