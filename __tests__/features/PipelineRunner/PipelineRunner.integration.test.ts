import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { createFilter } from "~/domain/pipeline/index.js";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/contextAliases.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import { DdbScanner } from "~/features/DdbScanner/index.js";
import { DdbProcessor } from "~/features/DdbProcessor/index.js";
import { S3Processor } from "~/features/S3Processor/index.js";
import { MockS3Client } from "../../services/S3Client/MockS3Client.ts";
import { TargetS3Client } from "~/services/S3Client/abstractions/S3Client.js";

// Pipelines built with processors:[DdbProcessor] expose only the DDB slice —
// the S3-slice-bearing alias DdbTransformContext.Interface is too wide.
interface DdbOnlyCtx extends BaseTransformContext.Interface<BaseRecord> {
    putRecord(record: Record<string, unknown>): void;
}

const passthroughTransformer = (_ctx: DdbOnlyCtx): void => {
    // no-op: DdbProcessor.onEnd auto-emits a PutRecord for ctx.record
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

        const teamsBuilder = container.resolve(PipelineBuilderFactory).create({
            name: "teams",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        teamsBuilder
            .filter(createFilter<BaseRecord>(r => r.TYPE === "security.team"))
            .use(passthroughTransformer);
        runner.register(await teamsBuilder.build());

        const groupsBuilder = container.resolve(PipelineBuilderFactory).create({
            name: "groups",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        groupsBuilder
            .filter(createFilter<BaseRecord>(r => r.TYPE === "security.group"))
            .use(passthroughTransformer);
        runner.register(await groupsBuilder.build());

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const written = targetDb.batchPutRecords;

        expect(written).toHaveLength(3);
        const types = written.map(r => (r as BaseRecord).TYPE).sort();
        expect(types).toEqual(["security.group", "security.team", "security.team"]);
    });

    it("registering two pipelines with the same name throws even across different filters", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);

        const builderA = container.resolve(PipelineBuilderFactory).create({
            name: "dup",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builderA.filter(createFilter<BaseRecord>(() => true));
        runner.register(await builderA.build());

        const builderB = container.resolve(PipelineBuilderFactory).create({
            name: "dup",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builderB.filter(createFilter<BaseRecord>(() => true));

        await expect(async () => {
            const p = await builderB.build();
            runner.register(p);
        }).rejects.toThrow(/already registered/i);
    });

    it("pure passthrough: zero filters + zero transformers copies every source record to target unchanged", async () => {
        // Data-transfer use case: prod → dev seeding with no transformation.
        // Pipeline with no .filter() and no .use() must still work — accept
        // every scanned record, emit it verbatim via DdbProcessor.onEnd.
        const sourceRecords = [
            makeRecord("tenant-1", "a", "foo"),
            makeRecord("tenant-1", "b", "bar"),
            makeRecord("tenant-2", "c", "baz")
        ];
        const container = createDdbContainer({
            sourceRecords: { "source-table": sourceRecords }
        });
        const runner = container.resolve(PipelineRunner);

        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "passthrough",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        // Intentionally no .filter() and no .use()
        runner.register(await builder.build());

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const written = targetDb.batchPutRecords as BaseRecord[];
        expect(written).toHaveLength(sourceRecords.length);

        const bySk = new Map(written.map(r => [r.SK, r]));
        for (const source of sourceRecords) {
            const target = bySk.get(source.SK);
            expect(target).toBeDefined();
            expect(target).toEqual(source);
        }
    });

    it("DdbProcessor.onEnd auto-puts the transformed record after the transformer chain", async () => {
        const sourceRecords = [makeRecord("tenant-1", "team-1", "security.team")];
        const container = createDdbContainer({
            sourceRecords: { "source-table": sourceRecords }
        });
        const runner = container.resolve(PipelineRunner);

        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "mutation-only",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        const tagTransformer = (ctx: DdbOnlyCtx): void => {
            (ctx.record as BaseRecord & { tagged?: boolean }).tagged = true;
        };
        builder
            .filter(createFilter<BaseRecord>(r => r.TYPE === "security.team"))
            .use(tagTransformer);
        runner.register(await builder.build());

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        expect(targetDb.batchPutRecords).toHaveLength(1);
        expect((targetDb.batchPutRecords[0] as BaseRecord & { tagged?: boolean }).tagged).toBe(
            true
        );
    });

    it("multi-processor pipeline: DdbProcessor + S3Processor each drain their own commands at shard end", async () => {
        // Two records. The transformer calls ctx.copyFile() (S3Processor slice) on
        // each. DdbProcessor.onEnd still auto-puts record → target DDB; S3Processor
        // drains S3Copy commands → MockS3Client.batchCopy.
        const sourceRecords = [
            makeRecord("tenant-1", "f1", "fm.file"),
            makeRecord("tenant-1", "f2", "fm.file")
        ];
        const container = createDdbContainer({
            sourceRecords: { "source-table": sourceRecords }
        });
        const runner = container.resolve(PipelineRunner);

        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "files",
            scanner: DdbScanner,
            processors: [DdbProcessor, S3Processor]
        });
        const copyTransformer = (ctx: DdbTransformContext.Interface<BaseRecord>): void => {
            ctx.copyFile(`src/${ctx.record.SK}`, `tgt/${ctx.record.SK}`);
        };
        builder.filter(createFilter<BaseRecord>(r => r.TYPE === "fm.file")).use(copyTransformer);
        runner.register(await builder.build());

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        expect(targetDb.batchPutRecords).toHaveLength(2);

        const targetS3 = container.resolve(TargetS3Client) as MockS3Client;
        expect(targetS3.copies).toHaveLength(2);
        expect(targetS3.copies[0]?.sourceKey).toBe("src/f1");
        expect(targetS3.copies[1]?.sourceKey).toBe("src/f2");
    });

    it("run({segment:0, totalSegments:1}) on a single-shard scanner matches run()", async () => {
        const records = [
            makeRecord("tenant-1", "team-1", "security.team"),
            makeRecord("tenant-1", "team-2", "security.team")
        ];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const runner = container.resolve(PipelineRunner);

        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "single-shard-shardmode",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(r => r.TYPE === "security.team"));
        runner.register(await builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        expect(targetDb.batchPutRecords).toHaveLength(2);
    });
});
