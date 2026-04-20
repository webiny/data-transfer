import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { SourceS3Client, TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { S3Processor as S3ProcessorAbstraction } from "./abstractions/S3Processor.ts";

class S3ProcessorImpl implements Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    S3ProcessorAbstraction.Slice
> {
    public constructor(
        private readonly sourceS3: SourceS3Client.Interface,
        private readonly targetS3: TargetS3Client.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(
        base: BaseTransformContext.Interface<unknown>
    ): S3ProcessorAbstraction.Slice {
        if (this.config.storage !== "ddb") {
            throw new Error("S3Processor can only be used in ddb mode");
        }
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

    public async execute(commands: Commands): Promise<void> {
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

    public getShardState(): unknown {
        return {};
    }
}

export const S3Processor = S3ProcessorAbstraction.createImplementation({
    implementation: S3ProcessorImpl,
    dependencies: [SourceS3Client, TargetS3Client, MigrationConfig]
});
