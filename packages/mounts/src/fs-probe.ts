// 真实文件系统的 PathProbe 实现，以及符号链接的创建与移除；只有执行层用它。
import fs from "node:fs";
import type { MountType, PathProbe } from "./contract.ts";
import { toSlash } from "./paths.ts";

export function fileSystemProbe(): PathProbe {
  return {
    kind(absolutePath) {
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(absolutePath);
      } catch {
        return "missing";
      }
      if (stat.isSymbolicLink()) return "symlink";
      if (stat.isFile()) return "file";
      if (stat.isDirectory()) return "dir";
      return "other";
    },
    realpath(absolutePath) {
      try {
        return toSlash(fs.realpathSync.native(absolutePath));
      } catch {
        return null;
      }
    },
  };
}

/** 创建符号链接；Windows 上目录链接没有权限时退回 junction（同样能被 realpath 解析）。 */
export function createLink(source: string, target: string, type: MountType): void {
  fs.mkdirSync(toSlash(target).slice(0, toSlash(target).lastIndexOf("/")), { recursive: true });
  if (type === "file") {
    fs.symlinkSync(source, target, "file");
    return;
  }
  try {
    fs.symlinkSync(source, target, "dir");
  } catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") {
      fs.symlinkSync(source, target, "junction");
      return;
    }
    throw error;
  }
}

/** 只移除符号链接本身，绝不递归删除指向的内容；Windows 目录链接要用 rmdir。 */
export function removeLink(target: string): void {
  if (!fs.lstatSync(target).isSymbolicLink()) throw new Error(`拒绝移除非符号链接：${target}`);
  try {
    fs.unlinkSync(target);
  } catch {
    fs.rmdirSync(target);
  }
}
