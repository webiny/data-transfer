import { S3Client as AWSS3Client, CopyObjectCommand } from "@aws-sdk/client-s3";
import { StorageClient, CopyOptions } from "./interface.ts";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 100;
const CONCURRENCY_LIMIT = 10;

export interface S3ClientOptions {
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export class S3Client implements StorageClient {
  private client: AWSS3Client;

  constructor(options?: S3ClientOptions) {
    this.client = new AWSS3Client({
      region: options?.region || process.env.AWS_REGION || "us-east-1",
      ...(options?.credentials && { credentials: options.credentials })
    });
  }

  async copy(options: CopyOptions): Promise<void> {
    const command = new CopyObjectCommand({
      CopySource: `${options.sourceBucket}/${options.sourceKey}`,
      Bucket: options.targetBucket,
      Key: options.targetKey
    });

    await this.executeWithRetry(async () => {
      await this.client.send(command);
    });
  }

  async batchCopy(operations: CopyOptions[]): Promise<void> {
    if (operations.length === 0) return;

    // Process in batches with concurrency limit
    for (let i = 0; i < operations.length; i += CONCURRENCY_LIMIT) {
      const batch = operations.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(batch.map(op => this.copy(op)));
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        const isRetryable =
          error instanceof Error &&
          (error.name === "SlowDown" ||
            error.name === "RequestTimeout" ||
            error.name === "ServiceUnavailable");

        if (!isRetryable || attempt === MAX_RETRIES - 1) {
          throw error;
        }

        // Exponential backoff
        const backoff = INITIAL_BACKOFF * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw lastError;
  }
}
