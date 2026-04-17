import { S3Client as AWSS3Client, CopyObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { SourceS3Client } from "./abstractions/S3Client.ts";
import { S3ClientConfig } from "./abstractions/S3ClientConfig.ts";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 100;
const CONCURRENCY_LIMIT = 10;

export class S3ClientImpl implements SourceS3Client.Interface {
    private client: AWSS3Client;

    public constructor(config: S3ClientConfig.Connection) {
        this.client = new AWSS3Client({
            region: config.region,
            credentials: config.credentials
        });
    }

    public async copy(options: SourceS3Client.Copy): Promise<void> {
        const command = new CopyObjectCommand({
            CopySource: `${options.sourceBucket}/${options.sourceKey}`,
            Bucket: options.targetBucket,
            Key: options.targetKey
        });

        await this.executeWithRetry(async () => {
            await this.client.send(command);
        });
    }

    public async getObject(bucket: string, key: string): Promise<Buffer> {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });

        return this.executeWithRetry(async () => {
            const response = await this.client.send(command);
            const bytes = await response.Body!.transformToByteArray();
            return Buffer.from(bytes);
        });
    }

    public async batchCopy(operations: SourceS3Client.Copy[]): Promise<void> {
        if (operations.length === 0) {
            return;
        }

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

                const isRetryable =
                    error instanceof Error &&
                    (error.name === "SlowDown" ||
                        error.name === "RequestTimeout" ||
                        error.name === "ServiceUnavailable");

                if (!isRetryable || attempt === MAX_RETRIES - 1) {
                    throw error;
                }

                const backoff = INITIAL_BACKOFF * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }

        throw lastError;
    }
}
