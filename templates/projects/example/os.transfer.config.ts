import {
    loadEnv,
    createOsTransfer,
    fromAwsProfile,
    fromEnv,
    numberFromEnv
} from "@webiny/data-transfer";

// Loads the .env file from THIS directory (next to this config file).
// Using import.meta.url ensures each project folder loads its own .env,
// so config stays isolated between projects — even when you run the
// transfer from the repository root.
loadEnv(import.meta.url);

export default createOsTransfer({
    source: {
        region: fromEnv("SOURCE_REGION", "us-east-1"),
        // Profile-based credentials — reads ~/.aws/credentials. For the
        // literal `{accessKeyId, secretAccessKey, sessionToken?}` shape,
        // see the commented alternative in ddb.transfer.config.ts.
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
        // credentials: {
        //     accessKeyId: fromEnv("SOURCE_AWS_ACCESS_KEY_ID"),
        //     secretAccessKey: fromEnv("SOURCE_AWS_SECRET_ACCESS_KEY"),
        //     // sessionToken: fromEnv("SOURCE_AWS_SESSION_TOKEN")
        // },
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") }
    },
    target: {
        region: fromEnv("TARGET_REGION", "us-east-1"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        // credentials: {
        //     accessKeyId: fromEnv("TARGET_AWS_ACCESS_KEY_ID"),
        //     secretAccessKey: fromEnv("TARGET_AWS_SECRET_ACCESS_KEY"),
        //     // sessionToken: fromEnv("TARGET_AWS_SESSION_TOKEN")
        // },
        opensearch: {
            endpoint: fromEnv("TARGET_OS_ENDPOINT"),
            tableName: fromEnv("TARGET_OS_TABLE"),
            service: "opensearch"
        }
    },
    pipeline: {
        preset: "../../presets/example.ts",
        segments: numberFromEnv("SEGMENTS", 4)
        // modelsDir: "./models"
    }
});
