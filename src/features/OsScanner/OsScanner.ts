import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OsRecordDecompressor } from "~/features/OsRecordDecompressor/index.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import type { OsRecord, OsShard } from "./abstractions/OsScanner.ts";
import { Logger } from "~/tools/Logger/index.js";

class OsScannerImpl implements Scanner.Interface<OsRecord, OsShard> {
    public constructor(
        private readonly source: SourceDynamoDbClient.Interface,
        private readonly decompressor: OsRecordDecompressor.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly logger: Logger.Interface
    ) {}

    public async listShards(): Promise<OsShard[]> {
        const total = this.config.pipeline.segments ?? 1;
        const shards: OsShard[] = [];
        for (let i = 0; i < total; i++) {
            shards.push({ segment: i, total });
        }
        return shards;
    }

    public async *scan(shard: OsShard): AsyncIterable<OsRecord> {
        if (this.config.storage !== "os") {
            throw new Error("OsScanner: source is not in OS storage mode; check config.storage");
        }
        const tableName = this.config.source.opensearch.tableName;
        for await (const raw of this.source.scan<OsRecordDecompressor.Compressed>(tableName, {
            segment: shard.segment,
            totalSegments: shard.total
        })) {
            const { index } = raw;
            if (!index) {
                continue;
            }
            const decompressed = await this.decompressor.decompress(raw);
            if (!decompressed) {
                this.logger.debug(
                    "Nothing to decompress for record with PK %s and SK %s",
                    raw.PK,
                    raw.SK
                );
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

export namespace OsScanner {
    export type Record = OsRecord;
    export type Shard = OsShard;
}
