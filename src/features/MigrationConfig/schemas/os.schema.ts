import { z } from "zod";
import { awsCredentialsSchema, pipelineSettingsSchema, tuningSchema } from "./shared.schema.ts";

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

export const osTransferInputSchema = z.object({
    source: osSourceAccountConfigSchema,
    target: osTargetAccountConfigSchema,
    pipeline: pipelineSettingsSchema,
    tuning: tuningSchema
});

export type OsTransferInput = z.infer<typeof osTransferInputSchema>;
