import { TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import type { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { S3CopyExecutor as S3CopyExecutorAbstraction } from "./abstractions/S3CopyExecutor.ts";

class S3CopyExecutorImpl implements S3CopyExecutorAbstraction.Interface {
    public constructor(private readonly targetS3: TargetS3Client.Interface) {}

    public async execute(copies: S3Copy[]): Promise<void> {
        if (copies.length === 0) {
            return;
        }

        const operations: TargetS3Client.Copy[] = copies.map(copy => ({
            sourceBucket: copy.sourceBucket,
            sourceKey: copy.sourceKey,
            targetBucket: copy.targetBucket,
            targetKey: copy.targetKey
        }));

        await this.targetS3.batchCopy(operations);
    }
}

export const S3CopyExecutor = S3CopyExecutorAbstraction.createImplementation({
    implementation: S3CopyExecutorImpl,
    dependencies: [TargetS3Client]
});
