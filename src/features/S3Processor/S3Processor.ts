import { S3 } from "@webiny/aws-sdk/client-s3/index.js";
import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { isAccessDeniedError, type AwsErrorLike } from "~/base/index.ts";
import { SourceS3Client, TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface S3ProcessorSlice {
    copyFile(sourceKey: string, targetKey: string): void;
    getFile(key: string): Promise<Buffer | null>;
}

class S3ProcessorImpl implements Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    S3ProcessorSlice
> {
    public constructor(
        private readonly sourceS3: SourceS3Client.Interface,
        private readonly targetS3: TargetS3Client.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly transferContext: TransferContext.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): S3ProcessorSlice {
        const sourceBucket = this.config.source.s3.bucket;
        const targetBucket = this.config.target.s3.bucket;
        const sourceS3 = this.sourceS3;
        return {
            copyFile(sourceKey: string, targetKey: string) {
                base.addCommand(
                    S3Copy.create({ sourceBucket, sourceKey, targetBucket, targetKey })
                );
            },
            async getFile(key: string): Promise<Buffer | null> {
                return sourceS3.getObject(sourceBucket, key);
            }
        };
    }

    // No onEnd — S3 has no sensible per-record default. Transformers call
    // ctx.copyFile(...) explicitly when they want to emit a copy.

    public async checkAccess(): Promise<AccessCheck.Entry[]> {
        const sourceAccount = this.config.source.accountId || null;
        const targetAccount = this.config.target.accountId || null;
        const isCrossAccount =
            sourceAccount !== null && targetAccount !== null && sourceAccount !== targetAccount;

        const checks: Promise<AccessCheck.Entry>[] = [
            this.headBucket(
                this.config.source.credentials,
                this.config.source.region,
                this.config.source.s3.bucket,
                "source"
            ),
            this.headBucket(
                this.config.target.credentials,
                this.config.target.region,
                this.config.target.s3.bucket,
                "target"
            )
        ];

        if (isCrossAccount) {
            checks.push(
                this.headBucketWithLabel(
                    this.config.target.credentials,
                    this.config.source.region,
                    this.config.source.s3.bucket,
                    `S3 cross-account read (target credentials → source bucket: ${this.config.source.s3.bucket})`,
                    `S3 CopyObject runs with target credentials. Add a bucket policy on ` +
                        `"${this.config.source.s3.bucket}" granting s3:GetObject to account ${targetAccount}.`
                )
            );
        }

        return Promise.all(checks);
    }

    private headBucket(
        credentials: MigrationConfig.Interface["source"]["credentials"],
        region: string,
        bucket: string,
        side: string
    ): Promise<AccessCheck.Entry> {
        return this.headBucketWithLabel(
            credentials,
            region,
            bucket,
            `S3 ${side} bucket: ${bucket}`
        );
    }

    private async headBucketWithLabel(
        credentials: MigrationConfig.Interface["source"]["credentials"],
        region: string,
        bucket: string,
        label: string,
        hint?: string
    ): Promise<AccessCheck.Entry> {
        const client = new S3({ region, credentials: credentials as never });
        try {
            await client.headBucket({ Bucket: bucket });
            return { label, status: "ok" };
        } catch (error) {
            if (isAccessDeniedError(error)) {
                return { label, status: "denied", hint };
            }
            const errName = (error as AwsErrorLike).name ?? (error as AwsErrorLike).code;
            const httpStatus = (error as AwsErrorLike).$metadata?.httpStatusCode;
            if (errName === "NoSuchBucket" || httpStatus === 404) {
                return { label, status: "missing", hint };
            }
            return { label, status: "unknown" };
        } finally {
            client.destroy();
        }
    }

    public async execute(commands: Commands): Promise<void> {
        if (this.transferContext.dryRun) {
            return;
        }
        const copies = commands.get<S3Copy>(S3Copy.key);
        if (copies.length === 0) {
            return;
        }
        await this.targetS3.batchCopy(
            copies.map(c => ({
                sourceBucket: c.sourceBucket,
                sourceKey: c.sourceKey,
                targetBucket: c.targetBucket,
                targetKey: c.targetKey
            }))
        );
    }
}

export const S3Processor = Processor.createImplementation({
    implementation: S3ProcessorImpl,
    dependencies: [SourceS3Client, TargetS3Client, MigrationConfig, TransferContext]
});
