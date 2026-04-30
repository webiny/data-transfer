import {
    CopyObjectCommand,
    GetObjectCommand,
    createS3Client,
    type S3Client
} from "@webiny/aws-sdk/client-s3";
import { SourceS3Client } from "./abstractions/S3Client.ts";
import { S3ClientConfig } from "./abstractions/S3ClientConfig.ts";
import { isRetryableAwsError, isTokenBucketExhausted, retryBackoffMs } from "~/base/index.ts";
import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";

// See DynamoDbClient for the rationale on 6 retries + the jittered
// capped backoff. S3 mirrors the DDB defaults for consistency — same
// underlying SDK retry semantics, same class of server-side hiccups.
const DEFAULT_MAX_RETRIES = 6;
const DEFAULT_INITIAL_BACKOFF = 100;
const DEFAULT_CONCURRENCY = 10;

export class S3ClientImpl implements SourceS3Client.Interface {
    private client: S3Client;
    private readonly maxRetries: number;
    private readonly initialBackoff: number;
    private readonly concurrency: number;
    private readonly logger: Logger.Interface;

    public constructor(
        config: S3ClientConfig.Connection,
        logger: Logger.Interface,
        tuning?: S3ClientConfig.Tuning
    ) {
        this.logger = logger;
        this.client = createS3Client({
            region: config.region,
            credentials: config.credentials,
            retryMode: "adaptive"
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
            await Promise.all(
                batch.map(async op => {
                    try {
                        await this.copy(op);
                    } catch (error) {
                        if (this.isNoSuchKeyError(error)) {
                            this.logger.warn(
                                `S3 copy skipped — source key not found: ` +
                                    `${op.sourceBucket}/${op.sourceKey}`
                            );
                            return;
                        }
                        this.logger.error(
                            `S3 copy failed after ${this.maxRetries + 1} attempts — ` +
                                `${op.sourceBucket}/${op.sourceKey} → ` +
                                `${op.targetBucket}/${op.targetKey}`
                        );
                        throw error;
                    }
                })
            );
        }
    }

    private isNoSuchKeyError(error: unknown): boolean {
        if (!error || typeof error !== "object") {
            return false;
        }
        const err = error as { name?: string; Code?: string };
        return err.name === "NoSuchKey" || err.Code === "NoSuchKey";
    }

    private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;

                if (!isRetryableAwsError(error) || attempt === this.maxRetries) {
                    throw error;
                }

                const base = retryBackoffMs(attempt, this.initialBackoff);
                const backoff = isTokenBucketExhausted(error) ? Math.max(base, 10000) : base;
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }

        throw lastError;
    }
}
