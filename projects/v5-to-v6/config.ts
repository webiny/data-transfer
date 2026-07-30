import { createConfig, fromAwsProfile, fromEnv, loadEnv, numberFromEnv } from "~/index.js";

// Loads projects/v5-to-v6/.env (next to this file). `.env*` is gitignored.
// Region / tables / buckets come from .env. AWS credentials come from
// ~/.aws/credentials via `fromAwsProfile` — set SOURCE_PROFILE /
// TARGET_PROFILE in .env to pick a specific profile, or leave them blank
// to use the default profile. Vars without a default throw fast when
// missing instead of silently passing `undefined` to the AWS SDK.
loadEnv(import.meta.url);

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_PROFILE = "default";

const sourceOsTable = fromEnv("SOURCE_OS_TABLE", null);
const sourceAuditLogTable = fromEnv("SOURCE_AUDIT_LOGS_TABLE", null);
const targetOsTable = fromEnv("TARGET_OS_TABLE", null);
const targetOsEndpoint = fromEnv("TARGET_OS_ENDPOINT", null);
const targetAuditLogTable = fromEnv("TARGET_AUDIT_LOGS_TABLE", null);

export default createConfig({
    debug: {
        logLevel: "debug",
        logFile: true
    },
    source: {
        region: fromEnv("SOURCE_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({
            profile: fromEnv("SOURCE_PROFILE", DEFAULT_PROFILE)
        }),
        dynamodb: {
            tableName: fromEnv("SOURCE_DDB_TABLE")
        },
        s3: {
            bucket: fromEnv("SOURCE_S3_BUCKET")
        },
        auditLog: sourceAuditLogTable ? { dynamodb: { tableName: sourceAuditLogTable } } : null,
        opensearch: sourceOsTable ? { tableName: sourceOsTable } : null
    },
    target: {
        region: fromEnv("TARGET_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({
            profile: fromEnv("TARGET_PROFILE", DEFAULT_PROFILE)
        }),
        dynamodb: {
            tableName: fromEnv("TARGET_DDB_TABLE")
        },
        s3: {
            bucket: fromEnv("TARGET_S3_BUCKET")
        },
        auditLog: targetAuditLogTable ? { dynamodb: { tableName: targetAuditLogTable } } : null,
        opensearch:
            targetOsTable && targetOsEndpoint
                ? {
                      endpoint: targetOsEndpoint,
                      tableName: targetOsTable,
                      service: "opensearch" as const,
                      indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
                  }
                : null
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models")
    }
});
