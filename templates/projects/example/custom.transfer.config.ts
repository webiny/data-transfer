import {
    loadEnv,
    createDdbTransfer,
    fromAwsProfile,
    fromEnv,
    numberFromEnv
} from "@webiny/data-transfer";

// Loads the .env file next to this config file.
loadEnv(import.meta.url);

// Same source/target shape as ddb.transfer.config.ts — the only difference is
// `pipeline.preset` points at a file path (resolved relative to this config
// file's directory) instead of a built-in preset name.
export default createDdbTransfer({
    source: {
        region: fromEnv("SOURCE_REGION", "us-east-1"),
        // Profile-based credentials. See ddb.transfer.config.ts for the
        // literal `{accessKeyId, secretAccessKey, sessionToken?}` alternative.
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
        // credentials: {
        //     accessKeyId: fromEnv("SOURCE_AWS_ACCESS_KEY_ID"),
        //     secretAccessKey: fromEnv("SOURCE_AWS_SECRET_ACCESS_KEY"),
        //     // sessionToken: fromEnv("SOURCE_AWS_SESSION_TOKEN")
        // },
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
    },
    target: {
        region: fromEnv("TARGET_REGION", "us-east-1"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        // credentials: {
        //     accessKeyId: fromEnv("TARGET_AWS_ACCESS_KEY_ID"),
        //     secretAccessKey: fromEnv("TARGET_AWS_SECRET_ACCESS_KEY"),
        //     // sessionToken: fromEnv("TARGET_AWS_SESSION_TOKEN")
        // },
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") }
    },
    pipeline: {
        preset: "../../presets/example.ts",
        segments: numberFromEnv("SEGMENTS", 1)
    }
});
