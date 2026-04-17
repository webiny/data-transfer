export interface PutRecordCommand {
    type: "PUT_RECORD";
    table: string;
    record: Record<string, unknown>;
}

export interface S3CopyCommand {
    type: "S3_COPY";
    sourceBucket: string;
    sourceKey: string;
    targetBucket: string;
    targetKey: string;
}

export type Command = PutRecordCommand | S3CopyCommand;

export interface PipelineResult {
    commands: Command[];
}
