// 测试用的合成路径探针：用一张「绝对路径 → 对象」表模拟文件系统，不碰真实磁盘。
import type { PathProbe } from "../src/contract.ts";

export type SyntheticNode = "file" | "dir" | "other" | { link: string };

/** 建一个探针；表里的路径都用正斜杠绝对路径，符号链接的 link 也是绝对路径。 */
export function syntheticProbe(table: Record<string, SyntheticNode>): PathProbe {
  const lookup = (p: string): SyntheticNode | undefined => table[p];
  const resolve = (p: string, depth: number): string | null => {
    if (depth > 32) return null;
    const segments = p.split("/").filter((s) => s !== "");
    let current = "";
    for (let i = 0; i < segments.length; i += 1) {
      current = `${current}/${segments[i]}`;
      const node = lookup(current);
      if (node === undefined) return null;
      if (typeof node === "object") {
        const rest = segments.slice(i + 1);
        const target = rest.length === 0 ? node.link : `${node.link}/${rest.join("/")}`;
        return resolve(target, depth + 1);
      }
    }
    return current === "" ? "/" : current;
  };
  return {
    kind(absolutePath) {
      // 先解析父目录里的符号链接，最后一段不跟随。
      const trimmed = absolutePath.replace(/\/+$/, "");
      const index = trimmed.lastIndexOf("/");
      const parent = index <= 0 ? "/" : trimmed.slice(0, index);
      const base = trimmed.slice(index + 1);
      const parentReal = resolve(parent, 0);
      if (parentReal === null) return "missing";
      const node = lookup(parentReal === "/" ? `/${base}` : `${parentReal}/${base}`);
      if (node === undefined) return "missing";
      if (typeof node === "object") return "symlink";
      return node;
    },
    realpath(absolutePath) {
      return resolve(absolutePath, 0);
    },
  };
}
