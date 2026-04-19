import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { PutOsDynamoDbRecordExecutor } from "~/features/PutOsDynamoDbRecordExecutor/abstractions/PutOsDynamoDbRecordExecutor.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import {
    OsTransformContext,
    OsTransformContextFactory
} from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import type { OsShardState } from "./abstractions/OsProcessor.ts";

type OsRecord = OsScanner.Record;

const KNOWN_KEYS: ReadonlySet<string> = new Set([PutRecord.key]);

class OsProcessorImpl implements Processor.Interface<
    OsRecord,
    OsTransformContext.Interface<OsRecord>
> {
    private readonly warnedKeys: Set<string> = new Set();

    public constructor(
        private readonly logger: Logger.Interface,
        private readonly putOsExecutor: PutOsDynamoDbRecordExecutor.Interface,
        private readonly contextFactory: OsTransformContextFactory.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        this.warnOnUnknownKeys(commands);
        const puts = commands.get<PutRecord>(PutRecord.key);
        await this.putOsExecutor.execute(puts);
    }

    public createContext(record: OsRecord): OsTransformContext.Interface<OsRecord> {
        return this.contextFactory.create({ record });
    }

    public getShardState(): OsShardState {
        return { touchedIndexes: this.touchedIndexes.all() };
    }

    private warnOnUnknownKeys(commands: Commands): void {
        for (const key of commands.keys()) {
            if (!KNOWN_KEYS.has(key) && !this.warnedKeys.has(key)) {
                this.warnedKeys.add(key);
                this.logger.warn(`OsProcessor does not handle command key "${key}" — ignored`);
            }
        }
    }
}

export const OsProcessor = Processor.createImplementation({
    implementation: OsProcessorImpl,
    dependencies: [Logger, PutOsDynamoDbRecordExecutor, OsTransformContextFactory, TouchedIndexes]
});

export namespace OsProcessor {
    export type ShardState = OsShardState;
}
