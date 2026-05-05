import { loadEnv, createDdbConfig, fromAwsProfile, fromEnv, numberFromEnv } from "~/index.ts";

loadEnv(import.meta.url);

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_PROFILE = "default";

export default createDdbConfig({
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
        // Set to an object with a tableName to transfer audit logs, or leave null to skip.
        auditLog: null
    },
    pipeline: {
        preset: "v5-to-v6-ddb",
        presetsDir: "./presets",
        segments: numberFromEnv("SEGMENTS", 4)
    }
});
