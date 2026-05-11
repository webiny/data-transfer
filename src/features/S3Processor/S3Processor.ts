import { STS } from "@webiny/aws-sdk/client-sts/index.js";
import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.ts";
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

    public async getGuardWarning(): Promise<string | null> {
        const [sourceAccount, targetAccount] = await Promise.all([
            this.resolveAccountId(this.config.source.credentials, this.config.source.region),
            this.resolveAccountId(this.config.target.credentials, this.config.target.region)
        ]);
        if (sourceAccount === null || targetAccount === null || sourceAccount === targetAccount) {
            return null;
        }
        return (
            `S3 file copy is cross-account: source account ${sourceAccount} → target account ${targetAccount}.\n` +
            `CopyObject runs with target credentials — the source bucket "${this.config.source.s3.bucket}"\n` +
            `must have a bucket policy granting account ${targetAccount} s3:GetObject access.`
        );
    }

    public async checkAccess(): Promise<AccessCheck.Entry[]> {
        return [];
    }

    private async resolveAccountId(
        credentials: MigrationConfig.Interface["source"]["credentials"],
        region: string
    ): Promise<string | null> {
        try {
            const sts = new STS({ region, credentials: credentials as never });
            const result = await sts.getCallerIdentity({});
            return result.Account ?? null;
        } catch {
            return null;
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
