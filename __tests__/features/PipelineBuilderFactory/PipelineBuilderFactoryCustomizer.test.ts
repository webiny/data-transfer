import { describe, it, expect, vi } from "vitest";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import {
    PipelineBuilderFactory,
    PipelineBuilderFactoryFeature
} from "~/features/PipelineBuilderFactory/index.ts";
import { PipelineCustomizer } from "~/features/PipelineCustomizer/index.ts";
import { createFilter } from "~/domain/pipeline/Filter.ts";
import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import type { AccessCheck } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";

// Minimal scanner + processor stubs for creating pipelines
class StubScanner {
    public async *scan(): AsyncGenerator<{ id: string }> {
        yield { id: "r1" };
    }
    public async listShards(): Promise<[null]> {
        return [null];
    }
}

const StubScannerImpl = Scanner.createImplementation({
    implementation: StubScanner,
    dependencies: []
});

class StubProcessor implements Processor.Interface {
    public async checkAccess(): Promise<AccessCheck.Entry[]> {
        return [];
    }
    public async execute(_commands: Commands): Promise<void> {}
}

const StubProcessorImpl = Processor.createImplementation({
    implementation: StubProcessor,
    dependencies: []
});

function makeContainer(): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.register(StubScannerImpl).inSingletonScope();
    container.register(StubProcessorImpl).inSingletonScope();
    PipelineBuilderFactoryFeature.register(container);
    return container;
}

function makeLogger(): Logger.Interface {
    const noop = () => {};
    return {
        debug: noop,
        info: noop,
        warn: vi.fn(),
        error: noop,
        fatal: noop,
        done: noop,
        child() {
            return this;
        }
    } as unknown as Logger.Interface;
}

describe("PipelineBuilderFactory + PipelineCustomizer", () => {
    it("applies a customizer filter when canUse returns true", async () => {
        const container = makeContainer();

        class TestCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "TestCustomizer";
            public canUse(pipelineName: string): boolean {
                return pipelineName === "MyPipeline";
            }
            public async configure(builder: PipelineCustomizer.Builder): Promise<void> {
                builder.filter(createFilter(() => false));
            }
        }

        const TestCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: TestCustomizer,
            dependencies: []
        });
        container.register(TestCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);
        const pipeline = await factory
            .create({
                name: "MyPipeline",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .build();

        // The customizer added a filter that always rejects — pipeline should not accept any record.
        expect(pipeline.accepts({ id: "anything" })).toBe(false);
    });

    it("does NOT apply a customizer when canUse returns false", async () => {
        const container = makeContainer();

        class SkipCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "SkipCustomizer";
            public canUse(_pipelineName: string): boolean {
                return false;
            }
            public async configure(builder: PipelineCustomizer.Builder): Promise<void> {
                builder.filter(createFilter(() => false));
            }
        }

        const SkipCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: SkipCustomizer,
            dependencies: []
        });
        container.register(SkipCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);
        const pipeline = await factory
            .create({
                name: "SomePipeline",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .build();

        // No filters from the preset — should accept all records.
        expect(pipeline.accepts({ id: "anything" })).toBe(true);
    });

    it("applies a customizer transformer after preset transformers", async () => {
        const container = makeContainer();
        const order: string[] = [];

        class OrderCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "OrderCustomizer";
            public canUse(): boolean {
                return true;
            }
            public async configure(builder: PipelineCustomizer.Builder): Promise<void> {
                builder.use((() => {
                    order.push("customizer");
                }) as any);
            }
        }

        const OrderCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: OrderCustomizer,
            dependencies: []
        });
        container.register(OrderCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);
        const pipeline = await factory
            .create({
                name: "OrderTest",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .use((() => {
                order.push("preset");
            }) as any)
            .build();

        // Verify ordering by inspecting transformerFns array order.
        for (const fn of pipeline.transformerFns) {
            (fn as any)();
        }
        expect(order).toEqual(["preset", "customizer"]);
    });

    it("warnUnmatchedCustomizers logs for customizers that never matched", async () => {
        const container = makeContainer();

        class UnmatchedCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "UnmatchedCustomizer";
            public canUse(): boolean {
                return false;
            }
            public async configure(): Promise<void> {}
        }

        const UnmatchedCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: UnmatchedCustomizer,
            dependencies: []
        });
        container.register(UnmatchedCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);

        // Build a pipeline — the customizer never matches.
        await factory
            .create({
                name: "SomePipeline",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .build();

        const logger = makeLogger();
        factory.warnUnmatchedCustomizers(logger);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("UnmatchedCustomizer"));
    });

    it("warnUnmatchedCustomizers does NOT log when all customizers matched", async () => {
        const container = makeContainer();

        class MatchedCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "MatchedCustomizer";
            public canUse(): boolean {
                return true;
            }
            public async configure(): Promise<void> {}
        }

        const MatchedCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: MatchedCustomizer,
            dependencies: []
        });
        container.register(MatchedCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);
        await factory
            .create({
                name: "Any",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .build();

        const logger = makeLogger();
        factory.warnUnmatchedCustomizers(logger);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it("works with zero customizers registered", async () => {
        const container = makeContainer();
        const factory = container.resolve(PipelineBuilderFactory);
        const pipeline = await factory
            .create({
                name: "NoCust",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .build();
        expect(pipeline.accepts({ id: "ok" })).toBe(true);

        const logger = makeLogger();
        factory.warnUnmatchedCustomizers(logger);
        expect(logger.warn).not.toHaveBeenCalled();
    });
});
