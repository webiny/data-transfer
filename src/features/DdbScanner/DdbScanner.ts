import { Scanner } from "~/domain/pipeline/abstractions/Scanner.js";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import type { DdbShard } from "./abstractions/DdbScanner.ts";

export type { IScanner } from "~/domain/pipeline/abstractions/Scanner.js";

class DdbScannerImpl implements Scanner.Interface<BaseRecord, DdbShard> {
    public constructor(
        private readonly source: SourceDynamoDbClient.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public async listShards(): Promise<DdbShard[]> {
        const total = this.config.pipeline?.segments ?? 1;
        const shards: DdbShard[] = [];
        for (let i = 0; i < total; i++) {
            shards.push({ segment: i, total });
        }
        return shards;
    }

    public async *scan(shard: DdbShard): AsyncIterable<BaseRecord> {
        yield* this.source.scan(this.config.source.dynamodb.tableName, {
            segment: shard.segment,
            totalSegments: shard.total
        });
    }
}

export const DdbScanner = Scanner.createImplementation({
    implementation: DdbScannerImpl,
    dependencies: [SourceDynamoDbClient, MigrationConfig]
});

export namespace DdbScanner {
    export type Shard = DdbShard;
}
