import { z } from "zod";

// ============================================================================
// Shared Schemas
// ============================================================================

const awsCredentialsSchema = z.object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    sessionToken: z.string().optional()
});

const migrationSettingsSchema = z.object({
    preset: z.string(),
    segments: z.number().int().positive().optional(),
    modelsDir: z.string().optional()
});

// ============================================================================
// DDB Account Schema
// ============================================================================

const ddbAccountConfigSchema = z.object({
    region: z.string(),
    credentials: awsCredentialsSchema,
    dynamodb: z.object({ tableName: z.string() }),
    s3: z.object({ bucket: z.string() })
});

// ============================================================================
// OS Account Schemas
// ============================================================================

const osSourceAccountConfigSchema = z.object({
    region: z.string(),
    credentials: awsCredentialsSchema,
    dynamodb: z.object({ tableName: z.string() }),
    opensearch: z.object({ tableName: z.string() })
});

const osTargetAccountConfigSchema = z.object({
    region: z.string(),
    credentials: awsCredentialsSchema,
    opensearch: z.object({
        endpoint: z.url(),
        tableName: z.string(),
        service: z.enum(["opensearch", "opensearch-serverless"])
    })
});

// ============================================================================
// Discriminated Union
// ============================================================================

const ddbConfigSchema = z.object({
    storage: z.literal("ddb"),
    source: ddbAccountConfigSchema,
    target: ddbAccountConfigSchema,
    migration: migrationSettingsSchema
});

const osConfigSchema = z.object({
    storage: z.literal("os"),
    source: osSourceAccountConfigSchema,
    target: osTargetAccountConfigSchema,
    migration: migrationSettingsSchema
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
export type DdbAccountConfiguration = z.infer<typeof ddbAccountConfigSchema>;
export type OsSourceAccountConfiguration = z.infer<typeof osSourceAccountConfigSchema>;
export type OsTargetAccountConfiguration = z.infer<typeof osTargetAccountConfigSchema>;
export type StorageType = MigrationConfiguration["storage"];
