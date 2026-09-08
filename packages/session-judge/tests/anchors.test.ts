// 标准答案：保存、读取、一致率与十道闸门；不起真评委。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Anchor, agreement, anchorsDir, assertAnchorsReady, loadAnchors, saveAnchor } from "../src/anchors.ts";

let tmp = "";
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-anchors-")); process.env.SJ_ANCHORS_DIR = tmp; });
afterEach(() => { delete process.env.SJ_ANCHORS_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

const anchor = (id: string, owner: Partial<Anchor["owner"]>, judge: Partial<Anchor["judge"]>): Anchor => ({
  id, client: "claude", file: `C:/x/${id}.jsonl`, judgedAt: "2026-09-08T00:00:00.000Z",
  owner: { M1: "符合", M2: "符合", M3: "符合", M4: "符合", J1: "符合", J2: "符合", J3: "符合", J4: "符合", ...owner },
  judge: { M1: "符合", M2: "符合", M3: "符合", M4: "符合", J1: "符合", J2: "符合", J3: "符合", J4: "符合", ...judge },
});

describe("anchors", () => {
  test("目录来自环境变量", () => { expect(anchorsDir()).toBe(tmp); });
  test("保存后能读回", () => {
    saveAnchor(anchor("a", {}, {}));
    const list = loadAnchors();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("a");
  });
  test("一致率只比 8 格", () => {
    const r = agreement([anchor("a", { J1: "不符合" }, {}), anchor("b", {}, { M2: "不符合", J3: "判不了" })]);
    expect(r.cells).toBe(16);
    expect(r.matched).toBe(13);
    expect(r.rate).toBeCloseTo(13 / 16);
  });
  test("不足十道抛错", () => {
    expect(() => assertAnchorsReady([anchor("a", {}, {})])).toThrow("标准答案不足：现有 1 道，至少 10 道");
    const ten = Array.from({ length: 10 }, (_, i) => anchor(`s${i}`, {}, {}));
    expect(() => assertAnchorsReady(ten)).not.toThrow();
  });
  test("saveAnchor 遇到已有同 id 文件时拒绝覆盖，加 force 才允许", () => {
    saveAnchor(anchor("dup", {}, {}));
    expect(() => saveAnchor(anchor("dup", { J1: "不符合" }, {}))).toThrow(
      `已有标准答案：${path.join(tmp, "dup.json")}；要覆盖请加 --force`,
    );
    // 拒绝覆盖时文件内容保持第一次落盘的样子。
    const kept = JSON.parse(fs.readFileSync(path.join(tmp, "dup.json"), "utf8"));
    expect(kept.owner.J1).toBe("符合");
    // 传 force=true 才允许覆盖。
    saveAnchor(anchor("dup", { J1: "不符合" }, {}), true);
    const overwritten = JSON.parse(fs.readFileSync(path.join(tmp, "dup.json"), "utf8"));
    expect(overwritten.owner.J1).toBe("不符合");
  });

  test("loadAnchors 遇到损坏的 JSON 文件时报出文件名，不吞掉", () => {
    const bad = path.join(tmp, "broken.json");
    fs.writeFileSync(bad, "{not valid json");
    expect(() => loadAnchors()).toThrow(`标准答案文件损坏：${bad}`);
  });

  test("双方都缺同一格算不一致，不算匹配", () => {
    const a: Anchor = {
      id: "a", client: "claude", file: "C:/x/a.jsonl", judgedAt: "2026-09-08T00:00:00.000Z",
      // J3 在 owner 和 judge 里都缺失
      owner: { M1: "符合", M2: "符合", M3: "符合", M4: "符合", J1: "符合", J2: "符合", J4: "符合" },
      judge: { M1: "符合", M2: "符合", M3: "符合", M4: "符合", J1: "符合", J2: "符合", J4: "符合" },
    };
    const r = agreement([a]);
    expect(r.cells).toBe(8);
    expect(r.matched).toBe(7);
  });
});
