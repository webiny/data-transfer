import { z } from "zod";
import { ddbTransferInputSchema } from "./schemas/ddb.schema.ts";
import { osTransferInputSchema } from "./schemas/os.schema.ts";

// ============================================================================
// Full config schemas (with storage discriminator)
// ============================================================================

const ddbConfigSchema = ddbTransferInputSchema.extend({
    storage: z.literal("ddb")
});

const osConfigSchema = osTransferInputSchema.extend({
    storage: z.literal("os")
});

export const migrationConfigSchema = z.discriminatedUnion("storage", [
    ddbConfigSchema,
    osConfigSchema
]);

// ============================================================================
// Inferred Types
// ============================================================================

export type MigrationConfiguration = z.infer<typeof migrationConfigSchema>;
export type DdbMigrationConfiguration = z.infer<typeof ddbConfigSchema>;
export type OsMigrationConfiguration = z.infer<typeof osConfigSchema>;
