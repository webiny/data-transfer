import { z } from "zod";
import {
    credentialsOrProviderSchema,
    debugSettingsSchema,
    pipelineSettingsSchema,
    trimmedString,
    tuningSchema
} from "./shared.schema.ts";

const ddbSourceAccountConfigSchema = z.object({
    region: trimmedString(),
    // Required. Either a literal credentials object, or a provider
    // function (e.g. fromAwsProfile({profile: "dev"})).
    credentials: credentialsOrProviderSchema,
    dynamodb: z.object({ tableName: trimmedString() }),
    s3: z.object({ bucket: trimmedString() })
});

const ddbTargetAccountConfigSchema = ddbSourceAccountConfigSchema.extend({
    // Audit log table config. Set tableName to null to skip audit log
    // transfer — records will be intercepted (blackholed) and NOT written
    // to any target. NOTE: if you want audit logs transferred, you must
    // provide a valid tableName here.
    auditLog: z
        .object({
            dynamodb: z.object({ tableName: trimmedString().nullable() })
        })
        .nullable()
});

export const ddbTransferInputSchema = z
    .object({
        source: ddbSourceAccountConfigSchema,
        target: ddbTargetAccountConfigSchema,
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
        // Audit log table must differ from the main target table to avoid
        // writing audit log records into the primary data table.
        if (
            data.target.auditLog?.dynamodb?.tableName != null &&
            data.target.auditLog.dynamodb.tableName === data.target.dynamodb.tableName
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "auditLog", "dynamodb", "tableName"],
                message: `Audit log DynamoDB table "${data.target.auditLog.dynamodb.tableName}" must differ from the main target table.`
            });
        }
    });

export type DdbTransferInput = z.infer<typeof ddbTransferInputSchema>;
