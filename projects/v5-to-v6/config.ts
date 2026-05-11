import { createConfig, fromAwsProfile, fromEnv, loadEnv, numberFromEnv } from "~/index.ts";

// Loads projects/v5-to-v6/.env (next to this file). `.env*` is gitignored.
// Region / tables / buckets come from .env. AWS credentials come from
// ~/.aws/credentials via `fromAwsProfile` — set SOURCE_PROFILE /
// TARGET_PROFILE in .env to pick a specific profile, or leave them blank
// to use the default profile. Vars without a default throw fast when
// missing instead of silently passing `undefined` to the AWS SDK.
loadEnv(import.meta.url);

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_PROFILE = "default";
/**
 * It is possible that config is created for dynamodb only system. at that point, the opensearch stuff will be null
 *
 * if any of the opensearch stuff is not null, validation should kick in, so:
 * - if anything os related in source is not null, then target must not be null
 * - if anything os related in target is not null, then source must not be null
 *
 * also note that users can disable the audit log by setting table to null or explicitly setting enabled to false.
 * enabled should be in the config and set to true by default
 */

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
        opensearch: {
            // table can be null if the source environment does not have it
            tableName: fromEnv("SOURCE_OS_TABLE")
        }
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
        auditLog: {
            dynamodb: {
                tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE")
            }
        },
        opensearch: {
            // endpoint can be null if the target environment does not have it
            endpoint: fromEnv("TARGET_OS_ENDPOINT"),
            // endpoint can be null if the target environment does not have it
            tableName: fromEnv("TARGET_OS_TABLE"),
            // endpoint can be null if the target environment does not have it
            service: "opensearch",
            // endpoint can be null if the target environment does not have it
            indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
        }
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models")
    }
});
