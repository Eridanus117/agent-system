// 整轮：题 × CLI × 次数，多数表决，两个 SHA，一张表。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Client } from "../types.ts";
import { type RunOptions, replayOne } from "./run.ts";
import type { Story } from "./story.ts";
import type { Three, Verdict } from "./verdict.ts";

export const DEFAULT_QA_MODEL = "claude-haiku-4-5-20251001";

export function defaultModel(client: Client): string {
  return client === "claude" ? "claude-sonnet-5" : "luna";
}

export function majority(vs: Three[]): Three {
  const count = new Map<Three, number>();
  for (const v of vs) count.set(v, (count.get(v) ?? 0) + 1);
  let best: Three = "indeterminate";
  let bestN = 0;
  let tie = false;
  for (const [v, n] of count) {
    if (n > bestN) { best = v; bestN = n; tie = false; }
    else if (n === bestN) tie = true;
  }
  return bestN === 0 || tie ? "indeterminate" : best;
}

export interface Cell { story: string; client: Client; verdict: Three }

export function renderScoreTable(cells: Cell[], candidateSha: string, bankSha: string): string {
  const stories = [...new Set(cells.map((c) => c.story))].sort();
  const clients: Client[] = ["claude", "omp"];
  const cell = (s: string, c: Client) => cells.find((x) => x.story === s && x.client === c)?.verdict ?? "—";
  return [
    `规程 SHA：${candidateSha}`,
    `题库 SHA：${bankSha}`,
    "",
    "| 题 | claude | omp |",
    "|---|---|---|",
    ...stories.map((s) => `| ${s} | ${cell(s, clients[0]!)} | ${cell(s, clients[1]!)} |`),
  ].join("\n") + "\n";
}

export interface ScoreOptions extends Omit<RunOptions, "story" | "client" | "model"> {
  stories: Story[];
  clients?: Client[];
  runs: number;
  modelFor?: (client: Client) => string;
}

export async function scoreAll(o: ScoreOptions): Promise<{ table: string; verdicts: Verdict[]; cells: Cell[] }> {
  const verdicts: Verdict[] = [];
  const cells: Cell[] = [];
  for (const story of o.stories) {
    const clients = story.meta.clients.filter((c) => !o.clients || o.clients.includes(c));
    for (const client of clients) {
      const got: Three[] = [];
      for (let i = 0; i < o.runs; i++) {
        const v = await replayOne({ ...o, story, client, model: (o.modelFor ?? defaultModel)(client) });
        verdicts.push(v);
        got.push(v.verdict);
      }
      cells.push({ story: story.meta.id, client, verdict: majority(got) });
    }
  }
  const candidateSha = verdicts[0]?.candidateSha ?? "unknown";
  const bankSha = verdicts[0]?.bankSha ?? "unknown";
  const table = renderScoreTable(cells, candidateSha, bankSha);
  const outDir = path.join(o.stateRoot, "replay");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "summary.md"), table);
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ candidateSha, bankSha, runs: o.runs, cells, verdicts }, null, 2) + "\n");
  return { table, verdicts, cells };
}
