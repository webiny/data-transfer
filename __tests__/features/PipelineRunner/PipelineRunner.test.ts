import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import type { Abstraction } from "@webiny/di";
import { ContainerToken, createAbstraction } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { PipelineRunner, PipelineRunnerFeature } from "~/features/PipelineRunner/index.ts";
import {
    Pipeline,
    PipelineBuilder,
    Scanner,
    Processor,
    Hook,
    createFilter
} from "~/domain/pipeline/index.ts";
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

function makeContainer(options: { runId?: string } = {}): {
    container: Container;
    logger: TestLogger;
} {
    const container = new Container();
    const logger = new TestLogger();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(Logger, logger);
    container.registerInstance(TransferContext, { runId: options.runId ?? "test-run-id" });
    container.register(FakeScannerImpl).inSingletonScope();
    container.register(FakeProcessorImpl).inSingletonScope();
    container.register(FakeHookAImpl).inSingletonScope();
    container.register(FakeHookBImpl).inSingletonScope();
    PipelineRunnerFeature.register(container);
    return { container, logger };
}

type AnyPipeline = Pipeline<unknown, Processor.Context, unknown>;

function buildPipeline(
    container: Container,
    name: string,
    extras: {
        filterFn?: (r: FakeRecord) => boolean;
        useTransformer?: boolean;
        beforeHook?: Abstraction<Hook.Interface>;
        afterHook?: Abstraction<Hook.Interface>;
    } = {}
): AnyPipeline {
    const runner = container.resolve(PipelineRunner);
    const builder = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
        name,
        scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
        processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
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
    return builder.build() as unknown as AnyPipeline;
}

describe("PipelineRunner — DI registration", () => {
    it("resolves from a container", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        expect(runner).toBeDefined();
        expect(typeof runner.pipeline).toBe("function");
        expect(typeof runner.register).toBe("function");
        expect(typeof runner.run).toBe("function");
    });

    it("returns the same instance on repeated resolves", () => {
        const { container } = makeContainer();
        expect(container.resolve(PipelineRunner)).toBe(container.resolve(PipelineRunner));
    });
});

