import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import type { Abstraction } from "@webiny/di";
import {
    PipelineBuilder,
    Pipeline,
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
    TagTransformerImpl
} from "./fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";

function makeContainer(): Container {
    const container = new Container();
    container.register(FakeScannerImpl).inSingletonScope();
    container.register(FakeProcessorImpl).inSingletonScope();
    container.register(TagTransformerImpl).inSingletonScope();
    container.register(FakeHookAImpl).inSingletonScope();
    container.register(FakeHookBImpl).inSingletonScope();
    return container;
}

describe("PipelineBuilder — construction and build()", () => {
    it("produces a Pipeline with the configured name, tokens, and filter", () => {
        const container = makeContainer();
        const matchAll = createFilter<FakeRecord>(() => true);

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "basic",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
            container
        })
            .filter(matchAll)
            .build();

        expect(pipeline).toBeInstanceOf(Pipeline);
        expect(pipeline.name).toBe("basic");
        expect(pipeline.scannerToken).toBe(Scanner);
        expect(pipeline.processorToken).toBe(Processor);
        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
        expect(pipeline.hasFilter).toBe(true);
    });

    it("throws when name is empty", () => {
        const container = makeContainer();
        expect(
            () =>
                new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
                    name: "",
                    scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
                    processor: Processor as Abstraction<
                        Processor.Interface<FakeRecord, FakeContext>
                    >,
                    container
                })
        ).toThrow(/name/i);
    });

    it("throws when name is whitespace-only", () => {
        const container = makeContainer();
        expect(
            () =>
                new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
                    name: "   ",
                    scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
                    processor: Processor as Abstraction<
                        Processor.Interface<FakeRecord, FakeContext>
                    >,
                    container
                })
        ).toThrow(/name/i);
    });

    it("throws when build() is called without .filter()", () => {
        const container = makeContainer();
        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "no-filter",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
            container
        });

        expect(() => builder.build()).toThrow(/filter/i);
    });
});
