import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { createFilter } from "~/domain/pipeline/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";

function makeRecord(pk: string, sk: string, type: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type
    };
}

describe("PipelineRunner.run — shard mode", () => {
    it("processes only the requested shard when opts given", async () => {
        const records = Array.from({ length: 8 }, (_, i) =>
            makeRecord("T#root", `sk-${i}`, "test.record")
        );
        const container = createDdbContainer({
            sourceRecords: { "source-table": records },
            pipelineOverride: { segments: 4 }
        });
        const runner = container.resolve(PipelineRunner);

        const builder = runner.pipeline({
            name: "shard-test",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(() => true));
        runner.register(builder.build());

        await runner.run({ segment: 0, totalSegments: 4 });

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        // MockDynamoDbClient.scan distributes records by i % totalSegments === segment.
        // 8 records split into 4 shards → 2 records per shard.
        expect(targetDb.batchPutRecords).toHaveLength(2);
    });

    it("throws when scanner's listShards length mismatches totalSegments", async () => {
        const container = createDdbContainer({ pipelineOverride: { segments: 2 } });
        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline({
            name: "mismatch",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(() => true));
        runner.register(builder.build());

        await expect(runner.run({ segment: 0, totalSegments: 4 })).rejects.toThrow(
            /scanner.*reported 2 shards.*totalSegments=4/i
        );
    });
});
