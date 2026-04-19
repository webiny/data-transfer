import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { PutDynamoDbRecordExecutor } from "~/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts";
import { S3CopyExecutor } from "~/features/S3CopyExecutor/abstractions/S3CopyExecutor.ts";
import {
    DdbTransformContext,
    DdbTransformContextFactory
} from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { DdbShardState } from "./abstractions/DdbProcessor.ts";

const KNOWN_KEYS: ReadonlySet<string> = new Set([PutRecord.key, S3Copy.key]);

class DdbProcessorImpl implements Processor.Interface<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>
> {
    private readonly warnedKeys: Set<string> = new Set();

    public constructor(
        private readonly logger: Logger.Interface,
        private readonly putExecutor: PutDynamoDbRecordExecutor.Interface,
        private readonly s3CopyExecutor: S3CopyExecutor.Interface,
        private readonly contextFactory: DdbTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        this.warnOnUnknownKeys(commands);

        const puts = commands.get<PutRecord>(PutRecord.key);
        const copies = commands.get<S3Copy>(S3Copy.key);

        await Promise.all([this.putExecutor.execute(puts), this.s3CopyExecutor.execute(copies)]);
    }

    public createContext(record: BaseRecord): DdbTransformContext.Interface<BaseRecord> {
        return this.contextFactory.create({ record });
    }

    public getShardState(): DdbShardState {
        return {};
    }

    private warnOnUnknownKeys(commands: Commands): void {
        for (const key of commands.keys()) {
            if (!KNOWN_KEYS.has(key) && !this.warnedKeys.has(key)) {
                this.warnedKeys.add(key);
                this.logger.warn(`DdbProcessor does not handle command key "${key}" — ignored`);
            }
        }
    }
}

export const DdbProcessor = Processor.createImplementation({
    implementation: DdbProcessorImpl,
    dependencies: [Logger, PutDynamoDbRecordExecutor, S3CopyExecutor, DdbTransformContextFactory]
});

export namespace DdbProcessor {
    export type ShardState = DdbShardState;
}
