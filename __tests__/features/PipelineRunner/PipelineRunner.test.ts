import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import type { Abstraction } from "@webiny/di";
import { ContainerToken, createAbstraction } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
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
    FakeTransformer,
    TagTransformerImpl,
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

function makeContainer(): { container: Container; logger: TestLogger } {
    const container = new Container();
    const logger = new TestLogger();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(Logger, logger);
    container.register(FakeScannerImpl).inSingletonScope();
    container.register(FakeProcessorImpl).inSingletonScope();
    container.register(TagTransformerImpl).inSingletonScope();
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
        builder.use(FakeTransformer);
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

    it("emits a debug log per before- and after-hook on registered pipelines", () => {
        const { container, logger } = makeContainer();
        const runner = container.resolve(PipelineRunner);

        runner.register(
            buildPipeline(container, "with-hooks", {
                beforeHook: Hook,
                afterHook: Hook
            })
        );

        const debugEntries = logger.entries.filter(e => e.level === "debug");
        expect(debugEntries.length).toBeGreaterThanOrEqual(2);
        const lifecycleArgs = debugEntries.flatMap(e => e.args as string[]);
        expect(lifecycleArgs).toContain("before");
        expect(lifecycleArgs).toContain("after");
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

        // Inline emitting transformer: register a token-backed class that pushes a
        // command into ctx.commands per record.
        interface IEmitTransformer {
            transform(ctx: FakeContext): void;
        }
        class EmitTransformer implements IEmitTransformer {
            public transform(ctx: FakeContext): void {
                ctx.commands.add({ key: "TEST_CMD" });
            }
        }
        const EmitToken = createAbstraction<IEmitTransformer>("Test/EmitTransformer");
        const EmitImpl = EmitToken.createImplementation({
            implementation: EmitTransformer,
            dependencies: []
        });
        container.register(EmitImpl).inSingletonScope();

        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "with-cmd",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builder.filter(createFilter<FakeRecord>(() => true)).use(EmitToken);
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
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" }
        ];

        interface IEmitTransformer {
            transform(ctx: FakeContext): void;
        }
        class EmitTransformer implements IEmitTransformer {
            public transform(ctx: FakeContext): void {
                ctx.commands.add({ key: "TEST_CMD" });
            }
        }
        const EmitToken = createAbstraction<IEmitTransformer>("Test/EmitTransformerShared");
        const EmitImpl = EmitToken.createImplementation({
            implementation: EmitTransformer,
            dependencies: []
        });
        container.register(EmitImpl).inSingletonScope();

        const runner = container.resolve(PipelineRunner);

        // Two pipelines, both pointing at the SAME Scanner and SAME Processor tokens.
        // DI singleton means they share the resolved processor instance, so their
        // command buffers should merge into one.
        const builderA = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "shared-A",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builderA.filter(createFilter<FakeRecord>(() => true)).use(EmitToken);

        const builderB = runner.pipeline<FakeRecord, FakeContext, FakeShard>({
            name: "shared-B",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        });
        builderB.filter(createFilter<FakeRecord>(() => true)).use(EmitToken);

        runner
            .register(builderA.build() as unknown as AnyPipeline)
            .register(builderB.build() as unknown as AnyPipeline);
        await runner.run();

        // Single processor instance → one execute() call per shard, with all 4 commands
        // (2 records × 2 pipelines emitting 1 cmd each).
        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(4);
    });

    it("evaluates each pipeline independently against each record (all-matches)", async () => {
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

        // Both pipelines evaluate the single record (all-matches semantics)
        expect(acceptCalls).toEqual(["a:r1", "b:r1"]);
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
