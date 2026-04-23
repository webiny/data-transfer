import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import type { Abstraction } from "@webiny/di";
import { ContainerToken, createAbstraction } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { PipelineRunner, PipelineRunnerFeature } from "~/features/PipelineRunner/index.ts";
import { DroppedRecordLog } from "~/features/DroppedRecordLog/abstractions/DroppedRecordLog.ts";
import { MockDroppedRecordLog } from "../DroppedRecordLog/MockDroppedRecordLog.ts";
import {
    PipelineBuilderFactory,
    PipelineBuilderFactoryFeature
} from "~/features/PipelineBuilderFactory/index.ts";
import { SnapshotWriter } from "~/features/SnapshotWriter/index.ts";
import { BaseTransformContextFactory } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { Processor, Hook, createFilter } from "~/domain/pipeline/index.ts";
import type { Pipeline } from "~/domain/pipeline/index.ts";
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import {
    FakeScannerImpl,
    FakeProcessorImpl,
    FakeHookAImpl,
    FakeHookBImpl,
    tagTransformer,
    FakeProcessor,
    FakeScanner
} from "../../domain/pipeline/fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "../../domain/pipeline/fixtures/types.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

interface CapturedLog {
    level: string;
    message: string;
    args: unknown[];
}

class TestLogger implements Logger.Interface {
    public readonly entries: CapturedLog[] = [];
    public debug(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "debug", message, args });
    }
    public info(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "info", message, args });
    }
    public warn(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "warn", message, args });
    }
    public error(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "error", message, args });
    }
    public fatal(message: string, ...args: unknown[]): void {
        this.entries.push({ level: "fatal", message, args });
    }
    public done(message: string): void {
        this.entries.push({ level: "done", message, args: [] });
    }
    public child(_prefix: string): Logger.Interface {
        return this;
    }
}

/**
 * Minimal stand-in for BaseTransformContextFactory. Real factory pulls in
 * SourceDynamoDbClient + ModelProvider + MigrationConfig + Cache; for the
 * runner tests in this file we only exercise record dispatch and command
 * buffering, so a hand-rolled factory that wires addCommand into a fresh
 * Commands bag per record is sufficient.
 */
class FakeBaseContextFactory implements BaseTransformContextFactory.Interface {
    public create<TRecord>(
        params: BaseTransformContextFactory.CreateParams<TRecord>
    ): BaseTransformContextFactory.CreateResult<TRecord> {
        const commands = new Commands();
        const ctx: BaseTransformContext.Interface<TRecord> = {
            record: params.record,
            original: Object.freeze(params.record as TRecord) as Readonly<TRecord>,
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
                ctx.record = newRecord;
            },
            addCommand(cmd): void {
                commands.add(cmd);
            }
        };
        return { ctx, commands };
    }
}

function makeContainer(options: { runId?: string } = {}): {
    container: Container;
    logger: TestLogger;
} {
    const container = new Container();
    const logger = new TestLogger();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(Logger, logger);
    container.registerInstance(TransferContext, { runId: options.runId ?? "test-run-id" });
    container.registerInstance(BaseTransformContextFactory, new FakeBaseContextFactory());
    container.registerInstance(SnapshotWriter, {
        async write(): Promise<void> {},
        async close(): Promise<void> {}
    });
    container.registerInstance(DroppedRecordLog, new MockDroppedRecordLog());
    container.register(FakeScannerImpl).inSingletonScope();
    container.register(FakeProcessorImpl).inSingletonScope();
    container.register(FakeHookAImpl).inSingletonScope();
    container.register(FakeHookBImpl).inSingletonScope();
    PipelineBuilderFactoryFeature.register(container);
    PipelineRunnerFeature.register(container);
    return { container, logger };
}

function buildPipeline(
    container: Container,
    name: string,
    extras: {
        filterFn?: (r: FakeRecord) => boolean;
        useTransformer?: boolean;
        beforeHook?: Abstraction<Hook.Interface>;
        afterHook?: Abstraction<Hook.Interface>;
    } = {}
): Pipeline<FakeRecord, FakeContext, FakeShard> {
    const factory = container.resolve(PipelineBuilderFactory);
    const builder = factory.create({
        name,
        scanner: FakeScannerImpl,
        processors: [FakeProcessorImpl]
    });
    builder.filter(createFilter<FakeRecord>(extras.filterFn ?? (() => true)));
    if (extras.useTransformer) {
        builder.use(tagTransformer);
    }
    if (extras.beforeHook) {
        builder.beforeExecuteCommands(extras.beforeHook);
    }
    if (extras.afterHook) {
        builder.afterExecuteCommands(extras.afterHook);
    }
    return builder.build() as unknown as Pipeline<FakeRecord, FakeContext, FakeShard>;
}

