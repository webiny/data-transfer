import { DdbLiveFieldRunner as DdbLiveFieldRunnerAbstraction } from "./abstractions/LiveFieldRunner.ts";
import { LiveFieldReconciler } from "./abstractions/LiveFieldReconciler.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.js";
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import {
    BaseLiveFieldRunner,
    type AttributeWrite,
    type GroupPreparation
} from "./BaseLiveFieldRunner.ts";
import { isInternalModel, readModelId } from "./cmsEntryGuards.ts";

export type { ILiveFieldRunner } from "./abstractions/LiveFieldRunner.js";

class DdbLiveFieldRunnerImpl extends BaseLiveFieldRunner {
    protected readonly table: LiveFieldReconciler.Table = "ddb";

    public constructor(reconciler: LiveFieldReconciler.Interface, logger: Logger.Interface) {
        super(reconciler, logger);
    }

    protected acceptsRow(row: DatabaseRecord): boolean {
        return !isInternalModel(readModelId(row));
    }

    protected async prepareGroup(_pk: string, rows: DatabaseRecord[]): Promise<GroupPreparation> {
        const records = new Map<string, LiveFieldReconciler.Record>();
        for (const row of rows) {
            records.set(row.SK, toReconcilable(row));
        }
        return { kind: "ready", records };
    }

    protected async buildWrite(change: LiveFieldReconciler.Change): Promise<AttributeWrite> {
        return { path: ["data", "live"], value: change.after };
    }
}

function toReconcilable(row: DatabaseRecord): LiveFieldReconciler.Record {
    const data = row.data;
    return {
        ...row,
        _md: typeof row._md === "string" ? row._md : "",
        data: typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
    };
}

export const DdbLiveFieldRunner = DdbLiveFieldRunnerAbstraction.createImplementation({
    implementation: DdbLiveFieldRunnerImpl,
    dependencies: [LiveFieldReconciler, Logger]
});
