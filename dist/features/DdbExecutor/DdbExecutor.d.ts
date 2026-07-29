import { TargetDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import type { PutRecord } from "../../domain/transform/commands/PutRecord.js";
import { DdbExecutor as DdbExecutorAbstraction } from "./abstractions/DdbExecutor.ts";
export type { IDdbExecutor } from "./abstractions/DdbExecutor.js";
declare class DdbExecutorImpl implements DdbExecutorAbstraction.Interface {
  private readonly targetDb;
  constructor(targetDb: TargetDynamoDbClient.Interface);
  execute(puts: PutRecord[]): Promise<void>;
}
export declare const DdbExecutor: typeof DdbExecutorImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/DdbExecutor.ts").IDdbExecutor
  >;
};
//# sourceMappingURL=DdbExecutor.d.ts.map
