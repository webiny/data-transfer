import { osTransferInputSchema, type OsTransferInput } from "./schemas/os.schema.ts";
import type { OsMigrationConfiguration } from "./validation.ts";

/**
 * Create an OpenSearch transfer configuration.
 *
 * Validates the input at creation time and returns a typed config
 * with `storage: "os"` set automatically.
 *
 * @example
 * ```typescript
 * import { createOsConfig } from "@webiny/data-transfer";
 *
 * export default createOsConfig({
 *   source: {
 *     region: "us-east-1",
 *     credentials: { accessKeyId: "...", secretAccessKey: "..." },
 *     dynamodb: { tableName: "webiny-v5-table" },
 *     opensearch: { tableName: "webiny-v5-es-table" }
 *   },
 *   target: {
 *     region: "us-east-1",
 *     credentials: { accessKeyId: "...", secretAccessKey: "..." },
 *     opensearch: {
 *       endpoint: "https://search-xxx.us-east-1.es.amazonaws.com",
 *       tableName: "webiny-v6-es-table",
 *       service: "opensearch",
 *       indexPrefix: ""    // empty string = no prefix
 *     }
 *   },
 *   pipeline: { preset: "v5-to-v6-os", segments: 4 }
 * });
 * ```
 */
export function createOsConfig(input: OsTransferInput): OsMigrationConfiguration {
    const parsed = osTransferInputSchema.parse(input);
    return {
        storage: "os",
        ...parsed
    };
}
