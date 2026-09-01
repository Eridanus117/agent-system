# Skill Evaluation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a portable, deterministic evaluation contract and summary tool to `skill-maintenance`, following Anthropic's with/without-Skill evaluation pattern without adding model orchestration.

**Architecture:** Keep lifecycle ownership in `skill-maintenance`. Store opt-in eval cases beside the Skill, validate them with a standalone TypeScript tool, and summarize externally produced baseline/with_skill/old_skill result files. The tool never invokes a model, reads secrets, or changes installation state.

**Tech Stack:** TypeScript, Bun, Node standard library, JSON, Markdown.

**Spec:** `docs/superpowers/specs/2026-09-01-skill-evaluation-loop-design.md`

## Global Constraints

- Use only Go, Python, TypeScript, or Rust for persistent programs and scripts.
- Keep the existing Plugin/Marketplace/default-import boundaries unchanged.
- Do not introduce a daemon, service, model API call, credential store, or automatic release decision.
- Reject malformed contracts, unsafe paths, missing paired results, and silent failures.
- New or substantively changed code comments must be Chinese.
- Treat static validation and result aggregation as weaker evidence than real client execution and fresh-session verification.

---

### Task 1: Add the evaluation contract and deterministic tool

**Files:**
- Create: `tools/skill_eval/skill-eval.ts`
- Test: `tools/skill_eval/tests/skill-eval.test.ts`

**Interfaces:**
- `validateDocument(document: unknown, sourcePath?: string): EvalDocument`
- `validateRunDocument(result: unknown, evalDocument: EvalDocument): RunDocument`
- `summarizeResultSet(document: unknown, runs: unknown[]): EvaluationSummary`
- CLI: `bun tools/skill_eval/skill-eval.ts validate <evals.json>`
- CLI: `bun tools/skill_eval/skill-eval.ts summarize <result-dir> --evals <evals.json>`

**Contract:**

```ts
type EvalCase = {
  id: string;
  name: string;
  kind: 'trigger' | 'behavior';
  prompt: string;
  expected_trigger: boolean;
  expected_output: string;
  files: string[];
  assertions: { name: string; description: string }[];
};

type EvalDocument = { skill_name: string; evals: EvalCase[] };

type TrialResult = {
  eval_id: string;
  triggered: boolean;
  status: 'passed' | 'failed' | 'unknown';
  assertions: { text: string; passed: boolean; evidence: string }[];
  duration_ms?: number;
  total_tokens?: number;
};

type RunDocument = {
  skill_name: string;
  mode: 'baseline' | 'with_skill' | 'old_skill';
  trials: TrialResult[];
};
```

- [x] **Step 1: Write failing tests** for valid documents, duplicate IDs, absent positive/negative trigger cases, unsafe absolute/parent paths, malformed result modes, missing paired trials, trigger false positives/negatives, assertion failures, unknown results, and cost deltas.
- [x] **Step 2: Run the focused test** with `bun test tools/skill_eval/tests/skill-eval.test.ts`; expect failure because the module does not exist.
- [x] **Step 3: Implement validation** with strict object/array checks, unique IDs, relative POSIX-safe file paths, at least one positive and one negative trigger case, Skill-directory identity checks, and assertion-set correspondence.
- [x] **Step 4: Implement summary** that compares expected versus observed triggers, counts false positives/negatives, makes failed statuses and assertions non-passing, calculates known behavior and assertion pass rates, reports missing/unknown trials, and computes mean duration/token deltas when both sides have values.
- [x] **Step 5: Implement the CLI** with nonzero exit on malformed input, incomplete paired runs, or failed evaluation outcomes; emit the JSON summary and preserve unknowns in the result.
- [x] **Step 6: Run the focused test** again and require all cases to pass.

### Task 2: Add the `skill-maintenance` evaluation sample and route

**Files:**
- Create: `plugins/skill-maintenance/skills/skill-maintenance/evals/evals.json`
- Create: `plugins/skill-maintenance/skills/skill-maintenance/references/evaluation-loop.md`
- Modify: `plugins/skill-maintenance/skills/skill-maintenance/SKILL.md`

**Interfaces:**
- The Skill routes only to `references/evaluation-loop.md` when a change affects capability, behavior, or trigger description.
- The sample contract validates with `bun tools/skill_eval/skill-eval.ts validate plugins/skill-maintenance/skills/skill-maintenance/evals/evals.json`.

- [x] **Step 1: Write the sample contract** with four realistic cases: explicit Skill maintenance, new Skill creation, formatting-only near miss, and ordinary business-code debugging near miss.
- [x] **Step 2: Add the short L2 route** to `SKILL.md`, preserving the existing behavior-contract and lifecycle gates.
- [x] **Step 3: Write the L3 reference** with paired-run directories, result schema, grader evidence rules, trigger/behavior/cost metrics, stopping conditions, and explicit “evaluation is not installation” boundary.
- [x] **Step 4: Validate the sample** with the focused CLI command.

### Task 3: Synchronize project documentation and static checks

**Files:**
- Modify: `plugins/docs/conformance.md`
- Modify: `plugins/docs/lifecycle.md`
- Modify: `plugins/README.md`
- Create: `plugins/tests/skill-evaluation.test.ts`

**Interfaces:**
- The new static test checks the sample contract, required reference markers, CLI path, and existing Marketplace/default-import boundaries.

- [x] **Step 1: Add documentation** distinguishing trigger precision, task outcome, cost, static checks, real-client evidence, and installation evidence.
- [x] **Step 2: Add the static conformance test** for the sample eval contract and required route/reference markers.
- [x] **Step 3: Run the new test** with `bun test plugins/tests/skill-evaluation.test.ts` and fix failures.
- [x] **Step 4: Run the existing routing test** with `node plugins/tests/workflow-routing.test.ts`.

### Task 4: Final review and repository verification

**Files:**
- Review only the changed files from Tasks 1–3.

- [x] **Step 1: Run `bun test tools/skill_eval/tests/skill-eval.test.ts plugins/tests/skill-evaluation.test.ts`**.
- [x] **Step 2: Run `node plugins/tests/workflow-routing.test.ts`**.
- [x] **Step 3: Typecheck the standalone tool** with `bunx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tools/skill_eval/skill-eval.ts`; require exit code 0 and no generated files.
- [x] **Step 4: Inspect the diff for placeholders, stale paths, English comments in changed code, and accidental changes to untracked user files.**
- [x] **Step 5: Run an independent code-review pass before claiming completion.**
