// PublicTreeAssessment seam 的消费者可观察行为：全部用合成 tree、合成路径与合成内容。
import { describe, expect, test } from "bun:test";
import { deflateRawSync, gzipSync } from "node:zlib";
import { assessPublicTree, hashToken, type PublicTreeAssessment, type TreeEntry, type TreeEntryKind, type ViolationCode } from "../src/index.ts";

const encoder = new TextEncoder();

function entry(path: string, content: string | Uint8Array, kind: TreeEntryKind = "blob"): TreeEntry {
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  return { path, kind, size: bytes.length, read: () => bytes };
}

function policy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    allowedPaths: ["docs/", "src/", "README.md", "tests/"],
    deniedPaths: ["*.log", "**/node_modules/", "runtime/", "*.sqlite"],
    contentExemptPaths: ["tests/fixtures/negative/"],
    deniedTokenHashes: [],
    maxFileBytes: 64,
    largeFileAllowlist: ["docs/big.bin"],
    archiveMaxDepth: 2,
    ...overrides,
  };
}

function assess(entries: TreeEntry[], rawPolicy: unknown = policy()): PublicTreeAssessment {
  return assessPublicTree(entries, rawPolicy);
}

function codes(result: PublicTreeAssessment): ViolationCode[] {
  return result.violations.map((violation) => violation.code);
}

function expectBlocked(result: PublicTreeAssessment, code: ViolationCode, path?: string): void {
  expect(result.status).toBe("blocked");
  expect(codes(result)).toContain(code);
  if (path !== undefined) expect(result.violations.some((v) => v.code === code && v.path === path)).toBe(true);
}

/** 用 stored 方法手工拼一个最小 zip；成员名与内容都是合成的。 */
function zip(members: { name: string; bytes: Uint8Array; deflate?: boolean }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const member of members) {
    const name = encoder.encode(member.name);
    const data = member.deflate ? new Uint8Array(deflateRawSync(member.bytes)) : member.bytes;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, member.deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, member.bytes.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, member.deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, member.bytes.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, members.length, true);
  ev.setUint16(10, members.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return concat([...parts, ...central, eocd]);
}

