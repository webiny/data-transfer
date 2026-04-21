import {
    loadEnv,
    createDdbTransfer,
    fromAwsProfile,
    fromEnv,
    numberFromEnv
} from "@webiny/data-transfer";

// Loads the .env file from THIS directory (next to this config file).
// Using import.meta.url ensures each project folder loads its own .env,
// so config stays isolated between projects — even when you run the
// transfer from the repository root.
loadEnv(import.meta.url);

export default createDdbTransfer({
    source: {
        region: fromEnv("SOURCE_REGION", "us-east-1"),
        // Reads ~/.aws/credentials via the `fromIni` provider. Use the
        // `default` profile unless SOURCE_PROFILE is set. If you prefer
        // a literal credentials object, replace with
        //   credentials: { accessKeyId: fromEnv("..."), secretAccessKey: fromEnv("...") }
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
    },
    target: {
        region: fromEnv("TARGET_REGION", "us-east-1"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") }
    },
    pipeline: {
        preset: "../../presets/example.ts",
        segments: numberFromEnv("SEGMENTS", 4)
        // modelsDir: "./models"
    }
});
