import { ddbTransferInputSchema, type DdbTransferInput } from "./schemas/ddb.schema.ts";
import type { DdbMigrationConfiguration } from "./validation.ts";

/**
 * Create a DynamoDB transfer configuration.
 *
 * Validates the input at creation time and returns a typed config
 * with `storage: "ddb"` set automatically.
 *
 * @example
 * ```typescript
 * import { createDdbConfig } from "@webiny/data-transfer";
 *
 * export default createDdbConfig({
 *   source: {
 *     region: "us-east-1",
 *     credentials: { accessKeyId: "...", secretAccessKey: "..." },
 *     dynamodb: { tableName: "webiny-v5-table" },
 *     s3: { bucket: "webiny-v5-files" }
 *   },
 *   target: {
 *     region: "us-east-1",
 *     credentials: { accessKeyId: "...", secretAccessKey: "..." },
 *     dynamodb: { tableName: "webiny-v6-table" },
 *     s3: { bucket: "webiny-v6-files" }
 *   },
 *   pipeline: { preset: "v5-to-v6", segments: 4 }
 * });
 * ```
 */
export function createDdbConfig(input: DdbTransferInput): DdbMigrationConfiguration {
    const parsed = ddbTransferInputSchema.parse(input);
    return {
        storage: "ddb",
        ...parsed
    };
}
