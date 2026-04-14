import { z } from "zod";

// ============================================================================
// Auth Schemas
// ============================================================================

const basicAuthSchema = z.object({
  type: z.literal("basic"),
  username: z.string(),
  password: z.string()
});

const awsAuthSchema = z.object({
  type: z.literal("aws"),
  region: z.string(),
  service: z.enum(["opensearch", "opensearch-serverless"]),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional()
});

const opensearchAuthSchema = z.discriminatedUnion("type", [
  basicAuthSchema,
  awsAuthSchema
]);

// ============================================================================
// Shared Schemas
// ============================================================================

const awsCredentialsSchema = z.object({
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional()
});

const accountConfigSchema = z.object({
  region: z.string(),
  credentials: awsCredentialsSchema.optional(),
  dynamodb: z.object({ tableName: z.string() }),
  s3: z.object({ bucket: z.string() })
});

const opensearchTargetConfigSchema = z.object({
  endpoint: z.string().url(),
  tableName: z.string(),
  auth: opensearchAuthSchema
});

const targetAccountConfigSchema = accountConfigSchema.extend({
  opensearch: opensearchTargetConfigSchema
});

const migrationSettingsSchema = z.object({
  preset: z.string(),
  segments: z.number().int().positive().optional(),
  modelsDir: z.string().optional()
});

// ============================================================================
// Discriminated Union
// ============================================================================

const ddbConfigSchema = z.object({
  storage: z.literal("ddb"),
  source: accountConfigSchema,
  target: accountConfigSchema,
  migration: migrationSettingsSchema
});

const ddbOsConfigSchema = z.object({
  storage: z.literal("ddb-os"),
  source: accountConfigSchema,
  target: targetAccountConfigSchema,
  migration: migrationSettingsSchema
});

export const migrationConfigSchema = z.discriminatedUnion("storage", [
  ddbConfigSchema,
  ddbOsConfigSchema
]);

// ============================================================================
// Inferred Types
// ============================================================================

export type MigrationConfiguration = z.infer<typeof migrationConfigSchema>;
export type DdbMigrationConfiguration = z.infer<typeof ddbConfigSchema>;
export type DdbOsMigrationConfiguration = z.infer<typeof ddbOsConfigSchema>;
export type AccountConfiguration = z.infer<typeof accountConfigSchema>;
export type TargetAccountConfiguration = z.infer<typeof targetAccountConfigSchema>;
export type StorageType = MigrationConfiguration["storage"];
export type OpenSearchTargetConfig = z.infer<typeof opensearchTargetConfigSchema>;
