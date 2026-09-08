// 从 git 对象库读取某个 rev 的最终 tree：条目来自 `git ls-tree`，内容来自一次 `git cat-file --batch`。
// 不读工作目录，所以未跟踪、被忽略或只在磁盘上的内容都不会影响评估。
import { spawnSync } from "node:child_process";
import type { TreeEntry, TreeEntryKind } from "./contract.ts";

const MAX_BUFFER = 1 << 30;

function runGit(repoDir: string, args: string[], input?: string): Buffer {
  const result = spawnSync("git", args, { cwd: repoDir, input, maxBuffer: MAX_BUFFER });
  if (result.error) throw new Error(`git ${args[0]} 无法启动：${result.error.message}`);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 失败：${result.stderr.toString("utf8").trim()}`);
  return result.stdout;
}

function kindOf(mode: string, type: string): TreeEntryKind {
  if (type === "commit" || mode === "160000") return "gitlink";
  if (mode === "120000") return "symlink";
  if (mode === "100755") return "executable";
  return "blob";
}

/** 读取 rev 的整棵 tree；blob 内容一次性批量取回，避免每个文件起一个子进程。 */
export function loadGitTree(repoDir: string, rev: string): TreeEntry[] {
  const listing = runGit(repoDir, ["ls-tree", "-r", "-l", "-z", rev]).toString("utf8");
  const records = listing.split("\0").filter((line) => line.length > 0);
  const parsed = records.map((record) => {
    const tab = record.indexOf("\t");
    const [mode = "", type = "", sha = "", size = "-"] = record.slice(0, tab).trim().split(/\s+/);
    return { mode, type, sha, size: size === "-" ? 0 : Number(size), path: record.slice(tab + 1) };
  });
  const shas = [...new Set(parsed.filter((item) => item.type === "blob").map((item) => item.sha))];
  const blobs = new Map<string, Uint8Array>();
  if (shas.length > 0) {
    const out = runGit(repoDir, ["cat-file", "--batch"], `${shas.join("\n")}\n`);
    let cursor = 0;
    while (cursor < out.length) {
      const newline = out.indexOf(0x0a, cursor);
      if (newline < 0) break;
      const header = out.subarray(cursor, newline).toString("utf8").split(" ");
      const sha = header[0] ?? "";
      if (header[1] === "missing") throw new Error(`git 对象缺失：${sha}`);
      const size = Number(header[2]);
      const start = newline + 1;
      blobs.set(sha, new Uint8Array(out.subarray(start, start + size)));
      cursor = start + size + 1;
    }
  }
  return parsed.map((item) => ({
    path: item.path,
    kind: kindOf(item.mode, item.type),
    size: item.size,
    read: () => {
      if (item.type !== "blob") return new Uint8Array(0);
      const bytes = blobs.get(item.sha);
      if (bytes === undefined) throw new Error(`blob 未取回：${item.sha}`);
      return bytes;
    },
  }));
}
