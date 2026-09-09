import { describe, expect, test } from "bun:test";
import path from "node:path";
import { buildQaPrompt, nextQaTurn, parseQaTurn, qaRunner } from "../../src/replay/qa.ts";

const FAKE = path.join(import.meta.dir, "..", "..", "fixtures", "replay", "fake", "fake-qa.mjs");

describe("buildQaPrompt", () => {
  test("含剧本、对话、输出格式说明；不含判据字样", () => {
    const p = buildQaPrompt("剧本正文", [{ role: "owner", text: "开场" }, { role: "agent", text: "范围？" }]);
    expect(p).toContain("剧本正文");
    expect(p).toContain("主人：开场");
    expect(p).toContain("agent：范围？");
    expect(p).toContain('"done"');
    expect(p).not.toContain("验收判据");
  });
});

describe("parseQaTurn", () => {
  test("纯 JSON、带围栏、带前后废话都能解析", () => {
    expect(parseQaTurn('{"done":false,"reply":"好"}')).toEqual({ done: false, reply: "好" });
    expect(parseQaTurn('```json\n{"done":true,"reason":"完"}\n```')).toEqual({ done: true, reason: "完" });
    expect(parseQaTurn('我回：{"done":false,"reply":"行"} 完')).toEqual({ done: false, reply: "行" });
  });
  test("done 不是布尔、未结束却没 reply、非 JSON 都返回 null", () => {
    expect(parseQaTurn('{"done":"yes"}')).toBeNull();
    expect(parseQaTurn('{"done":false}')).toBeNull();
    expect(parseQaTurn("不是")).toBeNull();
  });
  test("文本里有两个 JSON 对象，取第一个配平的", () => {
    expect(parseQaTurn('{"done":false,"reply":"先这个"} 然后 {"done":true}')).toEqual({ done: false, reply: "先这个" });
  });
  test("reply 字符串里带花括号不打断配平", () => {
    expect(parseQaTurn('{"done":false,"reply":"用 {x} 占位"}')).toEqual({ done: false, reply: "用 {x} 占位" });
  });
});

describe("nextQaTurn（假 QA）", () => {
  test("主人说过一句 → 回话；说过两句 → 结束", async () => {
    process.env.SJ_QA_CMD = `node ${FAKE}`;
    process.env.FAKE_QA_MAX = "2";
    try {
      const r = qaRunner("m");
      const a = await nextQaTurn(r, "剧本", [{ role: "owner", text: "开场" }, { role: "agent", text: "范围？" }]);
      expect(a).toEqual({ done: false, reply: "按你推荐的" });
      const b = await nextQaTurn(r, "剧本", [{ role: "owner", text: "开场" }, { role: "agent", text: "范围？" }, { role: "owner", text: "按你推荐的" }, { role: "agent", text: "好" }]);
      expect(b.done).toBe(true);
    } finally { delete process.env.SJ_QA_CMD; delete process.env.FAKE_QA_MAX; }
  });
  test("两次不合格式 → done 且 parseFailed", async () => {
    process.env.SJ_QA_CMD = `node ${FAKE}`;
    process.env.FAKE_QA_BROKEN = "1";
    try {
      const r = await nextQaTurn(qaRunner("m"), "剧本", [{ role: "owner", text: "开场" }]);
      expect(r.done).toBe(true);
      expect(r.parseFailed).toBe(true);
      expect(r.reason).toContain("不合格式");
    } finally { delete process.env.SJ_QA_CMD; delete process.env.FAKE_QA_BROKEN; }
  });
});
