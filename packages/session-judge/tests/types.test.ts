// tagCommand：push/test 标记之外新增的 write 标记（真写文件的 shell 命令）。
import { describe, expect, test } from "bun:test";
import { tagCommand } from "../src/types.ts";

describe("tagCommand write 标记", () => {
  test("重定向 > 与 >> 标记为 write", () => {
    expect(tagCommand("cat > C:/repo/src/a.ts <<'EOF'")).toContain("write");
    expect(tagCommand("cat >> C:/Workspace/desk/70-工作日志/x.md <<'EOF'")).toContain("write");
  });
  test("2>、2>&1、&>、/dev/null 目标不算 write", () => {
    expect(tagCommand("echo hi 2>/dev/null")).not.toContain("write");
    expect(tagCommand("git pull -q 2>&1 | tail -2")).not.toContain("write");
    expect(tagCommand("cmd &> /dev/null")).not.toContain("write");
  });
  test("sed -i / tee / writeFileSync 也标记为 write", () => {
    expect(tagCommand("sed -i 's/a/b/' C:/repo/src/a.ts")).toContain("write");
    expect(tagCommand("echo hi | tee C:/repo/src/a.ts")).toContain("write");
    expect(tagCommand("node -e 'fs.writeFileSync(\"x\")'")).toContain("write");
  });
  test("单纯 git push / bun test 不带 write（没有真写文件的痕迹）", () => {
    expect(tagCommand("git push -q origin main")).not.toContain("write");
    expect(tagCommand("bun test")).not.toContain("write");
  });
  test("=> 与 -> 不是重定向，不算 write（字符串里的箭头、比较运算符会误伤）", () => {
    expect(tagCommand('grep -rn "=>" src')).not.toContain("write");
    expect(tagCommand('echo "(x)=>x+1"')).not.toContain("write");
  });
  test("真实重定向到看起来像路径的目标仍算 write", () => {
    expect(tagCommand("cat > out.txt")).toContain("write");
    expect(tagCommand("printf x >> ./a/b.md")).toContain("write");
  });
});
