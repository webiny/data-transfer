import { Scanner } from "../../domain/pipeline/abstractions/Scanner.js";
import { SourceDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { OsRecordDecompressor } from "../../features/OsRecordDecompressor/index.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import type { OsRecord, OsShard } from "./abstractions/OsScanner.ts";
import { Logger } from "../../tools/Logger/index.js";
export type { IScanner } from "../../domain/pipeline/abstractions/Scanner.js";
declare class OsScannerImpl implements Scanner.Interface<OsRecord, OsShard> {
  private readonly source;
  private readonly decompressor;
  private readonly config;
  private readonly logger;
  constructor(
    source: SourceDynamoDbClient.Interface,
    decompressor: OsRecordDecompressor.Interface,
    config: MigrationConfig.Interface,
    logger: Logger.Interface
  );
  listShards(): Promise<OsShard[]>;
  scan(shard: OsShard): AsyncIterable<OsRecord>;
}
export declare const OsScanner: typeof OsScannerImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("../../domain/pipeline/abstractions/Scanner.js").IScanner<unknown, unknown>
  >;
};
export declare namespace OsScanner {
  type Record = OsRecord;
  type Shard = OsShard;
}
//# sourceMappingURL=OsScanner.d.ts.map
