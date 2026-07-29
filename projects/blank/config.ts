import { createConfig, fromAwsProfile, fromEnv, loadEnv, numberFromEnv } from "~/index.js";

loadEnv(import.meta.url);

export default createConfig({
    source: {
        region: fromEnv("SOURCE_REGION"),
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
    },
    target: {
        region: fromEnv("TARGET_REGION"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") }
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4)
    }
});
