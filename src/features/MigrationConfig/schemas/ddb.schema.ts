import { z } from "zod";
import {
    credentialsOrProviderSchema,
    debugSettingsSchema,
    pipelineSettingsSchema,
    trimmedString,
    tuningSchema
} from "./shared.schema.ts";

const ddbAccountConfigSchema = z.object({
    region: trimmedString(),
    // Required. Either a literal credentials object, or a provider
    // function (e.g. fromAwsProfile({profile: "dev"})).
    credentials: credentialsOrProviderSchema,
    dynamodb: z.object({ tableName: trimmedString() }),
    s3: z.object({ bucket: trimmedString() })
});

export const ddbTransferInputSchema = z
    .object({
        source: ddbAccountConfigSchema,
        target: ddbAccountConfigSchema,
        pipeline: pipelineSettingsSchema,
        tuning: tuningSchema,
        debug: debugSettingsSchema
    })
    .superRefine((data, ctx) => {
        // S3 bucket names are globally unique — same name means same bucket,
        // regardless of region or account. Writing the transformed stream
        // into the source bucket would overwrite originals.
        if (data.source.s3.bucket === data.target.s3.bucket) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "s3", "bucket"],
                message: `Target S3 bucket "${data.target.s3.bucket}" is the same as source — would overwrite source files. Use a different bucket.`
            });
        }
        // Same region + same table name is the classic copy-paste misconfig.
        // Could technically be safe across different AWS accounts, but
        // requiring different names (or regions) makes the intent explicit
        // instead of trusting that the user actually meant it.
        if (
            data.source.region === data.target.region &&
            data.source.dynamodb.tableName === data.target.dynamodb.tableName
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "dynamodb", "tableName"],
                message: `Target DynamoDB table "${data.target.dynamodb.tableName}" in region "${data.target.region}" matches source. If these are different AWS accounts, rename one or change the target region to make the intent explicit.`
            });
        }
    });

export type DdbTransferInput = z.infer<typeof ddbTransferInputSchema>;