describe("PipelineRunner — DI registration", () => {
    it("resolves from a container", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        expect(runner).toBeDefined();
        expect(typeof runner.register).toBe("function");
        expect(typeof runner.run).toBe("function");
    });

    it("returns the same instance on repeated resolves", () => {
        const { container } = makeContainer();
        expect(container.resolve(PipelineRunner)).toBe(container.resolve(PipelineRunner));
    });
});

describe("PipelineBuilderFactory.create()", () => {
    it("returns a typed PipelineBuilder", () => {
        const { container } = makeContainer();
        const factory = container.resolve(PipelineBuilderFactory);
        const builder = factory.create({
            name: "test",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        expect(typeof builder.filter).toBe("function");
        expect(typeof builder.use).toBe("function");
        expect(typeof builder.build).toBe("function");
    });
});

describe("PipelineRunner.register()", () => {
    it("returns the runner for chaining", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        const pipeline = buildPipeline(container, "p");
        expect(runner.register(pipeline)).toBe(runner);
    });

    it("throws when a duplicate pipeline name is registered", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "dup"));
        expect(() => runner.register(buildPipeline(container, "dup"))).toThrow(
            /already registered/i
        );
    });
});

describe("runner.register variadic + duplicate-name guard", () => {
    it("registers multiple pipelines in one variadic call", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        const p1 = buildPipeline(container, "a");
        const p2 = buildPipeline(container, "b");
        expect(() => runner.register(p1, p2)).not.toThrow();
    });

    it("returns this for chaining", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        const p1 = buildPipeline(container, "c");
        expect(runner.register(p1)).toBe(runner);
    });

    it("throws on duplicate pipeline name", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        const p1 = buildPipeline(container, "dup");
        const p2 = buildPipeline(container, "dup");
        runner.register(p1);
        expect(() => runner.register(p2)).toThrow(/already registered/);
    });

    it("rejects duplicate within a single variadic call", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        const p1 = buildPipeline(container, "z");
        const p2 = buildPipeline(container, "z");
        expect(() => runner.register(p1, p2)).toThrow(/already registered/);
    });
});

describe("PipelineRunner.run()", () => {
    it("invokes onEnd per matched record so the processor flushes one command per record", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [{ id: "r1", type: "foo" }];

        // FakeProcessor.onEnd emits a PutRecord into the shared commands bag
        // at shard end — mirrors DdbProcessor's auto-put semantic.
        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "single", { useTransformer: true }));
        await runner.run();

        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(1);
    });

    it("invokes afterShard once per shard with {segment, totalSegments}", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [{ id: "r1", type: "foo" }];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "aftershard-fullrun"));
        await runner.run();

        // FakeScanner.listShards returns a single shard — full-run mode
        // threads segment=0, totalSegments=1.
        expect(processor.afterShardCalls).toEqual([{ segment: 0, totalSegments: 1 }]);
    });

    it("threads {segment, totalSegments} from shard mode into afterShard", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [{ id: "r1", type: "foo" }];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "aftershard-shardmode"));
        await runner.run({ segment: 0, totalSegments: 1 });

        expect(processor.afterShardCalls).toEqual([{ segment: 0, totalSegments: 1 }]);
    });

    it("flushes per-processor buffers via execute() when transformers emit commands", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" }
        ];

        // Emit an extra PutRecord per record via ctx.addCommand. onEnd adds
        // one more PutRecord per record, so 4 commands total.
        const emit = (ctx: FakeContext): void => {
            ctx.addCommand(
                PutRecord.create({ table: "target-table", record: { PK: ctx.record.id, SK: "a" } })
            );
        };

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "with-cmd",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builder.filter(createFilter<FakeRecord>(() => true)).use(emit);
        runner.register(builder.build());
        await runner.run();

        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(4);
    });

    it("aggregates commands across pipelines sharing a processor token into one execute() call", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "bar" },
            { id: "r3", type: "foo" }
        ];

        const emit = (ctx: FakeContext): void => {
            ctx.addCommand(
                PutRecord.create({ table: "target-table", record: { PK: ctx.record.id, SK: "a" } })
            );
        };

        const runner = container.resolve(PipelineRunner);

        const builderA = container.resolve(PipelineBuilderFactory).create({
            name: "shared-foo",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builderA.filter(createFilter<FakeRecord>(r => r.type === "foo")).use(emit);

        const builderB = container.resolve(PipelineBuilderFactory).create({
            name: "shared-bar",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builderB.filter(createFilter<FakeRecord>(r => r.type === "bar")).use(emit);

        runner.register(builderA.build()).register(builderB.build());
        await runner.run();

        // Single processor instance → one execute() call per shard. Buffer
        // holds 6 commands: 3 emitted + 3 auto-put via onEnd.
        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(6);
    });

    it("evaluates pipelines in registration order and runs only the first match (first-match-wins)", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [{ id: "r1", type: "foo" }];

        const runner = container.resolve(PipelineRunner);
        const acceptCalls: string[] = [];
        const builderA = container.resolve(PipelineBuilderFactory).create({
            name: "a",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builderA.filter(
            createFilter<FakeRecord>(r => {
                acceptCalls.push(`a:${r.id}`);
                return true;
            })
        );
        const builderB = container.resolve(PipelineBuilderFactory).create({
            name: "b",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builderB.filter(
            createFilter<FakeRecord>(r => {
                acceptCalls.push(`b:${r.id}`);
                return true;
            })
        );
        runner.register(builderA.build()).register(builderB.build());

        await runner.run();

        expect(acceptCalls).toEqual(["a:r1"]);
    });

    it("emits a debug log when a record matches no pipeline in a group", async () => {
        const { container, logger } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [{ id: "r1", type: "miss" }];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "filtered", { filterFn: r => r.type === "foo" }));
        await runner.run();

        const dropMessages = logger.entries.filter(e =>
            e.message.startsWith("record dropped: no matching pipeline in merge group")
        );
        expect(dropMessages.length).toBeGreaterThan(0);
    });

    it("propagates exceptions thrown by the scanner", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [];
        const original = scanner.scan.bind(scanner);
        scanner.scan = async function* () {
            throw new Error("scanner-boom");
        };

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "p"));
        await expect(runner.run()).rejects.toThrow("scanner-boom");

        scanner.scan = original;
    });

    it("does nothing when no pipelines are registered", async () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        await expect(runner.run()).resolves.toBeUndefined();
    });
});

