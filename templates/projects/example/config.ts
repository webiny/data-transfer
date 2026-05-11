import {
    loadEnv,
    createConfig,
    fromAwsProfile,
    fromEnv,
    numberFromEnv
} from "@webiny/data-transfer";

// Loads the .env file from THIS directory (next to this config file).
// Using import.meta.url ensures each project folder loads its own .env,
// so config stays isolated between projects — even when you run the
// transfer from the repository root.
loadEnv(import.meta.url);

export default createConfig({
    source: {
        region: fromEnv("SOURCE_REGION", "eu-central-1"),
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
        accountId: fromEnv("SOURCE_ACCOUNT_ID", ""),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
        // Uncomment if your Webiny project uses OpenSearch (Elasticsearch):
        // opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") }
    },
    target: {
        region: fromEnv("TARGET_REGION", "eu-central-1"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        // credentials: {
        //     accessKeyId: fromEnv("TARGET_AWS_ACCESS_KEY_ID"),
        //     secretAccessKey: fromEnv("TARGET_AWS_SECRET_ACCESS_KEY"),
        //     // sessionToken: fromEnv("TARGET_AWS_SESSION_TOKEN")
        // },
        accountId: fromEnv("TARGET_ACCOUNT_ID", ""),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") },
        auditLog: { dynamodb: { tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE") } }
        // Uncomment if your Webiny project uses OpenSearch (Elasticsearch):
        // opensearch: {
        //     endpoint: fromEnv("TARGET_OS_ENDPOINT"),
        //     tableName: fromEnv("TARGET_OS_TABLE"),
        //     service: "opensearch",
        //     indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
        // }
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models"),
        presetsDir: "./presets"
    },
    tuning: {
        flushEvery: numberFromEnv("FLUSH_EVERY", 500)
    }
    //
    // Optional debug helpers — uncomment either or both to enable.
    //
    // debug: {
    //     // Dump every source/post-transform/command record to JSONL
    //     // files under `.transfer/<runId>/snapshot/`. Great for seeing
    //     // exactly what a transformer did to a specific record without
    //     // re-scanning AWS. Gzipped by default; set `{compress: false}`
    //     // to grep directly.
    //     snapshot: true,
    //     // Write the runner's pino log to disk alongside stdout. `true`
    //     // gives each process its own file at
    //     // `.transfer/<runId>/logs/<orchestrator|segment-N>.log`
    //     // (safe under worker parallelism). Pass a string to write
    //     // every process to the same path.
    //     logFile: true
    // }
});
