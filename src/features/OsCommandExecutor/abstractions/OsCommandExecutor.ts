import { createAbstraction } from "~/base/index.ts";
import type { OsRecord } from "~/features/OsScanner/abstractions/OsScanner.ts";

interface IOsCommandExecutor {
    /**
     * Gzip each record's `data` field, ensure the target OS index exists for
     * every distinct `record.index` (creating missing ones with refresh
     * disabled), and batch-write the records to the target OS DDB table.
     *
     * Every field on the record is trusted — PK/SK, index, _et/_ct/_md,
     * GSI_TENANT — whatever the transformer chain produced lands on the
     * target as-is. The only transformation the executor performs is gzipping
     * `record.data`.
     *
     * `touchedIndexes` (handler-owned) is mutated with indexName → original
     * refresh_interval so the after-transfer hook can restore them.
     */
    execute(records: OsRecord[], touchedIndexes: Map<string, string>): Promise<void>;
}

export const OsCommandExecutor = createAbstraction<IOsCommandExecutor>("Core/OsCommandExecutor");

export namespace OsCommandExecutor {
    export type Interface = IOsCommandExecutor;
}