/** 手工拼一个 ustar tar；typeflag 可指定以构造符号链接成员。 */
function tar(members: { name: string; bytes: Uint8Array; typeflag?: string }[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const member of members) {
    const header = new Uint8Array(512);
    header.set(encoder.encode(member.name).subarray(0, 100), 0);
    header.set(encoder.encode("0000644\0"), 100);
    header.set(encoder.encode("0000000\0"), 108);
    header.set(encoder.encode("0000000\0"), 116);
    header.set(encoder.encode(`${member.bytes.length.toString(8).padStart(11, "0")}\0`), 124);
    header.set(encoder.encode("00000000000\0"), 136);
    header.set(encoder.encode("        "), 148);
    header.set(encoder.encode(member.typeflag ?? "0"), 156);
    header.set(encoder.encode("ustar\0"), 257);
    header.set(encoder.encode("00"), 263);
    const checksum = header.reduce((sum, b) => sum + b, 0);
    header.set(encoder.encode(`${checksum.toString(8).padStart(6, "0")}\0 `), 148);
    const padded = new Uint8Array(Math.ceil(member.bytes.length / 512) * 512);
    padded.set(member.bytes);
    blocks.push(header, padded);
  }
  blocks.push(new Uint8Array(1024));
  return concat(blocks);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

describe("策略校验", () => {
  test("缺字段、多字段与空 allowlist 都是 policy-invalid", () => {
    expectBlocked(assess([], policy({ extra: true })), "policy-invalid");
    expectBlocked(assess([], policy({ allowedPaths: [] })), "policy-invalid");
    expectBlocked(assess([], { version: 1 }), "policy-invalid");
    expectBlocked(assess([], null), "policy-invalid");
  });
});

describe("路径与类型规则", () => {
  test("只含抽象名称与合成内容的 tree 通过", () => {
    const result = assess([entry("README.md", "synthetic readme"), entry("src/alpha.ts", "export const alpha = 1;")]);
    expect(result).toEqual({ status: "allowed", violations: [], scanned: 2 });
  });

  test("symlink 与 gitlink 一律拒绝", () => {
    expectBlocked(assess([entry("src/link", "../outside", "symlink")]), "symlink", "src/link");
    expectBlocked(assess([entry("src/sub", "", "gitlink")]), "gitlink", "src/sub");
  });

  test("仓外路径拒绝", () => {
    expectBlocked(assess([entry("../escape.md", "x")]), "path-outside-repo");
    expectBlocked(assess([entry("/abs.md", "x")]), "path-outside-repo");
    expectBlocked(assess([entry("src/../x.md", "x")]), "path-outside-repo");
  });

  test("不在 allowlist 的路径拒绝", () => {
    expectBlocked(assess([entry("secrets/plain.md", "x")]), "path-not-allowlisted", "secrets/plain.md");
    expectBlocked(assess([entry("README.md.bak", "x")]), "path-not-allowlisted");
  });

  test("denylist 命中拒绝：后缀、任意层目录、目录前缀", () => {
    expectBlocked(assess([entry("src/run.log", "x")]), "path-denied", "src/run.log");
    expectBlocked(assess([entry("src/node_modules/x/index.js", "x")]), "path-denied");
    expectBlocked(assess([entry("runtime/state.json", "x")]), "path-denied");
    expectBlocked(assess([entry("docs/data.sqlite", "x")]), "path-denied");
  });

  test("大文件必须在 largeFileAllowlist 里，且内容照样扫描", () => {
    const big = "a".repeat(100);
    expectBlocked(assess([entry("docs/huge.txt", big)]), "large-file", "docs/huge.txt");
    expect(assess([entry("docs/big.bin", big)]).status).toBe("allowed");
    const result = assess([entry("docs/big.bin", `${big} ghp_${"A".repeat(30)}`)]);
    expectBlocked(result, "credential", "docs/big.bin");
    expect(codes(result)).not.toContain("large-file");
  });
});

describe("内容规则", () => {
  test.each([
    ["private-key", "-----BEGIN RSA PRIVATE KEY-----"],
    ["github-token", `token ghp_${"x".repeat(36)}`],
    ["provider-key", `sk-${"a".repeat(40)}`],
    ["aws-access-key", "AKIAABCDEFGHIJKLMNOP"],
    ["assigned-secret", 'api_key = "abcdefghijklmnop"'],
  ])("凭据形状 %s 被拒绝", (name, text) => {
    const result = assess([entry("src/config.ts", text)]);
    expectBlocked(result, "credential");
    expect(result.violations.some((v) => v.detail === name)).toBe(true);
  });

  test("本机路径被拒绝", () => {
    expectBlocked(assess([entry("docs/a.md", "see /Users/someone/work/x")]), "local-path");
    expectBlocked(assess([entry("docs/a.md", "see /home/someone/x/")]), "local-path");
    expectBlocked(assess([entry("docs/a.md", "see C:\\Users\\someone\\x")]), "local-path");
    expectBlocked(assess([entry("docs/a.md", "see D:/Users/someone/x")]), "local-path");
  });

  test("内网地址与内部主机名被拒绝", () => {
    expectBlocked(assess([entry("docs/a.md", "host 10.1.2.3")]), "internal-address");
    expectBlocked(assess([entry("docs/a.md", "host 192.168.0.9")]), "internal-address");
    expectBlocked(assess([entry("docs/a.md", "host 172.16.5.5")]), "internal-address");
    expectBlocked(assess([entry("docs/a.md", "gateway.example.corp")]), "internal-address");
    expect(assess([entry("docs/a.md", "host 8.8.8.8 and 172.32.0.1")]).status).toBe("allowed");
  });

  test("业务标识按哈希拒绝，大小写不敏感，明文不出现在策略里", () => {
    const withToken = policy({ deniedTokenHashes: [hashToken("AcmeFreightCo")] });
    const result = assess([entry("docs/a.md", "the acmefreightco pipeline")], withToken);
    expectBlocked(result, "denied-token", "docs/a.md");
    expect(result.violations[0]?.detail).not.toContain("acme");
    expect(assess([entry("docs/a.md", "the other pipeline")], withToken).status).toBe("allowed");
  });

  test("内容豁免路径只免内容规则，不免路径与大小规则", () => {
    const secret = `ghp_${"x".repeat(36)}`;
    expect(assess([entry("tests/fixtures/negative/token.txt", secret)]).status).toBe("allowed");
    expectBlocked(assess([entry("tests/fixtures/negative/big.txt", "b".repeat(100))]), "large-file");
    expectBlocked(assess([entry("tests/fixtures/negative/run.log", secret)]), "path-denied");
  });

  test("读取失败按 content-unreadable 拒绝", () => {
    const broken: TreeEntry = { path: "src/x.ts", kind: "blob", size: 1, read: () => { throw new Error("io"); } };
    expectBlocked(assess([broken]), "content-unreadable", "src/x.ts");
  });
});

describe("归档规则", () => {
  const roomy = policy({ maxFileBytes: 1_000_000 });
  const secret = encoder.encode(`ghp_${"y".repeat(36)}`);
  const clean = encoder.encode("plain synthetic text");

  test("zip 成员内容被扫描（stored 与 deflate）", () => {
    expectBlocked(assess([entry("docs/bundle.zip", zip([{ name: "inner.txt", bytes: secret }]))], roomy), "credential", "docs/bundle.zip!inner.txt");
    expectBlocked(assess([entry("docs/bundle.zip", zip([{ name: "inner.txt", bytes: secret, deflate: true }]))], roomy), "credential");
    expect(assess([entry("docs/bundle.zip", zip([{ name: "inner.txt", bytes: clean }]))], roomy).status).toBe("allowed");
  });

  test("改了扩展名的归档照样按内容识别", () => {
    expectBlocked(assess([entry("docs/notes.md", zip([{ name: "inner.txt", bytes: secret }]))], roomy), "credential", "docs/notes.md!inner.txt");
  });

  test("tar 与 tar.gz 成员被扫描，tar 里的符号链接被拒绝", () => {
    const t = tar([{ name: "inner.txt", bytes: secret }]);
    expectBlocked(assess([entry("docs/bundle.tar", t)], roomy), "credential", "docs/bundle.tar!inner.txt");
    expectBlocked(assess([entry("docs/bundle.tgz", new Uint8Array(gzipSync(t)))], roomy), "credential");
    expectBlocked(assess([entry("docs/bundle.tar", tar([{ name: "link", bytes: new Uint8Array(0), typeflag: "2" }]))], roomy), "symlink");
  });

  test("归档成员的路径与 denylist 规则也生效", () => {
    expectBlocked(assess([entry("docs/bundle.zip", zip([{ name: "../escape.txt", bytes: clean }]))], roomy), "path-outside-repo");
    expectBlocked(assess([entry("docs/bundle.zip", zip([{ name: "trace.log", bytes: clean }]))], roomy), "path-denied");
  });

  test("嵌套超过上限按 archive-too-deep 拒绝，不跳过", () => {
    const inner = zip([{ name: "inner.txt", bytes: clean }]);
    const twoDeep = zip([{ name: "inner.zip", bytes: inner }]);
    expect(assess([entry("docs/two.zip", twoDeep)], roomy).status).toBe("allowed");
    const threeDeep = zip([{ name: "two.zip", bytes: twoDeep }]);
    expectBlocked(assess([entry("docs/three.zip", threeDeep)], roomy), "archive-too-deep");
  });

  test("解不开的归档按 archive-unreadable 拒绝", () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expectBlocked(assess([entry("docs/broken.zip", broken)], roomy), "archive-unreadable", "docs/broken.zip");
    const gz = new Uint8Array([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
    expectBlocked(assess([entry("docs/broken.gz", gz)], roomy), "archive-unreadable");
  });

  test("豁免路径下的归档仍然被打开，只有文本规则豁免", () => {
    const withLog = zip([{ name: "trace.log", bytes: clean }]);
    expectBlocked(assess([entry("tests/fixtures/negative/a.zip", withLog)], roomy), "path-denied");
    expect(assess([entry("tests/fixtures/negative/b.zip", zip([{ name: "inner.txt", bytes: secret }]))], roomy).status).toBe("allowed");
  });
});
