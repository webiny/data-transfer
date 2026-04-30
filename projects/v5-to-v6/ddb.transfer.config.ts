import { loadEnv, createDdbTransfer, fromAwsProfile, fromEnv, numberFromEnv } from "~/index.ts";

// Loads projects/v5-to-v6/.env (next to this file). `.env*` is gitignored.
// Region / tables / buckets come from .env. AWS credentials come from
// ~/.aws/credentials via `fromAwsProfile` — set SOURCE_PROFILE /
// TARGET_PROFILE in .env to pick a specific profile, or leave them blank
// to use the default profile. Vars without a default throw fast when
// missing instead of silently passing `undefined` to the AWS SDK.
loadEnv(import.meta.url);

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_PROFILE = "default";

export default createDdbTransfer({
    debug: {
        logLevel: "debug",
        logFile: true
    },
    source: {
        region: fromEnv("SOURCE_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", DEFAULT_PROFILE) }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
    },
    target: {
        region: fromEnv("TARGET_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", DEFAULT_PROFILE) }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") },
        auditLog: {
            dynamodb: {
                tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE")
            }
        }
    },
    pipeline: {
        preset: "v5-to-v6-ddb",
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models")
    }
});
