import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { OsLiveFieldRunner as OsLiveFieldRunnerAbstraction } from "./abstractions/LiveFieldRunner.ts";
import { LiveFieldReconciler } from "./abstractions/LiveFieldReconciler.ts";
import { OsRecordDecompressor } from "~/features/OsRecordDecompressor/abstractions/OsRecordDecompressor.js";
import { Logger } from "~/tools/Logger/abstractions/Logger.js";
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import {
    BaseLiveFieldRunner,
    type AttributeWrite,
    type GroupPreparation
} from "./BaseLiveFieldRunner.ts";
import { isInternalModel } from "./cmsEntryGuards.ts";

export type { ILiveFieldRunner } from "./abstractions/LiveFieldRunner.js";

const LATEST_SK = "L";

class OsLiveFieldRunnerImpl extends BaseLiveFieldRunner {
    protected readonly table: LiveFieldReconciler.Table = "os";

    public constructor(
        reconciler: LiveFieldReconciler.Interface,
        logger: Logger.Interface,
        private readonly decompressor: OsRecordDecompressor.Interface,
        private readonly compression: CompressionHandler.Interface
    ) {
        super(reconciler, logger);
    }

    protected acceptsRow(_row: DatabaseRecord): boolean {
        return true;
    }

    protected async prepareGroup(_pk: string, rows: DatabaseRecord[]): Promise<GroupPreparation> {
        const records = new Map<string, LiveFieldReconciler.Record>();
        for (const row of rows) {
            const data = await this.decompressRow(row);
            if (data === null) {
                return {
                    kind: "skipped",
                    reason: "decompress-failed",
                    detail: `SK=${row.SK}`
                };
            }
            records.set(row.SK, {
                ...row,
                _md: typeof row._md === "string" ? row._md : "",
                data
            });
        }
        const latest = records.get(LATEST_SK);
        if (latest && isInternalModel(latest.data.modelId)) {
            return { kind: "ignored" };
        }
        return { kind: "ready", records };
    }

    protected async buildWrite(
        change: LiveFieldReconciler.Change,
        record: LiveFieldReconciler.Record
    ): Promise<AttributeWrite> {
        const data = { ...record.data, live: change.after };
        const compressed = await this.compression.compress(data);
        return { path: ["data"], value: compressed };
    }

    private async decompressRow(row: DatabaseRecord): Promise<Record<string, unknown> | null> {
        try {
            return await this.decompressor.decompress(row as OsRecordDecompressor.Compressed);
        } catch (error) {
            this.logger.warn(
                `fix-live[os]: failed to decompress ${row.PK} ${row.SK}: ${String(error)}`
            );
            return null;
        }
    }
}

export const OsLiveFieldRunner = OsLiveFieldRunnerAbstraction.createImplementation({
    implementation: OsLiveFieldRunnerImpl,
    dependencies: [LiveFieldReconciler, Logger, OsRecordDecompressor, CompressionHandler]
});
