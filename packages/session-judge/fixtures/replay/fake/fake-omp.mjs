// 假 omp：不调模型。按 FAKE_TURNS 追加 OMP 格式会话行、印 --mode json 形状的事件流。
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const sessionDir = flag("--session-dir");
if (!flag("--profile") || !sessionDir) { console.error("缺 --profile/--session-dir"); process.exit(2); }
const prompt = args[args.length - 1];
let id = flag("--resume");
let file;
if (id) {
  file = fs.readdirSync(sessionDir).map((f) => path.join(sessionDir, f)).find((f) => f.endsWith(`_${id}.jsonl`));
} else {
  id = `01a0${Math.random().toString(16).slice(2, 10)}`;
  fs.mkdirSync(sessionDir, { recursive: true });
  file = path.join(sessionDir, `2026-09-09T00-00-00-000Z_${id}.jsonl`);
  fs.writeFileSync(file, JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-09-09T00:00:00.000Z", cwd: process.cwd() }) + "\n");
}
const existing = fs.readFileSync(file, "utf8");
const turnIdx = (existing.match(/"role":"user"/g) ?? []).length;
const turns = JSON.parse(fs.readFileSync(process.env.FAKE_TURNS, "utf8"));
const turn = turns[Math.min(turnIdx, turns.length - 1)];
const now = "2026-09-09T00:00:01.000Z";
const rows = [
  { type: "message", id: `u${turnIdx}`, timestamp: now, message: { role: "user", content: [{ type: "text", text: prompt }] } },
  ...turn.rows,
  { type: "message", id: `a${turnIdx}`, timestamp: now, message: { role: "assistant", content: [{ type: "text", text: turn.text }] } },
];
fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const out = [
  { type: "session", version: 3, id, timestamp: now, cwd: process.cwd() },
  { type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: turn.text }], usage: { input: 100, output: 10, cost: { total: 0.001 } } }, toolResults: [] },
  { type: "agent_end", messages: [], isTerminal: true },
];
console.log(out.map((r) => JSON.stringify(r)).join("\n"));
