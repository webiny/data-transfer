import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Pipeline, createFilter } from "~/domain/pipeline/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";

type AnyPipeline = Pipeline<unknown, Processor.Context, unknown>;

const passthroughTransformer = (_ctx: DdbTransformContext.Interface<BaseRecord>): void => {
    // no-op: the runner auto-emits a PutRecord for the final ctx.record
};

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

describe("PipelineRunner — end-to-end against MockDynamoDbClient", () => {
    it("scans source DDB, dispatches matching records through transformers, writes to target via processor", async () => {
        const sourceRecords = [
            makeRecord("tenant-1", "team-1", "security.team"),
            makeRecord("tenant-1", "group-1", "security.group"),
            makeRecord("tenant-1", "team-2", "security.team")
        ];
        const container = createDdbContainer({
            sourceRecords: { "source-table": sourceRecords }
        });

        const runner = container.resolve(PipelineRunner);

        const teamsBuilder = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbScanner.Shard
        >({
            name: "teams",
            scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
            processor: Processor as Abstraction<
                Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
            >
        });
        teamsBuilder
            .filter(createFilter<BaseRecord>(r => r.TYPE === "security.team"))
            .use(passthroughTransformer);
        runner.register(teamsBuilder.build() as unknown as AnyPipeline);

        const groupsBuilder = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbScanner.Shard
        >({
            name: "groups",
            scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
            processor: Processor as Abstraction<
                Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
            >
        });
        groupsBuilder
            .filter(createFilter<BaseRecord>(r => r.TYPE === "security.group"))
            .use(passthroughTransformer);
        runner.register(groupsBuilder.build() as unknown as AnyPipeline);

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const written = targetDb.batchPutRecords;

        expect(written).toHaveLength(3);
        const types = written.map(r => (r as BaseRecord).TYPE).sort();
        expect(types).toEqual(["security.group", "security.team", "security.team"]);
    });

    it("registering two pipelines with the same name throws even across different filters", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);

        const builderA = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbScanner.Shard
        >({
            name: "dup",
            scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
            processor: Processor as Abstraction<
                Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
            >
        });
        builderA.filter(createFilter<BaseRecord>(() => true));
        runner.register(builderA.build() as unknown as AnyPipeline);

        const builderB = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbScanner.Shard
        >({
            name: "dup",
            scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
            processor: Processor as Abstraction<
                Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
            >
        });
        builderB.filter(createFilter<BaseRecord>(() => true));

        expect(() => runner.register(builderB.build() as unknown as AnyPipeline)).toThrow(
            /already registered/i
        );
    });

    it("auto-puts the transformed record after the transformer chain (no manual ctx.putRecord needed)", async () => {
        const sourceRecords = [makeRecord("tenant-1", "team-1", "security.team")];
        const container = createDdbContainer({
            sourceRecords: { "source-table": sourceRecords }
        });
        const runner = container.resolve(PipelineRunner);

        const builder = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbScanner.Shard
        >({
            name: "mutation-only",
            scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
            processor: Processor as Abstraction<
                Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
            >
        });
        const tagTransformer = (ctx: DdbTransformContext.Interface<BaseRecord>): void => {
            (ctx.record as BaseRecord & { tagged?: boolean }).tagged = true;
        };
        builder
            .filter(createFilter<BaseRecord>(r => r.TYPE === "security.team"))
            .use(tagTransformer);
        runner.register(builder.build() as unknown as AnyPipeline);

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        expect(targetDb.batchPutRecords).toHaveLength(1);
        expect((targetDb.batchPutRecords[0] as BaseRecord & { tagged?: boolean }).tagged).toBe(
            true
        );
    });
});
