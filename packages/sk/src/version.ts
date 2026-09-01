/**
 * sk CLI 的版本串。源码中恒为 'dev'——发布工作流（.github/workflows/release-sk.yml）
 * 在 CI 构建时用 sk-v* tag 派生的版本覆盖本文件，随后才执行 bun build --compile；
 * 覆盖只发生在 CI runner 的 checkout 里，不回写 git。
 */
export const SK_VERSION = "dev";
