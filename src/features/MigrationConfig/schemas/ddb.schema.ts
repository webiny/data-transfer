import { z } from "zod";
import {
    credentialsOrProviderSchema,
    pipelineSettingsSchema,
    tuningSchema
} from "./shared.schema.ts";

const ddbAccountConfigSchema = z.object({
    region: z.string(),
    // Required. Either a literal credentials object, or a provider
    // function (e.g. fromAwsProfile({profile: "dev"})).
    credentials: credentialsOrProviderSchema,
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
