import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import { createDdbContainer } from "../../containers/index.ts";
import {
    createPipeline,
    createDdbPipeline,
    createOsPipeline,
    Scanner,
    Processor,
    createFilter
} from "~/domain/pipeline/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";

describe("createPipeline", () => {
    it("returns a PipelineDefinition with a name", () => {
        const def = createPipeline<FakeRecord, FakeContext, FakeShard>("example", () => {});
        expect(def.name).toBe("example");
        expect(typeof def.register).toBe("function");
    });

    it("registers the pipeline with the runner when register() is called", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const def = createPipeline<FakeRecord, FakeContext, FakeShard>("p1", b => {
            b.filter(createFilter<FakeRecord>(() => true));
        });
        def.register(
            runner,
            Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        );
        // Registering a second pipeline with the same name throws — proves first register worked.
        const def2 = createPipeline<FakeRecord, FakeContext, FakeShard>("p1", b => {
            b.filter(createFilter<FakeRecord>(() => true));
        });
        expect(() =>
            def2.register(
                runner,
                Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
                Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
            )
        ).toThrow(/already registered/i);
    });
});

describe("createDdbPipeline", () => {
    it("registers against DdbScanner + DdbProcessor with zero generics at the call site", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const def = createDdbPipeline("ddb-example", b => {
            b.filter(createFilter(() => true));
        });
        def.register(runner, DdbScanner, DdbProcessor);
        expect(def.name).toBe("ddb-example");
    });
});

describe("createOsPipeline", () => {
    it("returns a PipelineDefinition with a name (registration tested separately via the OS container)", () => {
        const def = createOsPipeline("os-example", b => {
            b.filter(createFilter(() => true));
        });
        expect(def.name).toBe("os-example");
        expect(typeof def.register).toBe("function");
    });
});
