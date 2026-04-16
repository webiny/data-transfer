import { z } from "zod";
import { awsCredentialsSchema, migrationSettingsSchema } from "./shared.schema.ts";

const ddbAccountConfigSchema = z.object({
    region: z.string(),
    credentials: awsCredentialsSchema,
    dynamodb: z.object({ tableName: z.string() }),
    s3: z.object({ bucket: z.string() })
});

export const ddbTransferInputSchema = z.object({
    source: ddbAccountConfigSchema,
    target: ddbAccountConfigSchema,
    migration: migrationSettingsSchema
});

export type DdbTransferInput = z.infer<typeof ddbTransferInputSchema>;
