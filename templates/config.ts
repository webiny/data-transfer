import {
    loadEnv,
    createConfig,
    fromAwsProfile,
    fromEnv,
    numberFromEnv
} from "@webiny/data-transfer";

loadEnv(import.meta.url);

export default createConfig({
    source: {
        region: fromEnv("SOURCE_REGION", "eu-central-1"),
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
        // Uncomment if your Webiny project uses OpenSearch:
        // opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") }
    },
    target: {
        region: fromEnv("TARGET_REGION", "eu-central-1"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") }
        // Uncomment if your Webiny project uses OpenSearch:
        // opensearch: {
        //     endpoint: fromEnv("TARGET_OS_ENDPOINT"),
        //     tableName: fromEnv("TARGET_OS_TABLE"),
        //     service: "opensearch",
        //     indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
        // }
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: "./models",
        presetsDir: "./presets"
    }
});
