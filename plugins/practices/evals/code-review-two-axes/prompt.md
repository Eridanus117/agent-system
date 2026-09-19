---
description: 正例：固定点、diff、spec、标准都给了；报告分标准与 spec 两轴，违例与判断题分开标，各轴各自小结
tags: [code-review, positive]
max_turns: 15
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent]
append_system_prompt: |
  你是主人的工作助理。中文回复；代码标识符、路径、命令、报错原文不翻译。
  说话的规矩：
  - 一轮只问一题，先给具体例子再问，说平语不用黑话。
  - 按业界实践做，并说出用的是哪条（附英文名）。
  - 区分事实、推断与已观察的结果；能查清的事实自己查。
  改代码的授权不含 push、合并、发布或外发。
---

按 `practices:code-review` 审这条分支，固定点是 `main`。git 不可用，下面是 `git log main..HEAD --oneline`、`git diff main...HEAD` 的完整输出、spec（issue #42 正文）和仓的 `CONTRIBUTING.md` 节选。

`git log main..HEAD --oneline`：

```
b3e1f2a notes export：打包 .md 到 zip（#42）
```

`CONTRIBUTING.md` 节选：

```
## 代码标准
- 注释用中文。
- 导出的函数必须有 JSDoc。
- 错误一律抛 `AppError` 的子类，不抛裸 `Error`。
```

issue #42 正文：

```
## 要做的
`notes export` 子命令：把笔记目录下所有 `.md` 打包成一个 zip 到指定路径。
1. 支持 `--out <path>`，缺省 `./notes.zip`。
2. 跳过 `.trash/` 目录。
3. 完成后打印打包的文件数与 zip 的大小。
```

`git diff main...HEAD`：

```diff
diff --git a/src/commands/export.ts b/src/commands/export.ts
new file mode 100644
--- /dev/null
+++ b/src/commands/export.ts
@@ -0,0 +1,44 @@
+import { readdirSync, statSync, existsSync } from "node:fs";
+import { join } from "node:path";
+import { zip } from "../lib/zip";
+import { notesDir } from "../config";
+
+export async function exportNotes(opts: { out?: string; gzipLevel?: number }) {
+  const out = opts.out ?? "./notes.zip";
+  if (existsSync(out)) {
+    throw new Error("out path exists: " + out);
+  }
+  // collect files
+  const md: string[] = [];
+  for (const name of readdirSync(notesDir)) {
+    const p = join(notesDir, name);
+    if (statSync(p).isDirectory()) {
+      for (const inner of readdirSync(p)) {
+        if (inner.endsWith(".md")) md.push(join(p, inner));
+      }
+    } else if (name.endsWith(".md")) {
+      md.push(p);
+    }
+  }
+  const markdown: string[] = [];
+  for (const name of readdirSync(notesDir)) {
+    const p = join(notesDir, name);
+    if (statSync(p).isDirectory()) {
+      for (const inner of readdirSync(p)) {
+        if (inner.endsWith(".markdown")) markdown.push(join(p, inner));
+      }
+    } else if (name.endsWith(".markdown")) {
+      markdown.push(p);
+    }
+  }
+  const files = [...md, ...markdown];
+  await zip(files, out, { level: opts.gzipLevel ?? 6 });
+  console.log(`已打包 ${files.length} 个文件`);
+}
diff --git a/src/cli.ts b/src/cli.ts
--- a/src/cli.ts
+++ b/src/cli.ts
@@ -12,6 +12,11 @@ program
+program
+  .command("export")
+  .option("--out <path>", "输出路径")
+  .option("--gzip-level <n>", "压缩等级 0-9", Number)
+  .action((o) => exportNotes(o));
```
