// QA agent：按题的剧本扮主人。只看剧本与到目前的对话，不看判据。输出一个 JSON：{ done, reply, reason }。
import { commandRunner, type JudgeRunner } from "../judge.ts";

export interface QaTurn { done: boolean; reply?: string; reason?: string }
export interface TranscriptLine { role: "owner" | "agent"; text: string }

export function buildQaPrompt(script: string, transcript: TranscriptLine[]): string {
  const lines = transcript.map((l) => `${l.role === "owner" ? "主人" : "agent"}：${l.text}`).join("\n\n");
  return [
    "你在扮演一位软件项目的主人，和一个 agent 对话。下面是剧本，照剧本的口吻与规则回话；剧本没写的就说「你看着办」「按你推荐的」这类话。不要替 agent 干活，不要提示它用什么方法，不要评价它。",
    "", "## 剧本", "", script.trim(), "",
    "## 到目前为止的对话", "", lines, "",
    "## 你要输出的",
    "",
    "只输出一个 JSON 对象，不要别的文字：",
    '- 还要继续：{"done": false, "reply": "你作为主人要说的下一句"}',
    '- 按剧本该结束了（agent 已经做到剧本说的结束条件，或它已经开始动手）：{"done": true, "reason": "一句话说明为什么结束"}',
  ].join("\n") + "\n";
}

/** 从文本里取出第一个配平的 JSON 对象子串：从第一个 `{` 起，逐字符数花括号深度，
 * 字符串字面量内的花括号（以及被转义的引号）不计入深度；配不平就换下一个 `{` 重试。 */
export function extractFirstJsonObject(text: string): string | null {
  let start = text.indexOf("{");
  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    start = text.indexOf("{", start + 1);
  }
  return null;
}

export function parseQaTurn(text: string): QaTurn | null {
  const m = extractFirstJsonObject(text);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m); } catch { return null; }
  if (typeof j.done !== "boolean") return null;
  if (!j.done && typeof j.reply !== "string") return null;
  const out: QaTurn = { done: j.done };
  if (typeof j.reply === "string") out.reply = j.reply;
  if (typeof j.reason === "string") out.reason = j.reason;
  return out;
}

/** QA agent 的外部命令：SJ_QA_CMD 整体覆盖，否则用 Haiku 的 print 模式且不留会话。 */
export function qaRunner(model: string): JudgeRunner {
  return commandRunner(process.env.SJ_QA_CMD ?? `claude -p --model ${model} --no-session-persistence --output-format text`);
}

export async function nextQaTurn(runner: JudgeRunner, script: string, transcript: TranscriptLine[]): Promise<QaTurn & { parseFailed?: true; prompt: string; raw: string }> {
  const prompt = buildQaPrompt(script, transcript);
  let raw = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    raw = await runner(prompt);
    const t = parseQaTurn(raw);
    // 两条产物线（qa.jsonl）都要能回放当时问了什么、QA 原话是什么，成功/失败两条路径都带上 prompt/raw。
    if (t) return { ...t, prompt, raw };
  }
  return { done: true, reason: `QA agent 两次输出都不合格式：${raw.trim().slice(0, 120)}`, parseFailed: true, prompt, raw };
}