describe("PipelineRunner — hook lifecycle", () => {
    interface ITimelineHook {
        run(params: { runId: string; mergeGroupId: string }): Promise<void>;
    }

    function makeTimelineHook(timeline: string[], label: string): ITimelineHook {
        return {
            async run(_params): Promise<void> {
                timeline.push(label);
            }
        };
    }

    function registerTimelineHook(
        container: Container,
        timeline: string[],
        label: string
    ): Abstraction<Hook.Interface> {
        const Token = createAbstraction<Hook.Interface>(`Test/Timeline/${label}`);
        container.registerInstance(Token, makeTimelineHook(timeline, label));
        return Token;
    }

    it("invokes before-hooks before any record is scanned, in registration order", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const timeline: string[] = [];
        scanner.records = [{ id: "r1", type: "foo" }];

        const originalScan = scanner.scan.bind(scanner);
        scanner.scan = async function* (shard: FakeShard): AsyncIterable<FakeRecord> {
            timeline.push("scan-start");
            yield* originalScan(shard);
        };

        const runner = container.resolve(PipelineRunner);
        const HookFirst = registerTimelineHook(container, timeline, "before-1");
        const HookSecond = registerTimelineHook(container, timeline, "before-2");

        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "ordered",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .beforeExecuteCommands(HookFirst)
            .beforeExecuteCommands(HookSecond);
        runner.register(builder.build());

        await runner.run();
        scanner.scan = originalScan;

        expect(timeline).toEqual(["before-1", "before-2", "scan-start"]);
    });

    it("invokes after-hooks after all shards complete, in REVERSE registration order", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const timeline: string[] = [];
        scanner.records = [{ id: "r1", type: "foo" }];

        const originalScan = scanner.scan.bind(scanner);
        scanner.scan = async function* (shard: FakeShard): AsyncIterable<FakeRecord> {
            for await (const record of originalScan(shard)) {
                timeline.push("scan-yield");
                yield record;
            }
            timeline.push("scan-end");
        };

        const runner = container.resolve(PipelineRunner);
        const HookFirst = registerTimelineHook(container, timeline, "after-1");
        const HookSecond = registerTimelineHook(container, timeline, "after-2");

        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "after-ordered",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .afterExecuteCommands(HookFirst)
            .afterExecuteCommands(HookSecond);
        runner.register(builder.build());

        await runner.run();
        scanner.scan = originalScan;

        expect(timeline).toEqual(["scan-yield", "scan-end", "after-2", "after-1"]);
    });

    it("dedupes hooks by token reference: same token across pipelines fires once per group", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const timeline: string[] = [];
        scanner.records = [{ id: "r1", type: "foo" }];

        const runner = container.resolve(PipelineRunner);
        const SharedHook = registerTimelineHook(container, timeline, "shared-before");
        const SharedAfter = registerTimelineHook(container, timeline, "shared-after");

        const builderA = container.resolve(PipelineBuilderFactory).create({
            name: "dedup-a",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builderA
            .filter(createFilter<FakeRecord>(r => r.id === "match-a"))
            .beforeExecuteCommands(SharedHook)
            .afterExecuteCommands(SharedAfter);

        const builderB = container.resolve(PipelineBuilderFactory).create({
            name: "dedup-b",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builderB
            .filter(createFilter<FakeRecord>(() => true))
            .beforeExecuteCommands(SharedHook)
            .afterExecuteCommands(SharedAfter);

        runner.register(builderA.build()).register(builderB.build());

        await runner.run();

        const beforeCount = timeline.filter(s => s === "shared-before").length;
        const afterCount = timeline.filter(s => s === "shared-after").length;
        expect(beforeCount).toBe(1);
        expect(afterCount).toBe(1);
    });

    it("skips after-hooks when a shard throws", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const timeline: string[] = [];
        scanner.records = [];
        scanner.scan = async function* () {
            throw new Error("scanner-boom");
        };

        const runner = container.resolve(PipelineRunner);
        const Before = registerTimelineHook(container, timeline, "before");
        const After = registerTimelineHook(container, timeline, "after");

        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "throws",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .beforeExecuteCommands(Before)
            .afterExecuteCommands(After);
        runner.register(builder.build());

        await expect(runner.run()).rejects.toThrow("scanner-boom");

        expect(timeline).toEqual(["before"]);
    });

    it("passes runId from TransferContext and mergeGroupId to each hook", async () => {
        const { container } = makeContainer({ runId: "custom-run-42" });
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [{ id: "r1", type: "foo" }];

        const captured: Array<{ runId: string; mergeGroupId: string }> = [];
        const HookToken = createAbstraction<Hook.Interface>("Test/CapturingHook");
        container.registerInstance(HookToken, {
            async run(params: { runId: string; mergeGroupId: string }): Promise<void> {
                captured.push(params);
            }
        });

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "capture-params",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .beforeExecuteCommands(HookToken)
            .afterExecuteCommands(HookToken);
        runner.register(builder.build());

        await runner.run();

        expect(captured).toHaveLength(2);
        expect(captured[0]?.runId).toBe("custom-run-42");
        expect(captured[1]?.runId).toBe("custom-run-42");
        expect(captured[0]?.mergeGroupId).toBe("Core-Scanner");
        expect(captured[1]?.mergeGroupId).toBe("Core-Scanner");
    });
});

