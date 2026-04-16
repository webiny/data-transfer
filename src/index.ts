/**
 * Public API for config file authors.
 *
 * ```typescript
 * import { createDdbTransfer } from "@webiny/data-transfer";
 *
 * export default createDdbTransfer({ ... });
 * ```
 */
export { createDdbTransfer } from "./features/MigrationConfig/createDdbTransfer.ts";
export { createOsTransfer } from "./features/MigrationConfig/createOsTransfer.ts";
export { loadEnv } from "./utils/load-env.ts";
