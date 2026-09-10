// 造场景动词：题的 setup.ts 只按顺序调用这些动词，不自己碰 git。
// 安全规则：work/ 的 origin 永远指向运行目录里的裸仓，run.ts 起会话前调 assertOriginIsBare。
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { git } from "./git.ts";
import type { StoryMeta } from "./story.ts";

export interface SetupCtx {
  runDir: string;
  workDir: string;
  workspaceRoot: string;
  meta: StoryMeta;
}

export interface SetupVerbs {
  checkoutRepo(): void;
  bareRemote(): void;
  linkNodeModules(): void;
  writeFile(rel: string, text: string): void;
}

export function bareDirOf(runDir: string): string {
  return path.join(runDir, "remote.git");
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).replaceAll("\\", "/").toLowerCase() === path.resolve(b).replaceAll("\\", "/").toLowerCase();
}

export function assertOriginIsBare(workDir: string, bareDir: string): void {
  let url = "";
  try { url = git(["remote", "get-url", "origin"], workDir).trim(); } catch { /* 没有 origin 也算不合格 */ }
  if (!url || !samePath(url, bareDir)) {
    throw new Error(`场景仓的 origin 不是运行目录里的裸仓（现在是「${url || "无"}」），拒绝起会话`);
  }
}

export function setupVerbsFor(ctx: SetupCtx): SetupVerbs {
  const src = path.join(ctx.workspaceRoot, ctx.meta.repo);
  return {
    checkoutRepo() {
      if (!existsSync(path.join(src, ".git"))) throw new Error(`找不到源仓：${src}`);
      mkdirSync(path.dirname(ctx.workDir), { recursive: true });
      git(["clone", "-q", "--no-hardlinks", src, ctx.workDir], ctx.runDir);
      // 检出固定 commit 到 main 分支上，让被测 agent 看到的仓形状和平时一样。
      git(["checkout", "-q", "-B", "main", ctx.meta.commit], ctx.workDir);
    },
    bareRemote() {
      const bare = bareDirOf(ctx.runDir);
      git(["init", "-q", "--bare", bare], ctx.runDir);
      git(["remote", "set-url", "origin", bare], ctx.workDir);
      git(["push", "-q", "-u", "origin", "main"], ctx.workDir);
    },
    linkNodeModules() {
      const from = path.join(src, "node_modules");
      const to = path.join(ctx.workDir, "node_modules");
      if (!existsSync(from) || existsSync(to)) return;
      symlinkSync(from, to, "junction");
    },
    writeFile(rel, text) {
      const full = path.join(ctx.workDir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text, "utf8");
    },
  };
}
