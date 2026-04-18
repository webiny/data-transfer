import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OsRecordDecompressor } from "~/features/OsRecordDecompressor/index.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import type { OsRecord, OsShard } from "./abstractions/OsScanner.ts";

class OsScannerImpl implements Scanner.Interface<OsRecord, OsShard> {
    public constructor(
        private readonly source: SourceDynamoDbClient.Interface,
        private readonly decompressor: OsRecordDecompressor.Interface,
        private readonly config: MigrationConfig.Interface
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
        for await (const raw of this.source.scan(tableName, {
            segment: shard.segment,
            totalSegments: shard.total
        })) {
            const decompressed = await this.decompressor.decompress(raw);
            if (!decompressed) {
                continue;
            }
            const merged: OsRecord = {
                ...decompressed.record,
                PK: decompressed.record.PK as string,
                SK: decompressed.record.SK as string,
                _et: decompressed.record._et as string,
                _ct: decompressed.metadata._ct,
                _md: decompressed.metadata._md,
                TYPE: decompressed.record.TYPE as string,
                index: decompressed.metadata.index,
                locale: decompressed.locale
            };
            yield merged;
        }
    }
}

export const OsScanner = Scanner.createImplementation({
    implementation: OsScannerImpl,
    dependencies: [SourceDynamoDbClient, OsRecordDecompressor, MigrationConfig]
});
