import { loadEnv, createDdbTransfer } from "@webiny/data-transfer";

loadEnv(import.meta.url);

export default createDdbTransfer({
    source: {
        region: process.env.SOURCE_REGION!,
        credentials: {
            accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!
        },
        dynamodb: { tableName: process.env.SOURCE_DDB_TABLE! },
        s3: { bucket: process.env.SOURCE_S3_BUCKET! }
    },
    target: {
        region: process.env.TARGET_REGION!,
        credentials: {
            accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!
        },
        dynamodb: { tableName: process.env.TARGET_DDB_TABLE! },
        s3: { bucket: process.env.TARGET_S3_BUCKET! }
    },
    pipeline: {
        preset: "v5-to-v6",
        segments: 4
    }
});
