import { describe, expect, test } from "bun:test";
import { defaultModel, majority, renderScoreTable } from "../../src/replay/score.ts";

describe("majority", () => {
  test("多数说了算；平局或空为 indeterminate", () => {
    expect(majority(["pass", "pass", "fail"])).toBe("pass");
    expect(majority(["fail", "indeterminate", "fail"])).toBe("fail");
    expect(majority(["pass", "fail", "indeterminate"])).toBe("indeterminate");
    expect(majority(["pass"])).toBe("pass");
    expect(majority([])).toBe("indeterminate");
  });
});

describe("renderScoreTable", () => {
  test("行是题，列是 CLI，表头带两个 SHA", () => {
    const t = renderScoreTable([
      { story: "10-a", client: "claude", verdict: "pass" },
      { story: "10-a", client: "omp", verdict: "fail" },
      { story: "20-b", client: "claude", verdict: "indeterminate" },
    ], "abc1234", "def5678");
    expect(t).toContain("规程 SHA：abc1234");
    expect(t).toContain("题库 SHA：def5678");
    expect(t).toContain("| 10-a | pass | fail |");
    expect(t).toContain("| 20-b | indeterminate | — |");
  });
});

test("defaultModel", () => {
  expect(defaultModel("claude")).toBe("claude-sonnet-5");
  expect(defaultModel("omp")).toBe("luna");
});
