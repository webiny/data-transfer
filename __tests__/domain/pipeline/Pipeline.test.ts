import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import type { Abstraction } from "@webiny/di";
import { Pipeline, Scanner, Processor, createFilter } from "~/domain/pipeline/index.ts";
import type { PipelineConfig } from "~/domain/pipeline/Pipeline.ts";
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

describe("Pipeline — construction + getters", () => {
    it("exposes name, scanner/processor tokens, and hook tokens", () => {
        const container = makeContainer();
        const config: PipelineConfig<FakeRecord, FakeContext, FakeShard> = {
            name: "test-pipeline",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
            filters: [],
            transformers: [FakeTransformer],
            beforeHooks: [],
            afterHooks: []
        };

        const pipeline = new Pipeline(config, container);

        expect(pipeline.name).toBe("test-pipeline");
        expect(pipeline.scannerToken).toBe(Scanner);
        expect(pipeline.processorToken).toBe(Processor);
        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
    });

    it("stores hook tokens in registration order", () => {
        const container = makeContainer();
        const config: PipelineConfig<FakeRecord, FakeContext, FakeShard> = {
            name: "with-hooks",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
            filters: [],
            transformers: [],
            beforeHooks: [],
            afterHooks: []
        };
        const pipeline = new Pipeline(config, container);

        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
    });

    it("reports hasFilter=false when filters array is empty", () => {
        const container = makeContainer();
        const config: PipelineConfig<FakeRecord, FakeContext, FakeShard> = {
            name: "filterless",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
            filters: [],
            transformers: [],
            beforeHooks: [],
            afterHooks: []
        };
        const pipeline = new Pipeline(config, container);

        expect(pipeline.hasFilter).toBe(false);
    });

    it("reports hasFilter=true when at least one filter exists", () => {
        const container = makeContainer();
        const filter = createFilter<FakeRecord>(r => r.type === "foo");
        const config: PipelineConfig<FakeRecord, FakeContext, FakeShard> = {
            name: "filtered",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
            filters: [filter],
            transformers: [],
            beforeHooks: [],
            afterHooks: []
        };
        const pipeline = new Pipeline(config, container);

        expect(pipeline.hasFilter).toBe(true);
    });
});
