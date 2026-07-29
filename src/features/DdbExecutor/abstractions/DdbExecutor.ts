import { createAbstraction } from "~/base/index.js";
import type { PutRecord } from "~/domain/transform/commands/PutRecord.js";

interface IDdbExecutor {
    /** Write PutRecord commands to the target DDB table. Groups by table; no-op on empty input. */
    execute(puts: PutRecord[]): Promise<void>;
}

export const DdbExecutor = createAbstraction<IDdbExecutor>("Core/DdbExecutor");

export namespace DdbExecutor {
    export type Interface = IDdbExecutor;
}