// Minimal second processor with a slice disjoint from FakeProcessor's —
// needed to test multi-processor pipelines without using the real
// Ddb/S3/Os processors (which require heavy container wiring).
// Slice contributes only `label()`, and execute() is a no-op: it
// doesn't drain any command key. A pipeline that includes this
// processor alongside FakeProcessor should NOT emit a false
// "no processor claimed it" warning when FakeProcessor fully drains
// the command bag.
interface SecondarySlice {
    label(): string;
}

class SecondaryFakeProcessor implements Processor.Interface<
    BaseTransformContext.Interface<FakeRecord>,
    SecondarySlice
> {
    public extendContext(): SecondarySlice {
        return { label: () => "secondary" };
    }

    public async execute(): Promise<void> {
        // No-op — this processor doesn't claim any command key.
    }
}

const SecondaryFakeProcessorImpl = Processor.createImplementation({
    implementation: SecondaryFakeProcessor,
    dependencies: []
});

describe("PipelineRunner.run() — unclaimed-command warnings", () => {
    const UNCLAIMED_PATTERN = /no processor claimed it/;

    it("does NOT warn when a multi-processor pipeline fully drains the bag", async () => {
        const { container, logger } = makeContainer();
        container.register(SecondaryFakeProcessorImpl).inSingletonScope();
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [{ id: "r1", type: "foo" }];

        // FakeProcessor.onEnd emits a PutRecord (auto-put); FakeProcessor.execute
        // drains PutRecord.key. SecondaryFakeProcessor contributes only a slice
        // method and drains nothing. All emitted commands are claimed, so the
        // runner's warn-once path must stay silent. Regression guard: the
        // original false-unclaimed-warn bug fired here because the runner
        // wasn't attributing drains correctly.
        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "multi-processor-fully-drained",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl, SecondaryFakeProcessorImpl]
        });
        builder.filter(createFilter<FakeRecord>(() => true));
        runner.register(builder.build());

        await runner.run();

        const unclaimedWarns = logger.entries.filter(
            e => e.level === "warn" && UNCLAIMED_PATTERN.test(e.message)
        );
        expect(unclaimedWarns).toEqual([]);
    });

    it("logs a per-shard summary at info level (transferred/dropped + per-pipeline breakdown)", async () => {
        const { container, logger } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        // 3 foo records match the pipeline, 2 bar records don't.
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "bar" },
            { id: "r3", type: "foo" },
            { id: "r4", type: "bar" },
            { id: "r5", type: "foo" }
        ];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "only-foo", { filterFn: r => r.type === "foo" }));
        await runner.run();

        const summaryLines = logger.entries.filter(
            e => e.level === "info" && /shard \d+\/\d+.*scanned/.test(e.message)
        );
        expect(summaryLines).toHaveLength(1);
        const line = summaryLines[0]!.message;
        expect(line).toMatch(/scanned 5/);
        expect(line).toMatch(/transferred 3/);
        expect(line).toMatch(/only-foo=3/);
        expect(line).toMatch(/dropped 2/);
    });

    it("warns once when a transformer emits a command key no processor drains", async () => {
        const { container, logger } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" }
        ];

        // Emit a command whose key nobody drains. FakeProcessor drains
        // PutRecord.key (via its own onEnd + execute), but "orphan-key"
        // gets pushed by the transformer and never claimed. Runner should
        // warn ONCE per runner lifetime (not once per record).
        const emitOrphan = (ctx: FakeContext): void => {
            ctx.addCommand({ key: "orphan-key" });
        };

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "orphan-emitter",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builder.filter(createFilter<FakeRecord>(() => true)).use(emitOrphan);
        runner.register(builder.build());

        await runner.run();

        const unclaimedWarns = logger.entries.filter(
            e => e.level === "warn" && UNCLAIMED_PATTERN.test(e.message)
        );
        expect(unclaimedWarns).toHaveLength(1);
        expect(unclaimedWarns[0]!.message).toContain('"orphan-key"');
    });
});

