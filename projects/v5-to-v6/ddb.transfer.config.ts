import { loadEnv, createDdbTransfer, fromAwsProfile } from "~/index.ts";

// Loads projects/v5-to-v6/.env (next to this file). `.env*` is gitignored.
// SEGMENTS / region / table / bucket come from .env. AWS credentials come
// from ~/.aws/credentials via `fromAwsProfile` — set SOURCE_PROFILE /
// TARGET_PROFILE in .env to pick a specific profile, or leave them blank
// to use the default profile.
loadEnv(import.meta.url);

export default createDdbTransfer({
    source: {
        region: process.env.SOURCE_REGION!,
        credentials: fromAwsProfile({ profile: process.env.SOURCE_PROFILE || "default" }),
        dynamodb: { tableName: process.env.SOURCE_DDB_TABLE! },
        s3: { bucket: process.env.SOURCE_S3_BUCKET! }
    },
    target: {
        region: process.env.TARGET_REGION!,
        credentials: fromAwsProfile({ profile: process.env.TARGET_PROFILE || "default" }),
        dynamodb: { tableName: process.env.TARGET_DDB_TABLE! },
        s3: { bucket: process.env.TARGET_S3_BUCKET! }
    },
    pipeline: {
        preset: "v5-to-v6-ddb",
        segments: Number(process.env.SEGMENTS ?? 4)
    }
});
