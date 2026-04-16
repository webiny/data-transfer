import { loadEnv, createOsTransfer } from "@webiny/data-transfer";

// Loads the .env file from THIS directory (next to this config file).
// Using import.meta.url ensures each project folder loads its own .env,
// so credentials stay isolated between projects — even when you run
// the transfer from the repository root.
loadEnv(import.meta.url);

export default createOsTransfer({
    source: {
        region: process.env.SOURCE_REGION!,
        credentials: {
            accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!
        },
        dynamodb: { tableName: process.env.SOURCE_DDB_TABLE! },
        opensearch: { tableName: process.env.SOURCE_OS_TABLE! }
    },
    target: {
        region: process.env.TARGET_REGION!,
        credentials: {
            accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!
        },
        opensearch: {
            endpoint: process.env.TARGET_OS_ENDPOINT!,
            tableName: process.env.TARGET_OS_TABLE!,
            service: "opensearch"
        }
    },
    pipeline: {
        preset: "v5-to-v6-os",
        segments: 4
        // modelsDir: "./projects/example/models"
    }
});
