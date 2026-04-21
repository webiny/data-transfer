import { z } from "zod";
import {
    credentialsOrProviderSchema,
    debugSettingsSchema,
    pipelineSettingsSchema,
    trimmedString,
    tuningSchema
} from "./shared.schema.ts";

const osSourceAccountConfigSchema = z.object({
    region: trimmedString(),
    credentials: credentialsOrProviderSchema,
    dynamodb: z.object({ tableName: trimmedString() }),
    opensearch: z.object({ tableName: trimmedString() })
});

const osTargetAccountConfigSchema = z.object({
    region: trimmedString(),
    credentials: credentialsOrProviderSchema,
    opensearch: z.object({
        // Zod's `.url()` doesn't trim — wrap through trimmedString first.
        endpoint: trimmedString().url(),
        tableName: trimmedString(),
        service: z.enum(["opensearch", "opensearch-serverless"])
    })
});

export const osTransferInputSchema = z
    .object({
        source: osSourceAccountConfigSchema,
        target: osTargetAccountConfigSchema,
        pipeline: pipelineSettingsSchema,
        tuning: tuningSchema,
        debug: debugSettingsSchema
    })
    .superRefine((data, ctx) => {
        // Same region + same OS companion DDB table is the classic copy-
        // paste misconfig. Different accounts would technically be safe,
        // but requiring different names (or regions) makes the intent
        // explicit instead of trusting that the user actually meant it.
        if (
            data.source.region === data.target.region &&
            data.source.opensearch.tableName === data.target.opensearch.tableName
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "opensearch", "tableName"],
                message: `Target OpenSearch DDB table "${data.target.opensearch.tableName}" in region "${data.target.region}" matches source. If these are different AWS accounts, rename one or change the target region to make the intent explicit.`
            });
        }
    });

export type OsTransferInput = z.infer<typeof osTransferInputSchema>;
