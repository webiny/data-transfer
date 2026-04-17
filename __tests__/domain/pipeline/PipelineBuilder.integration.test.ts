import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import type { Abstraction } from "@webiny/di";
import {
    PipelineBuilder,
    Scanner,
    Processor,
    Hook,
    createFilter
} from "~/domain/pipeline/index.ts";
import {
    FakeScannerImpl,
    FakeProcessorImpl,
    FakeTransformer,
    TagTransformerImpl,
    FakeHookAImpl,
    FakeHookBImpl
} from "./fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";

describe("PipelineBuilder — end-to-end", () => {
    it("builds a pipeline that filters, runs transformers, and exposes hook tokens", async () => {
        const container = new Container();
        container.register(FakeScannerImpl).inSingletonScope();
        container.register(FakeProcessorImpl).inSingletonScope();
        container.register(TagTransformerImpl).inSingletonScope();
        container.register(FakeHookAImpl).inSingletonScope();
        container.register(FakeHookBImpl).inSingletonScope();

        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "integration",
            scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
            container
        })
            .filter(isFoo)
            .use(FakeTransformer)
            .beforeExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.name).toBe("integration");
        expect(pipeline.hasFilter).toBe(true);
        expect(pipeline.beforeHookTokens).toHaveLength(1);
        expect(pipeline.afterHookTokens).toHaveLength(1);

        expect(pipeline.accepts({ id: "r1", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "r2", type: "bar" })).toBe(false);

        const processor = container.resolve(Processor) as any;
        const ctx = processor.createContext({ id: "r1", type: "foo" }) as FakeContext;
        await pipeline.run(ctx);

        expect(ctx.emitted).toEqual(["TAG:r1"]);
    });
});
