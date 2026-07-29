import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
export function loadEnv(importMetaUrl) {
  const dir = dirname(fileURLToPath(importMetaUrl));
  config({ path: resolve(dir, ".env") });
}
//# sourceMappingURL=load-env.js.map
