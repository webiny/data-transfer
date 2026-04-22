import { describe, expect, it } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { MockS3Client } from "../../services/S3Client/MockS3Client.ts";
import { SourceS3Client, TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { S3Processor } from "~/features/S3Processor/abstractions/S3Processor.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface BaseStub<TRecord> {
    base: BaseTransformContext.Interface<TRecord>;
    captured: unknown[];
}

function makeBase<TRecord>(record: TRecord): BaseStub<TRecord> {
    const captured: unknown[] = [];
    const base: BaseTransformContext.Interface<TRecord> = {
        record,
        original: Object.freeze(record) as Readonly<TRecord>,
        modelProvider: {} as BaseTransformContext.Interface<TRecord>["modelProvider"],
        cache: {} as BaseTransformContext.Interface<TRecord>["cache"],
        replace(newRecord: TRecord): void {
            base.record = newRecord;
        },
        addCommand(cmd): void {
            captured.push(cmd);
        },
        async querySourceRecord(): Promise<null> {
            return null;
        },
        async queryTargetRecord(): Promise<null> {
            return null;
        }
    };
    return { base, captured };
}

describe("S3Processor", () => {
    describe("extendContext", () => {
        it("returns copyFile that pushes S3Copy commands using configured source/target buckets", () => {
            const container = createDdbContainer();
            const processor = container.resolve(S3Processor);
            const { base, captured } = makeBase({ id: "r1" } as const);

            // S3Processor always defines extendContext; the optional signature
            // is only for hypothetical execute-only processors.
            const slice = processor.extendContext!(base);
            slice.copyFile("src/key", "tgt/key");

            expect(captured).toHaveLength(1);
            const copy = captured[0] as S3Copy;
            expect(copy.key).toBe(S3Copy.key);
            expect(copy.sourceBucket).toBe("source-bucket");
            expect(copy.targetBucket).toBe("target-bucket");
            expect(copy.sourceKey).toBe("src/key");
            expect(copy.targetKey).toBe("tgt/key");
        });

        it("exposes getFile that delegates to the SourceS3Client", async () => {
            const container = createDdbContainer();
            const sourceS3 = container.resolve(SourceS3Client) as MockS3Client;
            sourceS3.putObject("source-bucket", "foo.txt", Buffer.from("hello"));

            const processor = container.resolve(S3Processor);
            const { base } = makeBase({ id: "r1" } as const);
            // S3Processor always defines extendContext; the optional signature
            // is only for hypothetical execute-only processors.
            const slice = processor.extendContext!(base);

            const contents = await slice.getFile("foo.txt");
            expect(contents?.toString()).toBe("hello");
        });
    });

    describe("execute", () => {
        it("is a no-op when Commands contains no S3Copy entries", async () => {
            const container = createDdbContainer();
            const processor = container.resolve(S3Processor);
            const targetS3 = container.resolve(TargetS3Client) as MockS3Client;
            expect(targetS3.copies).toHaveLength(0);

            await processor.execute(new Commands());
            expect(targetS3.copies).toHaveLength(0);
        });

        it("maps S3Copy commands into batchCopy operations on the TargetS3Client", async () => {
            const container = createDdbContainer();
            const processor = container.resolve(S3Processor);
            const targetS3 = container.resolve(TargetS3Client) as MockS3Client;

            const commands = new Commands();
            commands.add(
                S3Copy.create({
                    sourceBucket: "sb",
                    sourceKey: "sk",
                    targetBucket: "tb",
                    targetKey: "tk"
                })
            );
            // Unrelated command keys are left to other processors; S3Processor
            // only claims S3Copy entries.
            commands.add(PutRecord.create({ table: "t", record: { PK: "a", SK: "1" } }));

            await processor.execute(commands);

            expect(targetS3.copies).toHaveLength(1);
            expect(targetS3.copies[0]).toEqual({
                sourceBucket: "sb",
                sourceKey: "sk",
                targetBucket: "tb",
                targetKey: "tk"
            });
        });
    });

    describe("afterShard", () => {
        it("is not implemented (no cross-boundary state)", () => {
            const container = createDdbContainer();
            const processor = container.resolve(S3Processor);
            expect(processor.afterShard).toBeUndefined();
        });
    });
});
