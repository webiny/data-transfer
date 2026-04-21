import { z } from "zod";

export const awsCredentialsSchema = z.object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    sessionToken: z.string().optional()
});

/**
 * Async function returning AWS credentials — matches the shape the AWS
 * SDK v3 accepts for `credentials` (e.g., `fromAwsProfile`, `fromEnv`,
 * `fromNodeProviderChain`). We pass it through to the underlying client
 * unchanged; the SDK invokes it when it needs credentials.
 */
export type AwsCredentialsProvider = () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
}>;

/**
 * Credentials shape accepted in user config: either a literal credentials
 * object, or an AWS credential-provider function (e.g., `fromAwsProfile`).
 * Required — users must pick one, but both are first-class.
 */
export const credentialsOrProviderSchema = z.union([
    awsCredentialsSchema,
    z.custom<AwsCredentialsProvider>(val => typeof val === "function", {
        message:
            "credentials must be an object with accessKeyId+secretAccessKey, or an AWS credential-provider function"
    })
]);

export const pipelineSettingsSchema = z.object({
    preset: z.string(),
    segments: z.number().int().positive().optional(),
    modelsDir: z.string().optional()
});

// Per-client operational knobs. All optional — clients fall back to module
// defaults. Use to throttle parallelism or adjust retry behavior against a
// rate-limited AWS account.
export const tuningSchema = z
    .object({
        ddb: z
            .object({
                maxRetries: z.number().int().nonnegative().optional(),
                initialBackoffMs: z.number().int().nonnegative().optional()
            })
            .optional(),
        s3: z
            .object({
                concurrency: z.number().int().positive().optional(),
                maxRetries: z.number().int().nonnegative().optional(),
                initialBackoffMs: z.number().int().nonnegative().optional()
            })
            .optional(),
        os: z
            .object({
                maxRetries: z.number().int().nonnegative().optional(),
                retryScheduleMs: z.array(z.number().int().nonnegative()).optional(),
                gzipConcurrency: z.number().int().positive().optional()
            })
            .optional()
    })
    .optional();
