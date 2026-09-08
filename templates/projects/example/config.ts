import {
    loadEnv,
    createConfig,
    fromAwsProfile,
    fromEnv,
    numberFromEnv
} from "@webiny/data-transfer";

loadEnv(import.meta.url);

const sourceOsTable = fromEnv("SOURCE_OS_TABLE", null);
const targetOsTable = fromEnv("TARGET_OS_TABLE", null);

export default createConfig({
    source: {
        region: fromEnv("SOURCE_REGION", "eu-central-1"),
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") },
        opensearch: sourceOsTable ? { tableName: sourceOsTable } : null
    },
    target: {
        region: fromEnv("TARGET_REGION", "eu-central-1"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") },
        opensearch: targetOsTable
            ? {
                  endpoint: fromEnv("TARGET_OS_ENDPOINT"),
                  tableName: targetOsTable,
                  service: "opensearch",
                  indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
              }
            : null
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: "./models",
        presetsDir: "../../presets"
    }
    // Wire custom DI bindings before the preset loads.
    // Runs after all built-in features are registered.
    // register: async (container) => {
    //     container.register(MyCustomProcessorImpl);
    // }
});
