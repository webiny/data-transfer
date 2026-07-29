import type { Container } from "@webiny/di";
import { z } from "zod";
export type RegisterFn = (container: Container) => void | Promise<void>;
/**
 * Non-empty string that trims whitespace before validating. Catches the
 * common copy-paste mistake of a trailing/leading space — which AWS
 * would otherwise accept as part of a table/bucket/region name and then
 * fail with a cryptic ResourceNotFoundException at query time.
 */
export declare const trimmedString: () => z.ZodString;
export declare const awsCredentialsSchema: z.ZodObject<
  {
    accessKeyId: z.ZodString;
    secretAccessKey: z.ZodString;
    sessionToken: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
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
export declare const credentialsOrProviderSchema: z.ZodUnion<
  readonly [
    z.ZodObject<
      {
        accessKeyId: z.ZodString;
        secretAccessKey: z.ZodString;
        sessionToken: z.ZodOptional<z.ZodString>;
      },
      z.core.$strip
    >,
    z.ZodCustom<AwsCredentialsProvider, AwsCredentialsProvider>
  ]
>;
export declare const registerSchema: z.ZodOptional<z.ZodCustom<RegisterFn, RegisterFn>>;
export declare const pipelineSettingsSchema: z.ZodOptional<
  z.ZodObject<
    {
      segments: z.ZodOptional<z.ZodNumber>;
      modelsDir: z.ZodOptional<z.ZodString>;
      presetsDir: z.ZodOptional<z.ZodString>;
    },
    z.core.$strip
  >
>;
/**
 * Snapshot settings — when enabled, the runner dumps per-record JSONL
 * files to `dir` (default: `.transfer/<runId>/snapshot`). Useful for
 * debugging transformer behavior against specific source records.
 *
 * File layout (one file per shard per pipeline per category):
 *   <dir>/<pipelineName>/segment-<n>.source.jsonl[.gz]
 *   <dir>/<pipelineName>/segment-<n>.post-transform.jsonl[.gz]
 *   <dir>/<pipelineName>/segment-<n>.commands.jsonl[.gz]
 *   <dir>/dropped/segment-<n>.jsonl[.gz]
 */
export declare const snapshotSettingsSchema: z.ZodObject<
  {
    dir: z.ZodOptional<z.ZodString>;
    compress: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strip
>;
export declare const debugSettingsSchema: z.ZodOptional<
  z.ZodObject<
    {
      snapshot: z.ZodOptional<
        z.ZodUnion<
          readonly [
            z.ZodBoolean,
            z.ZodObject<
              {
                dir: z.ZodOptional<z.ZodString>;
                compress: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strip
            >
          ]
        >
      >;
      logFile: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
      logLevel: z.ZodOptional<
        z.ZodEnum<{
          debug: "debug";
          error: "error";
          info: "info";
          warn: "warn";
        }>
      >;
    },
    z.core.$strip
  >
>;
export declare const tuningSchema: z.ZodOptional<
  z.ZodObject<
    {
      flushEvery: z.ZodOptional<z.ZodNumber>;
      ddb: z.ZodOptional<
        z.ZodObject<
          {
            maxRetries: z.ZodOptional<z.ZodNumber>;
            initialBackoffMs: z.ZodOptional<z.ZodNumber>;
            requestTimeoutMs: z.ZodOptional<z.ZodNumber>;
          },
          z.core.$strip
        >
      >;
      s3: z.ZodOptional<
        z.ZodObject<
          {
            concurrency: z.ZodOptional<z.ZodNumber>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            initialBackoffMs: z.ZodOptional<z.ZodNumber>;
            requestTimeoutMs: z.ZodOptional<z.ZodNumber>;
          },
          z.core.$strip
        >
      >;
      os: z.ZodOptional<
        z.ZodObject<
          {
            maxRetries: z.ZodOptional<z.ZodNumber>;
            retryScheduleMs: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            gzipConcurrency: z.ZodOptional<z.ZodNumber>;
          },
          z.core.$strip
        >
      >;
    },
    z.core.$strip
  >
>;
//# sourceMappingURL=shared.schema.d.ts.map
