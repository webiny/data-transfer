import { z } from "zod";
import { awsCredentialsSchema, pipelineSettingsSchema, tuningSchema } from "./shared.schema.ts";

const ddbAccountConfigSchema = z.object({
    region: z.string(),
    credentials: awsCredentialsSchema,
    dynamodb: z.object({ tableName: z.string() }),
    s3: z.object({ bucket: z.string() })
});

export const ddbTransferInputSchema = z.object({
    source: ddbAccountConfigSchema,
    target: ddbAccountConfigSchema,
    pipeline: pipelineSettingsSchema,
    tuning: tuningSchema
});

export type DdbTransferInput = z.infer<typeof ddbTransferInputSchema>;
