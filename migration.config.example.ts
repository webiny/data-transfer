import { createDdbTransfer } from "@webiny/data-transfer";

/**
 * Example DynamoDB Transfer Configuration
 *
 * Copy this file to `migration.config.ts` and customize for your transfer.
 */
export default createDdbTransfer({
  source: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!
      // sessionToken: process.env.SOURCE_AWS_SESSION_TOKEN // Optional
    },
    dynamodb: { tableName: "webiny-v5-production" },
    s3: { bucket: "webiny-v5-files" }
  },
  target: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!
      // sessionToken: process.env.TARGET_AWS_SESSION_TOKEN // Optional
    },
    dynamodb: { tableName: "webiny-v6-production" },
    s3: { bucket: "webiny-v6-files" }
  },
  pipeline: {
    preset: "v5-to-v6",
    segments: 4
    // modelsDir: "./models"
  }
});
