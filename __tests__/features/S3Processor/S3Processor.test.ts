import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { createDdbContainer } from "../../containers/index.ts";
import { MockS3Client } from "../../services/S3Client/MockS3Client.ts";
import { SourceS3Client, TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { S3Processor } from "~/features/S3Processor/S3Processor.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { S3 } from "@webiny/aws-sdk/client-s3/index.js";

vi.mock("@webiny/aws-sdk/client-s3/index.js", () => ({
    S3: vi.fn()
}));

interface BaseStub<TRecord> {
    base: BaseTransformContext.Interface<TRecord>;
    captured: unknown[];
}

function makeBase<TRecord>(record: TRecord): BaseStub<TRecord> {
    const captured: unknown[] = [];
    let blackholed = false;
    const base: BaseTransformContext.Interface<TRecord> = {
        record,
        original: Object.freeze(record) as Readonly<TRecord>,
        modelProvider: {} as BaseTransformContext.Interface<TRecord>["modelProvider"],
        cache: {} as BaseTransformContext.Interface<TRecord>["cache"],
        compressionHandler: {} as CompressionHandler.Interface,
        logger: {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {},
            done: () => {},
            child: function () {
                return this;
            }
        } as unknown as Logger.Interface,
        replace(newRecord: TRecord): void {
            base.record = newRecord;
        },
        addCommand(cmd): void {
            captured.push(cmd);
        },
        get isBlackholed(): boolean {
            return blackholed;
        },
        blackhole(): void {
            blackholed = true;
        }
    };
    return { base, captured };
}

describe("S3Processor", () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    describe("extendContext", () => {
        it("returns copyFile that pushes S3Copy commands using configured source/target buckets", () => {
            const container = createDdbContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;
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

            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;
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
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;
            const targetS3 = container.resolve(TargetS3Client) as MockS3Client;
            expect(targetS3.copies).toHaveLength(0);

            await processor.execute(new Commands());
            expect(targetS3.copies).toHaveLength(0);
        });

        it("maps S3Copy commands into batchCopy operations on the TargetS3Client", async () => {
            const container = createDdbContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;
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
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;
            expect(processor.afterShard).toBeUndefined();
        });
    });

    describe("checkAccess", () => {
        let mockHeadBucket: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            mockHeadBucket = vi.fn();
            vi.mocked(S3).mockImplementation(function (this: {
                headBucket: typeof mockHeadBucket;
                destroy: ReturnType<typeof vi.fn>;
            }) {
                this.headBucket = mockHeadBucket;
                this.destroy = vi.fn();
            } as unknown as typeof S3);
        });

        it("returns ok entries for source and target buckets when HeadBucket succeeds", async () => {
            mockHeadBucket.mockResolvedValue({});
            const container = createDdbContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;

            const entries = await processor.checkAccess();

            expect(entries).toHaveLength(2);
            expect(entries[0]).toEqual({ label: "S3 source bucket: source-bucket", status: "ok" });
            expect(entries[1]).toEqual({ label: "S3 target bucket: target-bucket", status: "ok" });
        });

        it("returns denied when HeadBucket throws AccessDenied on source", async () => {
            mockHeadBucket
                .mockRejectedValueOnce(
                    Object.assign(new Error("Access denied"), { name: "AccessDenied" })
                )
                .mockResolvedValue({});
            const container = createDdbContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "S3 source bucket: source-bucket",
                status: "denied"
            });
            expect(entries[1]).toEqual({ label: "S3 target bucket: target-bucket", status: "ok" });
        });

        it("returns denied when HeadBucket returns HTTP 403", async () => {
            mockHeadBucket.mockRejectedValue(
                Object.assign(new Error("Forbidden"), { $metadata: { httpStatusCode: 403 } })
            );
            const container = createDdbContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "S3 source bucket: source-bucket",
                status: "denied"
            });
            expect(entries[1]).toEqual({
                label: "S3 target bucket: target-bucket",
                status: "denied"
            });
        });

        it("returns missing when HeadBucket throws NoSuchBucket", async () => {
            mockHeadBucket.mockRejectedValue(
                Object.assign(new Error("Bucket not found"), { name: "NoSuchBucket" })
            );
            const container = createDdbContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "S3 source bucket: source-bucket",
                status: "missing"
            });
            expect(entries[1]).toEqual({
                label: "S3 target bucket: target-bucket",
                status: "missing"
            });
        });

        it("returns missing when HeadBucket returns HTTP 404", async () => {
            mockHeadBucket.mockRejectedValue(
                Object.assign(new Error("Not found"), { $metadata: { httpStatusCode: 404 } })
            );
            const container = createDdbContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "S3 source bucket: source-bucket",
                status: "missing"
            });
            expect(entries[1]).toEqual({
                label: "S3 target bucket: target-bucket",
                status: "missing"
            });
        });

        it("returns unknown for other errors", async () => {
            mockHeadBucket.mockRejectedValue(new Error("connection refused"));
            const container = createDdbContainer();
            const processor = container
                .resolveAll(Processor)
                .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<
                any,
                any
            >;

            const entries = await processor.checkAccess();

            expect(entries[0]).toEqual({
                label: "S3 source bucket: source-bucket",
                status: "unknown"
            });
            expect(entries[1]).toEqual({
                label: "S3 target bucket: target-bucket",
                status: "unknown"
            });
        });
    });
});
