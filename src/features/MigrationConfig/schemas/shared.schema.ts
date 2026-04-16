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
