import { createAbstraction } from "~/base/index.js";

interface CopyOptions {
    sourceBucket: string;
    sourceKey: string;
    targetBucket: string;
    targetKey: string;
}

interface IS3Client {
    copy(options: CopyOptions): Promise<void>;
    batchCopy(operations: CopyOptions[]): Promise<void>;
    getObject(bucket: string, key: string): Promise<Buffer>;
}

export const SourceS3Client = createAbstraction<IS3Client>("Core/SourceS3Client");
export const TargetS3Client = createAbstraction<IS3Client>("Core/TargetS3Client");

export namespace SourceS3Client {
    export type Interface = IS3Client;
    export type Copy = CopyOptions;
}

export namespace TargetS3Client {
    export type Interface = IS3Client;
    export type Copy = CopyOptions;
}
