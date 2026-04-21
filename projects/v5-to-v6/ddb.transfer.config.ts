import { loadEnv, createDdbTransfer } from "~/index.ts";

// Loads projects/v5-to-v6/.env (next to this file). `.env*` is gitignored,
// so credentials stay local. Copy .env.example → .env and fill it in.
loadEnv(import.meta.url);

export default createDdbTransfer({
    source: {
        region: process.env.SOURCE_REGION!,
        credentials: {
            accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!,
            ...(process.env.SOURCE_AWS_SESSION_TOKEN
                ? { sessionToken: process.env.SOURCE_AWS_SESSION_TOKEN }
                : {})
        },
        dynamodb: { tableName: process.env.SOURCE_DDB_TABLE! },
        s3: { bucket: process.env.SOURCE_S3_BUCKET! }
    },
    target: {
        region: process.env.TARGET_REGION!,
        credentials: {
            accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!,
            ...(process.env.TARGET_AWS_SESSION_TOKEN
                ? { sessionToken: process.env.TARGET_AWS_SESSION_TOKEN }
                : {})
        },
        dynamodb: { tableName: process.env.TARGET_DDB_TABLE! },
        s3: { bucket: process.env.TARGET_S3_BUCKET! }
    },
    pipeline: {
        preset: "v5-to-v6-ddb",
        segments: Number(process.env.SEGMENTS ?? 4)
    }
});
