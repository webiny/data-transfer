import { describe, it, expect } from "vitest";
import { TransformPipeline } from "~/domain/transform/Pipeline.ts";
import type { Transformer } from "~/domain/transform/Transformer.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { DdbTransformContextFactory } from "~/features/TransformContext/index.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import { createDdbContainer } from "./containers/index.ts";

describe("Nested Pipeline Execution", () => {
    it("should execute nested pipeline on multiple records and merge commands", async () => {
        const container = createDdbContainer();
        const factory = container.resolve(DdbTransformContextFactory);

        const nestedTransformer: Transformer<DdbTransformContext.Interface> = {
            name: "addNestedFlag",
            transform(ctx) {
                ctx.record.nestedProcessed = true;
            }
        };

        const nestedPipeline = new TransformPipeline().use(nestedTransformer);

        const parentTransformer: Transformer<DdbTransformContext.Interface> = {
            name: "processRelatedRecords",
            async transform(ctx) {
                const relatedRecords = [
                    { PK: "RELATED#1", SK: "A", TYPE: "related", data: "record1" },
                    { PK: "RELATED#2", SK: "A", TYPE: "related", data: "record2" }
                ];
                const commands = await ctx.executePipeline(nestedPipeline, relatedRecords);
                expect(commands.size()).toBe(2);
                expect(commands.get(PutRecord.key)).toHaveLength(2);
            }
        };

        const parentPipeline = new TransformPipeline().use(parentTransformer);

        const parentRecord = {
            PK: "PARENT#1",
            SK: "A",
            _et: "x",
            _ct: "x",
            _md: "x",
            TYPE: "parent"
        } as any;
        const result = await parentPipeline.run(parentRecord, factory);

        expect(result).toBeTruthy();
        // Parent + 2 nested records
        expect(result!.commands.get(PutRecord.key)).toHaveLength(3);

        const nestedPuts = result!.commands
            .get<PutRecord>(PutRecord.key)
            .filter(c => (c.record as any).PK.startsWith("RELATED"));
        expect(nestedPuts).toHaveLength(2);
        for (const put of nestedPuts) {
            expect((put.record as any).nestedProcessed).toBe(true);
        }
    });

    it("should handle nested pipeline with S3 copy commands", async () => {
        const container = createDdbContainer();
        const factory = container.resolve(DdbTransformContextFactory);

        const fileCopyTransformer: Transformer<DdbTransformContext.Interface> = {
            name: "copyFileMetadata",
            transform(ctx) {
                const fileKey = ctx.record.key as string;
                ctx.copyFile(fileKey, `migrated/${fileKey}`);
            }
        };

        const nestedPipeline = new TransformPipeline().use(fileCopyTransformer);

        const parentTransformer: Transformer<DdbTransformContext.Interface> = {
            name: "processFileReferences",
            async transform(ctx) {
                const fileRecords = [
                    { PK: "FILE#1", SK: "A", key: "file1.jpg" },
                    { PK: "FILE#2", SK: "A", key: "file2.jpg" }
                ];
                await ctx.executePipeline(nestedPipeline, fileRecords);
            }
        };

        const parentPipeline = new TransformPipeline().use(parentTransformer);

        const parentRecord = {
            PK: "ENTRY#1",
            SK: "A",
            _et: "x",
            _ct: "x",
            _md: "x",
            TYPE: "entry"
        } as any;
        const result = await parentPipeline.run(parentRecord, factory);

        expect(result).toBeTruthy();

        const s3Commands = result!.commands.get<S3Copy>(S3Copy.key);
        expect(s3Commands).toHaveLength(2);
        expect(s3Commands[0].targetKey).toBe("migrated/file1.jpg");
        expect(s3Commands[1].targetKey).toBe("migrated/file2.jpg");
    });

    it("should handle empty record array", async () => {
        const container = createDdbContainer();
        const factory = container.resolve(DdbTransformContextFactory);

        const nestedPipeline = new TransformPipeline();

        const parentTransformer: Transformer<DdbTransformContext.Interface> = {
            name: "processNoRecords",
            async transform(ctx) {
                const commands = await ctx.executePipeline(nestedPipeline, []);
                expect(commands.size()).toBe(0);
            }
        };

        const parentPipeline = new TransformPipeline().use(parentTransformer);

        const result = await parentPipeline.run(
            { PK: "TEST#1", SK: "A", _et: "x", _ct: "x", _md: "x", TYPE: "x" } as any,
            factory
        );

        expect(result!.commands.get(PutRecord.key)).toHaveLength(1);
    });

    it("should skip records that don't match nested pipeline filters", async () => {
        const container = createDdbContainer();
        const factory = container.resolve(DdbTransformContextFactory);

        const nestedPipeline = new TransformPipeline()
            .filter(record => record.TYPE === "accepted")
            .use({
                name: "addFlag",
                transform(ctx) {
                    ctx.record.processed = true;
                }
            });

        const parentTransformer: Transformer<DdbTransformContext.Interface> = {
            name: "processFiltered",
            async transform(ctx) {
                const records = [
                    { PK: "REC#1", SK: "A", TYPE: "accepted" },
                    { PK: "REC#2", SK: "A", TYPE: "rejected" },
                    { PK: "REC#3", SK: "A", TYPE: "accepted" }
                ];
                const commands = await ctx.executePipeline(nestedPipeline, records);
                expect(commands.size()).toBe(2);
            }
        };

        const parentPipeline = new TransformPipeline().use(parentTransformer);

        const result = await parentPipeline.run(
            { PK: "PARENT#1", SK: "A", _et: "x", _ct: "x", _md: "x", TYPE: "x" } as any,
            factory
        );

        // Parent + 2 accepted nested records
        expect(result!.commands.get(PutRecord.key)).toHaveLength(3);
    });
});
