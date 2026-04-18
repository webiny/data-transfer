import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { OsCommandExecutor } from "~/features/OsCommandExecutor/index.ts";
import {
    OsTransformContext,
    OsTransformContextFactory
} from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { OsRecord } from "~/features/OsScanner/abstractions/OsScanner.ts";
import type { OsShardState } from "./abstractions/OsProcessor.ts";

class OsProcessorImpl implements Processor.Interface<
    OsRecord,
    OsTransformContext.Interface<OsRecord>
> {
    private readonly touchedIndexes: Map<string, string> = new Map();

    public constructor(
        private readonly executor: OsCommandExecutor.Interface,
        private readonly contextFactory: OsTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            return;
        }
        const items: OsCommandExecutor.Item[] = puts.map(put => {
            const r = put.record as OsRecord;
            return {
                record: r,
                metadata: {
                    index: r.index,
                    _ct: r._ct,
                    _md: r._md
                },
                locale: r.locale
            };
        });
        await this.executor.execute(items, this.touchedIndexes);
    }

    public createContext(record: OsRecord): OsTransformContext.Interface<OsRecord> {
        return this.contextFactory.create({ record });
    }

    public getShardState(): OsShardState {
        return { touchedIndexes: Object.fromEntries(this.touchedIndexes) };
    }
}

export const OsProcessor = Processor.createImplementation({
    implementation: OsProcessorImpl,
    dependencies: [OsCommandExecutor, OsTransformContextFactory]
});
