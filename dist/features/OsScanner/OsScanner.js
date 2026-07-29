import { Scanner } from "../../domain/pipeline/abstractions/Scanner.js";
import { SourceDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { OsRecordDecompressor } from "../../features/OsRecordDecompressor/index.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { Logger } from "../../tools/Logger/index.js";
class OsScannerImpl {
  source;
  decompressor;
  config;
  logger;
  constructor(source, decompressor, config, logger) {
    this.source = source;
    this.decompressor = decompressor;
    this.config = config;
    this.logger = logger;
  }
  async listShards() {
    const total = this.config.pipeline?.segments ?? 1;
    const shards = [];
    for (let i = 0; i < total; i++) {
      shards.push({ segment: i, total });
    }
    return shards;
  }
  async *scan(shard) {
    if (!this.config.source.opensearch) {
      throw new Error("OsScanner: config.source.opensearch is not configured.");
    }
    const tableName = this.config.source.opensearch.tableName;
    for await (const raw of this.source.scan(tableName, {
      segment: shard.segment,
      totalSegments: shard.total
    })) {
      const { index } = raw;
      if (!index) {
        continue;
      }
      const decompressed = await this.decompressor.decompress(raw);
      if (!decompressed) {
        this.logger.debug("Nothing to decompress for record with PK %s and SK %s", raw.PK, raw.SK);
      }
      yield {
        ...raw,
        index,
        data: decompressed || {}
      };
    }
  }
}
export const OsScanner = Scanner.createImplementation({
  implementation: OsScannerImpl,
  dependencies: [SourceDynamoDbClient, OsRecordDecompressor, MigrationConfig, Logger]
});
//# sourceMappingURL=OsScanner.js.map
