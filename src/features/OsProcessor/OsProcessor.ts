import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { OsCommandExecutor } from "~/features/OsCommandExecutor/index.ts";
import {
    OsTransformContext,
    OsTransformContextFactory
} from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import type { OsShardState } from "./abstractions/OsProcessor.ts";

type OsRecord = OsScanner.Record;

interface PendingOsMetadata {
    locale: string;
    index: string;
    _ct: string;
    _md: string;
}

class OsProcessorImpl implements Processor.Interface<
    OsRecord,
    OsTransformContext.Interface<OsRecord>
> {
    private readonly touchedIndexes: Map<string, string> = new Map();
    private readonly pendingMetadata: PendingOsMetadata[] = [];

    public constructor(
        private readonly executor: OsCommandExecutor.Interface,
        private readonly contextFactory: OsTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            this.pendingMetadata.length = 0;
            return;
        }
        if (puts.length !== this.pendingMetadata.length) {
            throw new Error(
                `OsProcessor: metadata/PutRecord count mismatch ` +
                    `(expected ${this.pendingMetadata.length}, got ${puts.length}). ` +
                    `An OS transformer likely emitted extra PutRecords — revisit OsProcessor's 1:1 assumption.`
            );
        }
        const items: OsCommandExecutor.Item[] = puts.map((put, i) => {
            const r = put.record as OsRecord;
            const meta = this.pendingMetadata[i]!;
            return {
                record: r,
                metadata: {
                    index: meta.index,
                    _ct: meta._ct,
                    _md: meta._md
                },
                locale: meta.locale
            };
        });
        this.pendingMetadata.length = 0;
        await this.executor.execute(items, this.touchedIndexes);
    }

    public createContext(record: OsRecord): OsTransformContext.Interface<OsRecord> {
        // Capture pre-transform metadata BEFORE transformers can strip it.
        // removeLocale deletes record.locale; OsCommandExecutor still needs it
        // at execute() time to compute the target index name (stripLocaleFromIndex).
        // Index/_ct/_md are captured alongside for symmetry — the PutRecord.record
        // is no longer a reliable carrier for any of these pre-transform values.
        this.pendingMetadata.push({
            locale: record.locale,
            index: record.index,
            _ct: record._ct,
            _md: record._md
        });
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

export namespace OsProcessor {
    export type ShardState = OsShardState;
}
