import { loadEnv, createDdbConfig, fromAwsProfile, fromEnv, numberFromEnv } from "~/index.ts";

loadEnv(import.meta.url);

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_PROFILE = "default";

export default createDdbConfig({
    source: {
        region: fromEnv("SOURCE_REGION", DEFAULT_REGION),
        // Profile-based credentials — reads ~/.aws/credentials.
        // To use literal credentials instead, replace with:
        //   { accessKeyId: fromEnv("SOURCE_AWS_ACCESS_KEY_ID"),
        //     secretAccessKey: fromEnv("SOURCE_AWS_SECRET_ACCESS_KEY") }
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", DEFAULT_PROFILE) }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
    },
    target: {
        region: fromEnv("TARGET_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", DEFAULT_PROFILE) }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") },
        // Audit log table. Set tableName to transfer audit logs to a separate
        // target table, or keep null to skip (audit log records are dropped).
        auditLog: null
        // auditLog: { dynamodb: { tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE") } }
    },
    pipeline: {
        // Uses the example preset in ./presets/ddb.ts (copies all records + S3 files verbatim).
        // To use a built-in preset instead: preset: "v5-to-v6-ddb"
        preset: "ddb",
        // presetsDir lets you reference custom presets by name (without a path).
        // Drop .ts files into ./presets/ and use their filename as the preset name.
        presetsDir: "./presets",
        segments: numberFromEnv("SEGMENTS", 4)
        // modelsDir: "./models"  // uncomment to load CMS model JSON overrides
    }
});
