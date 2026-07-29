import type { MigrationConfiguration } from "../validation.ts";
export declare const MigrationConfig: import("@webiny/di").Abstraction<{
  source: {
    region: string;
    credentials:
      | import("../schemas/shared.schema.ts").AwsCredentialsProvider
      | {
          accessKeyId: string;
          secretAccessKey: string;
          sessionToken?: string | undefined;
        };
    accountId?: string | undefined;
    dynamodb: {
      tableName: string;
    };
    s3: {
      bucket: string;
    };
    auditLog?:
      | {
          dynamodb: {
            tableName: string | null;
          };
        }
      | null
      | undefined;
    opensearch?:
      | {
          tableName: string;
        }
      | null
      | undefined;
  };
  target: {
    region: string;
    credentials:
      | import("../schemas/shared.schema.ts").AwsCredentialsProvider
      | {
          accessKeyId: string;
          secretAccessKey: string;
          sessionToken?: string | undefined;
        };
    accountId?: string | undefined;
    dynamodb: {
      tableName: string;
    };
    s3: {
      bucket: string;
    };
    opensearch?:
      | {
          endpoint: string;
          tableName: string;
          service: "opensearch" | "opensearch-serverless";
          indexPrefix: string;
        }
      | null
      | undefined;
    auditLog?:
      | {
          dynamodb: {
            tableName: string | null;
          };
        }
      | null
      | undefined;
  };
  pipeline?:
    | {
        segments?: number | undefined;
        modelsDir?: string | undefined;
        presetsDir?: string | undefined;
      }
    | undefined;
  register?: import("../schemas/shared.schema.ts").RegisterFn | undefined;
  tuning?:
    | {
        flushEvery?: number | undefined;
        ddb?:
          | {
              maxRetries?: number | undefined;
              initialBackoffMs?: number | undefined;
              requestTimeoutMs?: number | undefined;
            }
          | undefined;
        s3?:
          | {
              concurrency?: number | undefined;
              maxRetries?: number | undefined;
              initialBackoffMs?: number | undefined;
              requestTimeoutMs?: number | undefined;
            }
          | undefined;
        os?:
          | {
              maxRetries?: number | undefined;
              retryScheduleMs?: number[] | undefined;
              gzipConcurrency?: number | undefined;
            }
          | undefined;
      }
    | undefined;
  debug?:
    | {
        snapshot?:
          | boolean
          | {
              dir?: string | undefined;
              compress?: boolean | undefined;
            }
          | undefined;
        logFile?: string | boolean | undefined;
        logLevel?: "debug" | "error" | "info" | "warn" | undefined;
      }
    | undefined;
  fileUrls?:
    | {
        source: string;
        target: string;
      }
    | undefined;
}>;
export declare namespace MigrationConfig {
  type Interface = MigrationConfiguration;
}
//# sourceMappingURL=MigrationConfig.d.ts.map
