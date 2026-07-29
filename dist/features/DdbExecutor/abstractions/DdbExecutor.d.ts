import type { PutRecord } from "../../../domain/transform/commands/PutRecord.js";
export interface IDdbExecutor {
  /** Write PutRecord commands to the target DDB table. Groups by table; no-op on empty input. */
  execute(puts: PutRecord[]): Promise<void>;
}
export declare const DdbExecutor: import("@webiny/di").Abstraction<IDdbExecutor>;
export declare namespace DdbExecutor {
  type Interface = IDdbExecutor;
}
//# sourceMappingURL=DdbExecutor.d.ts.map
