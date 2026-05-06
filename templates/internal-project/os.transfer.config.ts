import { loadEnv, createOsConfig, fromAwsProfile, fromEnv, numberFromEnv } from "~/index.ts";

loadEnv(import.meta.url);

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_PROFILE = "default";

export default createOsConfig({
    source: {
        region: fromEnv("SOURCE_REGION", DEFAULT_REGION),
        // Profile-based credentials — reads ~/.aws/credentials.
        // To use literal credentials instead, replace with:
        //   { accessKeyId: fromEnv("SOURCE_AWS_ACCESS_KEY_ID"),
        //     secretAccessKey: fromEnv("SOURCE_AWS_SECRET_ACCESS_KEY") }
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
            // "opensearch" for a managed domain; "opensearch-serverless" for serverless.
            service: "opensearch",
            indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
        }
    },
    pipeline: {
        // Uses the example preset in ./presets/os.ts (copies all OS records verbatim).
        // To use a built-in preset instead: preset: "v5-to-v6-os"
        // Run AFTER the DDB transfer completes.
        preset: "os",
        // presetsDir lets you reference custom presets by name (without a path).
        // Drop .ts files into ./presets/ and use their filename as the preset name.
        presetsDir: "./presets",
        segments: numberFromEnv("SEGMENTS", 4)
        // modelsDir: "./models"  // required when using OS transformers that read CMS models
    }
});
