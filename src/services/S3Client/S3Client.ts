import { S3Client as AWSS3Client, CopyObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { SourceS3Client } from "./abstractions/S3Client.ts";
import { S3ClientConfig } from "./abstractions/S3ClientConfig.ts";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF = 100;
const DEFAULT_CONCURRENCY = 10;

export class S3ClientImpl implements SourceS3Client.Interface {
    private client: AWSS3Client;
    private readonly maxRetries: number;
    private readonly initialBackoff: number;
    private readonly concurrency: number;

    public constructor(config: S3ClientConfig.Connection, tuning?: S3ClientConfig.Tuning) {
        this.client = new AWSS3Client({
            region: config.region,
            credentials: config.credentials
        });
        this.maxRetries = tuning?.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.initialBackoff = tuning?.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF;
        this.concurrency = tuning?.concurrency ?? DEFAULT_CONCURRENCY;
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

        for (let i = 0; i < operations.length; i += this.concurrency) {
            const batch = operations.slice(i, i + this.concurrency);
            await Promise.all(batch.map(op => this.copy(op)));
        }
    }

    private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;

                const isRetryable =
                    error instanceof Error &&
                    (error.name === "SlowDown" ||
                        error.name === "RequestTimeout" ||
                        error.name === "ServiceUnavailable");

                if (!isRetryable || attempt === this.maxRetries - 1) {
                    throw error;
                }

                const backoff = this.initialBackoff * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }

        throw lastError;
    }
}