describe("PipelineRunner.pipeline()", () => {
    it("returns a typed PipelineBuilder", () => {
        const { container } = makeContainer();
        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "test",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        expect(builder).toBeInstanceOf(PipelineBuilder);
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

describe("PipelineRunner.run()", () => {
    it("does not call processor.execute when transformers emit no commands", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [{ id: "r1", type: "foo" }];

        // TagTransformer pushes to ctx.emitted but adds nothing to ctx.commands.
        // Buffer stays empty → no execute() call.
        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "single", { useTransformer: true }));
        await runner.run();

        expect(processor.executed).toHaveLength(0);
    });

    it("flushes per-processor buffers via execute() when commands are emitted", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" }
        ];

        // Inline emitting transformer — a plain function that pushes a command per record.
        const emit = (ctx: FakeContext): void => {
            ctx.commands.add({ key: "TEST_CMD" });
        };

        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "with-cmd",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builder.filter(createFilter<FakeRecord>(() => true)).use(emit);
        runner.register(builder.build() as unknown as AnyPipeline);
        await runner.run();

        // One execute() call per processor at shard end (we have one shard, one processor).
        // Buffer contains 2 commands (one per record).
        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(2);
    });

    it("aggregates commands across pipelines sharing a processor token into one execute() call", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        // Disjoint filters so each record is claimed by exactly one pipeline
        // (first-match semantics) — both pipelines share the same processor
        // token so their per-record commands accumulate in the same buffer.
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "bar" },
            { id: "r3", type: "foo" }
        ];

        const emit = (ctx: FakeContext): void => {
            ctx.commands.add({ key: "TEST_CMD" });
        };

        const runner = container.resolve(PipelineRunner);

        const builderA = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "shared-foo",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builderA.filter(createFilter<FakeRecord>(r => r.type === "foo")).use(emit);

        const builderB = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "shared-bar",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builderB.filter(createFilter<FakeRecord>(r => r.type === "bar")).use(emit);

        runner
            .register(builderA.build() as unknown as AnyPipeline)
            .register(builderB.build() as unknown as AnyPipeline);
        await runner.run();

        // Single processor instance → one execute() call per shard, with all 3 commands
        // (3 records, each claimed by exactly one pipeline, all targeting the shared processor).
        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(3);
    });

    it("evaluates pipelines in registration order and runs only the first match (first-match-wins)", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [{ id: "r1", type: "foo" }];

        const runner = container.resolve(PipelineRunner);
        const acceptCalls: string[] = [];
        const builderA = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "a",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builderA.filter(
            createFilter<FakeRecord>(r => {
                acceptCalls.push(`a:${r.id}`);
                return true;
            })
        );
        const builderB = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "b",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builderB.filter(
            createFilter<FakeRecord>(r => {
                acceptCalls.push(`b:${r.id}`);
                return true;
            })
        );
        runner
            .register(builderA.build() as unknown as AnyPipeline)
            .register(builderB.build() as unknown as AnyPipeline);

        await runner.run();

        // Only the first matching pipeline (A) evaluates and runs — B's filter
        // is never invoked because A already claimed the record.
        expect(acceptCalls).toEqual(["a:r1"]);
    });

    it("emits a debug log when a record matches no pipeline in a group", async () => {
        const { container, logger } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        scanner.records = [{ id: "r1", type: "miss" }];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "filtered", { filterFn: r => r.type === "foo" }));
        await runner.run();

        const dropMessages = logger.entries.filter(
            e => e.message === "record dropped: no matching pipeline in merge group"
        );
        expect(dropMessages.length).toBeGreaterThan(0);
    });

    it("propagates exceptions thrown by the scanner", async () => {
        const { container } = makeContainer();
        const scanner = container.resolve(Scanner) as FakeScanner;
        // Override scan to throw
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

        // Wrap scanner.scan to push a timeline marker when scanning begins.
        const originalScan = scanner.scan.bind(scanner);
        scanner.scan = async function* (shard: FakeShard): AsyncIterable<FakeRecord> {
            timeline.push("scan-start");
            yield* originalScan(shard);
        };

        const runner = container.resolve(PipelineRunner);
        const HookFirst = registerTimelineHook(container, timeline, "before-1");
        const HookSecond = registerTimelineHook(container, timeline, "before-2");

        const builder = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "ordered",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .beforeExecuteCommands(HookFirst)
            .beforeExecuteCommands(HookSecond);
        runner.register(builder.build() as unknown as AnyPipeline);

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

        const builder = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "after-ordered",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .afterExecuteCommands(HookFirst)
            .afterExecuteCommands(HookSecond);
        runner.register(builder.build() as unknown as AnyPipeline);

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

        const builderA = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "dedup-a",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builderA
            .filter(createFilter<FakeRecord>(r => r.id === "match-a"))
            .beforeExecuteCommands(SharedHook)
            .afterExecuteCommands(SharedAfter);

        const builderB = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "dedup-b",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builderB
            .filter(createFilter<FakeRecord>(() => true))
            .beforeExecuteCommands(SharedHook)
            .afterExecuteCommands(SharedAfter);

        runner
            .register(builderA.build() as unknown as AnyPipeline)
            .register(builderB.build() as unknown as AnyPipeline);

        await runner.run();

        // SharedHook is registered twice (across both pipelines) but should fire once.
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

        const builder = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "throws",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .beforeExecuteCommands(Before)
            .afterExecuteCommands(After);
        runner.register(builder.build() as unknown as AnyPipeline);

        await expect(runner.run()).rejects.toThrow("scanner-boom");

        // before-hook fired (before scanner ran), after-hook did NOT fire.
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
        const builder = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "capture-params",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builder
            .filter(createFilter<FakeRecord>(() => true))
            .beforeExecuteCommands(HookToken)
            .afterExecuteCommands(HookToken);
        runner.register(builder.build() as unknown as AnyPipeline);

        await runner.run();

        expect(captured).toHaveLength(2);
        expect(captured[0]?.runId).toBe("custom-run-42");
        expect(captured[1]?.runId).toBe("custom-run-42");
        // Scanner abstraction name is "Core/Scanner" → "Core-Scanner" after sanitisation.
        expect(captured[0]?.mergeGroupId).toBe("Core-Scanner");
        expect(captured[1]?.mergeGroupId).toBe("Core-Scanner");
    });
});
