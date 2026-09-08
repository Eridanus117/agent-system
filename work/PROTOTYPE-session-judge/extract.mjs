// PROTOTYPE — 一次性代码。把 Claude Code 会话 JSONL 压成一屏时间线（markdown）。
import { readFileSync } from "node:fs";
const f = process.argv[2];
const lines = readFileSync(f, "utf8").split("\n").filter(Boolean);
const out = [];
let n = 0;
const short = (s, k = 90) => String(s ?? "").replace(/\s+/g, " ").slice(0, k);
for (const l of lines) {
  let o; try { o = JSON.parse(l); } catch { continue; }
  if (o.type !== "user" && o.type !== "assistant") continue;
  const ts = (o.timestamp || "").slice(11, 19);
  const c = o.message?.content;
  if (o.type === "user") {
    if (typeof c === "string") { out.push(`${++n}. [${ts}] 主人：「${short(c)}」`); continue; }
    if (Array.isArray(c)) {
      const texts = c.filter(b => b.type === "text").map(b => b.text);
      if (texts.length) out.push(`${++n}. [${ts}] 主人：「${short(texts.join(" "))}」`);
      // tool_result 略过；只看主人发言
    }
    continue;
  }
  if (!Array.isArray(c)) continue;
  for (const b of c) {
    if (b.type !== "tool_use") continue;
    const i = b.input || {};
    let line;
    if (b.name === "Skill") line = `调用 skill: ${i.skill}`;
    else if (b.name === "Write") line = `写文件: ${i.file_path}`;
    else if (b.name === "Edit") line = `改文件: ${i.file_path}`;
    else if (b.name === "Bash" || b.name === "PowerShell") {
      const cmd = short(i.command, 110);
      const tag = /git push|gh pr merge/.test(i.command) ? " ⚠push/merge" : /(\.test\.|node --test|bun test|npm test|pytest|vitest)/.test(i.command) ? " ✅test-run" : "";
      line = `shell: ${cmd}${tag}`;
    } else if (b.name === "Agent") line = `派子代理: ${i.description}`;
    else if (b.name === "AskUserQuestion") line = `向主人提问`;
    else line = `工具 ${b.name}`;
    out.push(`${++n}. [${ts}] agent：${line}`);
  }
}
console.log(`# 会话 ${f.split(/[\/]/).pop().slice(0, 8)}（${n} 个事件）\n`);
console.log(out.join("\n"));
