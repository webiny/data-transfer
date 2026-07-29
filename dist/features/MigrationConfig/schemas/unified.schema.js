import { z } from "zod";
import {
  credentialsOrProviderSchema,
  debugSettingsSchema,
  pipelineSettingsSchema,
  registerSchema,
  trimmedString,
  tuningSchema
} from "./shared.schema.js";
const opensearchSourceSchema = z.object({
  tableName: trimmedString()
});
const opensearchTargetSchema = z.object({
  endpoint: trimmedString().url(),
  tableName: trimmedString(),
  service: z.enum(["opensearch", "opensearch-serverless"]),
  indexPrefix: z.string().trim()
});
const sourceSchema = z.object({
  region: trimmedString(),
  credentials: credentialsOrProviderSchema,
  accountId: z.string().optional(),
  dynamodb: z.object({ tableName: trimmedString() }),
  s3: z.object({ bucket: trimmedString() }),
  auditLog: z
    .object({
      dynamodb: z.object({ tableName: trimmedString().nullable() })
    })
    .nullable()
    .optional(),
  opensearch: opensearchSourceSchema.nullable().optional()
});
const fileUrlsSchema = z
  .object({
    source: trimmedString(),
    target: trimmedString()
  })
  .optional();
const targetSchema = z.object({
  region: trimmedString(),
  credentials: credentialsOrProviderSchema,
  accountId: z.string().optional(),
  dynamodb: z.object({ tableName: trimmedString() }),
  s3: z.object({ bucket: trimmedString() }),
  opensearch: opensearchTargetSchema.nullable().optional(),
  auditLog: z
    .object({
      dynamodb: z.object({ tableName: trimmedString().nullable() })
    })
    .nullable()
    .optional()
});
export const unifiedTransferInputSchema = z
  .object({
    source: sourceSchema,
    target: targetSchema,
    pipeline: pipelineSettingsSchema,
    register: registerSchema,
    tuning: tuningSchema,
    debug: debugSettingsSchema,
    fileUrls: fileUrlsSchema
  })
  .superRefine((data, ctx) => {
    if (data.source.s3.bucket === data.target.s3.bucket) {
      ctx.addIssue({
        code: "custom",
        path: ["target", "s3", "bucket"],
        message: `Target S3 bucket "${data.target.s3.bucket}" is the same as source — would overwrite source files. Use a different bucket.`
      });
    }
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
    const hasSourceOs = data.source.opensearch != null;
    const hasTargetOs = data.target.opensearch != null;
    if (hasSourceOs !== hasTargetOs) {
      ctx.addIssue({
        code: "custom",
        path: hasSourceOs ? ["target", "opensearch"] : ["source", "opensearch"],
        message: "source.opensearch and target.opensearch must both be set or both be absent."
      });
    }
    if (
      hasSourceOs &&
      hasTargetOs &&
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
//# sourceMappingURL=unified.schema.js.map
