import { createAbstraction } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

interface OsItemMetadata {
    index: string;
    _ct: string;
    _md: string;
}

interface OsItem {
    record: BaseRecord;
    metadata: OsItemMetadata;
    locale: string;
}

interface IOsCommandExecutor {
    /**
     * Gzip each item's record data, build the OS DynamoDB record shape,
     * ensure target indexes exist (creates missing ones, disables refresh),
     * and batch-write to the target OS table.
     *
     * `touchedIndexes` (handler-owned) is mutated with indexName → original
     * refresh_interval so the after-transfer hook can restore them.
     */
    execute(items: OsItem[], touchedIndexes: Map<string, string>): Promise<void>;
}

export const OsCommandExecutor = createAbstraction<IOsCommandExecutor>("Core/OsCommandExecutor");

export namespace OsCommandExecutor {
    export type Interface = IOsCommandExecutor;
    export type Item = OsItem;
    export type Metadata = OsItemMetadata;
}
