import type { Command } from "./Command.ts";

interface CreateParams {
    sourceBucket: string;
    sourceKey: string;
    targetBucket: string;
    targetKey: string;
}

export class S3Copy implements Command {
    public static readonly key = "S3_COPY";

    public readonly key = S3Copy.key;
    public readonly dedupKey: undefined = undefined;

    private constructor(
        public readonly sourceBucket: string,
        public readonly sourceKey: string,
        public readonly targetBucket: string,
        public readonly targetKey: string
    ) {}

    public static create(params: CreateParams): S3Copy {
        return new S3Copy(
            params.sourceBucket,
            params.sourceKey,
            params.targetBucket,
            params.targetKey
        );
    }
}
