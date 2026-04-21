import { z } from "zod";

/**
 * Non-empty string that trims whitespace before validating. Catches the
 * common copy-paste mistake of a trailing/leading space — which AWS
 * would otherwise accept as part of a table/bucket/region name and then
 * fail with a cryptic ResourceNotFoundException at query time.
 */
export const trimmedString = (): z.ZodString => z.string().trim().min(1);

export const awsCredentialsSchema = z.object({
    accessKeyId: trimmedString(),
    secretAccessKey: trimmedString(),
    sessionToken: trimmedString().optional()
});

/**
 * Resolved shape a credential provider may return — AWS SDK providers
 * optionally attach an `expiration` to signal rotation. Literal user
 * config never has it; callers should treat it as optional.
 */
export interface AwsResolvedCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
}

/**
 * Async function returning AWS credentials — matches the shape the AWS
 * SDK v3 accepts for `credentials` (e.g., `fromAwsProfile`, `fromEnv`,
 * `fromNodeProviderChain`). We pass it through to the underlying client
 * unchanged; the SDK invokes it when it needs credentials.
 */
export type AwsCredentialsProvider = () => Promise<AwsResolvedCredentials>;

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
    preset: trimmedString(),
    segments: z.number().int().positive().optional(),
    modelsDir: trimmedString().optional()
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
