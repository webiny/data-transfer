import { Scanner } from "../../domain/pipeline/abstractions/Scanner.js";
import { SourceDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import type { BaseRecord } from "../../domain/transform/types/records.js";
import type { DdbShard } from "./abstractions/DdbScanner.ts";
export type { IScanner } from "../../domain/pipeline/abstractions/Scanner.js";
declare class DdbScannerImpl implements Scanner.Interface<BaseRecord, DdbShard> {
  private readonly source;
  private readonly config;
  constructor(source: SourceDynamoDbClient.Interface, config: MigrationConfig.Interface);
  listShards(): Promise<DdbShard[]>;
  scan(shard: DdbShard): AsyncIterable<BaseRecord>;
}
export declare const DdbScanner: typeof DdbScannerImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("../../domain/pipeline/abstractions/Scanner.js").IScanner<unknown, unknown>
  >;
};
export declare namespace DdbScanner {
  type Shard = DdbShard;
}
//# sourceMappingURL=DdbScanner.d.ts.map
