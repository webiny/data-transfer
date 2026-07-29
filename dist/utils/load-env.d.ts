/**
 * Load environment variables from a `.env` file located in the same
 * directory as the calling config file.
 *
 * Uses `fileURLToPath` internally, so it works correctly on Windows
 * (handles `file:///C:/...` paths).
 *
 * @example
 * ```typescript
 * import { loadEnv, createConfig } from "@webiny/data-transfer";
 *
 * loadEnv(import.meta.url);
 *
 * export default createConfig({ ... });
 * ```
 */
export declare function loadEnv(importMetaUrl: string): void;
//# sourceMappingURL=load-env.d.ts.map
