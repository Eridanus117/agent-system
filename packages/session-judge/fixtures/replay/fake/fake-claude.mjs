// 假 claude：不调模型。按 FAKE_TURNS 里的脚本追加会话行、印 claude -p --output-format json 形状的结果。
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const id = flag("--session-id") ?? flag("--resume");
if (!id) { console.error("缺 --session-id/--resume"); process.exit(2); }
const cfg = process.env.CLAUDE_CONFIG_DIR;
if (!cfg) { console.error("缺 CLAUDE_CONFIG_DIR"); process.exit(2); }
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const dir = path.join(cfg, "projects", "fake");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const turnIdx = (existing.match(/"role":"user"/g) ?? []).length;
  const turns = JSON.parse(fs.readFileSync(process.env.FAKE_TURNS, "utf8"));
  const turn = turns[Math.min(turnIdx, turns.length - 1)];
  const now = new Date().toISOString();
  // fixture JSON 造好的时候 runId（=workDir 的一部分）还没生成，file_path 等字段里写不出真实路径；
  // 用 "{{CWD}}" 占位符，跑到这里再换成假 claude 自己的 cwd（调用方总是把 workDir 当 cwd 传进来）。
  const substituteCwd = (v) => {
    if (typeof v === "string") return v.replaceAll("{{CWD}}", process.cwd());
    if (Array.isArray(v)) return v.map(substituteCwd);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, substituteCwd(x)]));
    return v;
  };
  const turnRows = substituteCwd(turn.rows);
  const rows = [
    { type: "user", timestamp: now, message: { role: "user", content: prompt.trim() } },
    ...turnRows,
    { type: "assistant", timestamp: now, message: { role: "assistant", content: [{ type: "text", text: turn.text }] } },
  ];
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 1, result: turn.text, session_id: id, total_cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 10 } }));
});
