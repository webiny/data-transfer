/**
 * Public API for config file authors.
 *
 * Usage in migration config files:
 *
 * ```typescript
 * import { createDdbTransfer } from "webiny-v5-to-v6";
 *
 * export default createDdbTransfer({ ... });
 * ```
 */
export { createDdbTransfer } from "./features/MigrationConfig/createDdbTransfer.ts";
export { createOsTransfer } from "./features/MigrationConfig/createOsTransfer.ts";
