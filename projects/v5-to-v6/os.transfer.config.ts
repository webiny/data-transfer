import { loadEnv, createOsTransfer, fromAwsProfile, fromEnv, numberFromEnv } from "~/index.ts";

loadEnv(import.meta.url);

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_PROFILE = "default";

export default createOsTransfer({
    debug: {
        logFile: true
    },
    source: {
        region: fromEnv("SOURCE_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", DEFAULT_PROFILE) }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") }
    },
    target: {
        region: fromEnv("TARGET_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", DEFAULT_PROFILE) }),
        opensearch: {
            endpoint: fromEnv("TARGET_OS_ENDPOINT"),
            tableName: fromEnv("TARGET_OS_TABLE"),
            service: "opensearch"
        }
    },
    pipeline: {
        preset: "v5-to-v6-os",
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models")
    }
});