describe("PipelineRunner.run() — blackhole pipelines", () => {
    it("drops every emitted command — processor.execute sees an empty bag", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" }
        ];

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "observe-only",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builder.filter(createFilter<FakeRecord>(() => true));
        builder.blackhole();
        runner.register(builder.build());

        await runner.run();

        // FakeProcessor.onEnd would normally push a PutRecord per record —
        // 2 commands total. Blackhole drops all of them before the shard
        // fold, so .execute() sees an empty Commands bag (size 0).
        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(0);
    });

    it("still runs transformers for their side effects", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" }
        ];

        // Transformer side effect — append to a captured list.
        const observed: string[] = [];
        const observe = (ctx: FakeContext): void => {
            observed.push(ctx.record.id);
        };

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "observer",
            scanner: FakeScannerImpl,
            processors: [FakeProcessorImpl]
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .use(observe)
            .blackhole();
        runner.register(builder.build());

        await runner.run();

        expect(observed).toEqual(["r1", "r2"]);
    });

    it("does not leak commands from other non-blackholed pipelines in the same merge group", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "a", type: "foo" },
            { id: "b", type: "bar" }
        ];

        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        // First-match-wins: foo records hit the blackhole pipeline, bar
        // records fall through to the normal one.
        const blackholePipeline = factory
            .create({
                name: "blackhole-foo",
                scanner: FakeScannerImpl,
                processors: [FakeProcessorImpl]
            })
            .filter(createFilter<FakeRecord>(r => r.type === "foo"))
            .blackhole()
            .build();

        const normalPipeline = factory
            .create({
                name: "normal-bar",
                scanner: FakeScannerImpl,
                processors: [FakeProcessorImpl]
            })
            .filter(createFilter<FakeRecord>(r => r.type === "bar"))
            .build();

        runner.register(blackholePipeline);
        runner.register(normalPipeline);

        await runner.run();

        // FakeProcessor.onEnd auto-puts one command per matched record.
        // 1 foo → blackholed → dropped. 1 bar → normal → 1 PutRecord in
        // the shard bag. The blackhole pipeline must NOT eat the normal
        // pipeline's output.
        expect(processor.executed[0]?.size()).toBe(1);
    });
});
