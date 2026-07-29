import { z } from "zod";
export declare const migrationConfigSchema: z.ZodObject<
  {
    source: z.ZodObject<
      {
        region: z.ZodString;
        credentials: z.ZodUnion<
          readonly [
            z.ZodObject<
              {
                accessKeyId: z.ZodString;
                secretAccessKey: z.ZodString;
                sessionToken: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >,
            z.ZodCustom<
              import("./schemas/shared.schema.ts").AwsCredentialsProvider,
              import("./schemas/shared.schema.ts").AwsCredentialsProvider
            >
          ]
        >;
        accountId: z.ZodOptional<z.ZodString>;
        dynamodb: z.ZodObject<
          {
            tableName: z.ZodString;
          },
          z.core.$strip
        >;
        s3: z.ZodObject<
          {
            bucket: z.ZodString;
          },
          z.core.$strip
        >;
        auditLog: z.ZodOptional<
          z.ZodNullable<
            z.ZodObject<
              {
                dynamodb: z.ZodObject<
                  {
                    tableName: z.ZodNullable<z.ZodString>;
                  },
                  z.core.$strip
                >;
              },
              z.core.$strip
            >
          >
        >;
        opensearch: z.ZodOptional<
          z.ZodNullable<
            z.ZodObject<
              {
                tableName: z.ZodString;
              },
              z.core.$strip
            >
          >
        >;
      },
      z.core.$strip
    >;
    target: z.ZodObject<
      {
        region: z.ZodString;
        credentials: z.ZodUnion<
          readonly [
            z.ZodObject<
              {
                accessKeyId: z.ZodString;
                secretAccessKey: z.ZodString;
                sessionToken: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >,
            z.ZodCustom<
              import("./schemas/shared.schema.ts").AwsCredentialsProvider,
              import("./schemas/shared.schema.ts").AwsCredentialsProvider
            >
          ]
        >;
        accountId: z.ZodOptional<z.ZodString>;
        dynamodb: z.ZodObject<
          {
            tableName: z.ZodString;
          },
          z.core.$strip
        >;
        s3: z.ZodObject<
          {
            bucket: z.ZodString;
          },
          z.core.$strip
        >;
        opensearch: z.ZodOptional<
          z.ZodNullable<
            z.ZodObject<
              {
                endpoint: z.ZodString;
                tableName: z.ZodString;
                service: z.ZodEnum<{
                  opensearch: "opensearch";
                  "opensearch-serverless": "opensearch-serverless";
                }>;
                indexPrefix: z.ZodString;
              },
              z.core.$strip
            >
          >
        >;
        auditLog: z.ZodOptional<
          z.ZodNullable<
            z.ZodObject<
              {
                dynamodb: z.ZodObject<
                  {
                    tableName: z.ZodNullable<z.ZodString>;
                  },
                  z.core.$strip
                >;
              },
              z.core.$strip
            >
          >
        >;
      },
      z.core.$strip
    >;
    pipeline: z.ZodOptional<
      z.ZodObject<
        {
          segments: z.ZodOptional<z.ZodNumber>;
          modelsDir: z.ZodOptional<z.ZodString>;
          presetsDir: z.ZodOptional<z.ZodString>;
        },
        z.core.$strip
      >
    >;
    register: z.ZodOptional<
      z.ZodCustom<
        import("./schemas/shared.schema.ts").RegisterFn,
        import("./schemas/shared.schema.ts").RegisterFn
      >
    >;
    tuning: z.ZodOptional<
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
    debug: z.ZodOptional<
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
    fileUrls: z.ZodOptional<
      z.ZodObject<
        {
          source: z.ZodString;
          target: z.ZodString;
        },
        z.core.$strip
      >
    >;
  },
  z.core.$strip
>;
export type MigrationConfiguration = z.infer<typeof migrationConfigSchema>;
//# sourceMappingURL=validation.d.ts.map
