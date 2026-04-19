import { z } from "zod";

export const awsCredentialsSchema = z.object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    sessionToken: z.string().optional()
});

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
