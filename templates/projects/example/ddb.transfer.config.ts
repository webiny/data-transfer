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
        // AWS credentials — TWO SHAPES ACCEPTED. Pick one.
        //
        // A) Profile-based (default below): reads ~/.aws/credentials,
        //    same as `aws --profile`. Set SOURCE_PROFILE in .env to pick
        //    a non-default profile. Works out of the box if you already
        //    use the AWS CLI on this machine.
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
        //
        // B) Literal credentials via env vars — uncomment this block and
        //    comment (A) above. Useful when profiles aren't an option
        //    (e.g., CI environments, temporary STS creds, or accessing
        //    two accounts without profile setup).
        //
        // credentials: {
        //     accessKeyId: fromEnv("SOURCE_AWS_ACCESS_KEY_ID"),
        //     secretAccessKey: fromEnv("SOURCE_AWS_SECRET_ACCESS_KEY"),
        //     // Optional — only set for temporary STS credentials:
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
        segments: numberFromEnv("SEGMENTS", 4)
        // modelsDir: "./models"
    }
});
