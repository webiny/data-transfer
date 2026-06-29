# Pipeline Customizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users extend built-in preset pipelines by name (add filters, transformers) from `setup.ts` without forking the preset, and add per-record `ctx.blackhole()` to suppress writes from within a transformer.

**Architecture:** A `PipelineCustomizer` DI abstraction (user-implemented, `{ multiple: true }`) is injected into `PipelineBuilderFactory`. At `PipelineBuilder.build()` time, matching customizers append their filters/transformers. A slim `PipelineCustomizerBuilder` accumulates contributions. `ctx.blackhole()` is added to `BaseTransformContext` and checked in `PipelineRunner.runRecord`.

**Tech Stack:** TypeScript, `@webiny/di`, vitest

## Global Constraints

- `public`/`private`/`protected` on every class member.
- Braces always — no single-line `if`/`for`/`while`.
- Types via namespace (`Foo.Interface`), never direct interface exports from abstraction files.
- `~/*` path alias in `src/`; relative paths in `__tests__/`.
- camelCase file names.
- Named `interface`/`type` for any structural shape — no inline `{ ... }` in generic positions.
- `yarn test` / `yarn ts-check` / `yarn format:fix` / `yarn lint` / `yarn check:imports` must pass.
- Commit after each task.

---

### Task 1: `ctx.blackhole()` on BaseTransformContext

**Files:**
- Modify: `src/features/TransformContext/abstractions/BaseTransformContext.ts`
- Modify: `src/features/TransformContext/BaseTransformContextFactory.ts`
- Create: `__tests__/features/TransformContext/BaseTransformContextFactory.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `blackhole(): void` and `readonly isBlackholed: boolean` on `BaseTransformContext.Interface`

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/TransformContext/BaseTransformContextFactory.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { TransformContextFeature } from "~/features/TransformContext/index.ts";
import { BaseTransformContextFactory } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { ModelProviderFeature } from "~/features/ModelProvider/index.ts";
import { CacheFeature } from "~/tools/Cache/index.ts";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { MigrationConfigFeature } from "~/features/MigrationConfig/index.ts";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";

function makeContainer(): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    MigrationConfigFeature.register(container, {
        config: {
            source: {
                region: "us-east-1",
                credentials: { accessKeyId: "test", secretAccessKey: "test" },
                dynamodb: { tableName: "src" },
                s3: { bucket: "src" }
            },
            target: {
                region: "us-east-1",
                credentials: { accessKeyId: "test", secretAccessKey: "test" },
                dynamodb: { tableName: "tgt" },
                s3: { bucket: "tgt" }
            }
        } as any
    });
    LoggerFeature.register(container, { logLevel: "error", json: false });
    CacheFeature.register(container);
    CompressionFeature.register(container);
    ModelProviderFeature.register(container);
    TransformContextFeature.register(container);
    return container;
}

describe("BaseTransformContextFactory", () => {
    it("ctx.isBlackholed defaults to false", () => {
        const container = makeContainer();
        const factory = container.resolve(BaseTransformContextFactory);
        const { ctx } = factory.create({ record: { PK: "pk", SK: "sk" } });
        expect(ctx.isBlackholed).toBe(false);
    });

    it("ctx.blackhole() sets isBlackholed to true", () => {
        const container = makeContainer();
        const factory = container.resolve(BaseTransformContextFactory);
        const { ctx } = factory.create({ record: { PK: "pk", SK: "sk" } });
        ctx.blackhole();
        expect(ctx.isBlackholed).toBe(true);
    });

    it("ctx.blackhole() is irreversible within the record lifecycle", () => {
        const container = makeContainer();
        const factory = container.resolve(BaseTransformContextFactory);
        const { ctx } = factory.create({ record: { PK: "pk", SK: "sk" } });
        ctx.blackhole();
        // A second create produces a fresh ctx — verify the first stays blackholed
        // and the second starts clean.
        const { ctx: ctx2 } = factory.create({ record: { PK: "pk2", SK: "sk2" } });
        expect(ctx.isBlackholed).toBe(true);
        expect(ctx2.isBlackholed).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/features/TransformContext/BaseTransformContextFactory.test.ts`
Expected: FAIL — `isBlackholed` and `blackhole` do not exist on the context type.

- [ ] **Step 3: Add `blackhole()` and `isBlackholed` to the interface**

In `src/features/TransformContext/abstractions/BaseTransformContext.ts`, add two members to `IBaseTransformContext<TRecord>` after `addCommand`:

```typescript
    blackhole(): void;
    readonly isBlackholed: boolean;
```

- [ ] **Step 4: Implement in the factory**

In `src/features/TransformContext/BaseTransformContextFactory.ts`, inside the `create` method, add a mutable flag and wire it onto `ctx`:

```typescript
        let blackholed = false;

        const ctx: BaseTransformContextAbstraction.Interface<TRecord> = {
            // ... existing fields ...
            get isBlackholed(): boolean {
                return blackholed;
            },
            blackhole(): void {
                blackholed = true;
            },
            // ... existing replace, addCommand ...
        };
```

- [ ] **Step 5: Update fakeContext.ts helpers**

In `__tests__/transformers/fakeContext.ts`, add `blackhole` and `isBlackholed` to `makeFakeBaseContext`:

```typescript
    let blackholed = false;
    const ctx = {
        // ... existing fields ...
        get isBlackholed(): boolean {
            return blackholed;
        },
        blackhole(): void {
            blackholed = true;
        },
        // ... existing replace, addCommand ...
    };
```

- [ ] **Step 6: Update FakeBaseContextFactory in PipelineRunner test**

In `__tests__/features/PipelineRunner/PipelineRunner.test.ts`, add `blackhole` and `isBlackholed` to the `FakeBaseContextFactory.create` method's `ctx` object:

```typescript
        let blackholed = false;
        const ctx: BaseTransformContext.Interface<TRecord> = {
            // ... existing fields ...
            get isBlackholed(): boolean {
                return blackholed;
            },
            blackhole(): void {
                blackholed = true;
            },
            // ...
        };
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn vitest run __tests__/features/TransformContext/BaseTransformContextFactory.test.ts`
Expected: PASS

Run: `yarn ts-check`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/features/TransformContext/abstractions/BaseTransformContext.ts \
       src/features/TransformContext/BaseTransformContextFactory.ts \
       __tests__/features/TransformContext/BaseTransformContextFactory.test.ts \
       __tests__/transformers/fakeContext.ts \
       __tests__/features/PipelineRunner/PipelineRunner.test.ts
git commit -m "feat: add ctx.blackhole() to BaseTransformContext"
```

---

### Task 2: PipelineRunner honours `ctx.isBlackholed`

**Files:**
- Modify: `src/features/PipelineRunner/PipelineRunner.ts`
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.test.ts`

**Interfaces:**
- Consumes: `ctx.isBlackholed` from Task 1
- Produces: runner discards commands and returns `Blackholed` when `ctx.isBlackholed` is true

- [ ] **Step 1: Write the failing test**

Add to `__tests__/features/PipelineRunner/PipelineRunner.test.ts`, inside the existing `describe` block, a new test:

```typescript
    it("blackholes a record when a transformer calls ctx.blackhole()", async () => {
        const { container, logger } = makeContainer();
        const factory = container.resolve(PipelineBuilderFactory);
        const runner = container.resolve(PipelineRunner);

        const scanner = container.resolve(FakeScanner) as FakeScannerImpl;
        scanner.setRecords([{ id: "rec-1", tag: "" }]);

        const pipeline = factory
            .create({ name: "BlackholeTest", scanner: FakeScanner, processors: [FakeProcessor] })
            .use(((ctx: any) => {
                ctx.blackhole();
            }) as any)
            .build();

        runner.register(pipeline);
        await runner.run();

        // The record was matched (not unmatched) but blackholed — no PutRecord
        // in the processor's execute. Check logs for "blackholed" count.
        const summaryLog = logger.entries.find(e => e.message.includes("blackholed 1"));
        expect(summaryLog).toBeDefined();
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/features/PipelineRunner/PipelineRunner.test.ts -t "blackholes a record when a transformer calls ctx.blackhole"`
Expected: FAIL — the record is not blackholed because `runRecord` doesn't check `ctx.isBlackholed`.

- [ ] **Step 3: Implement the runner change**

In `src/features/PipelineRunner/PipelineRunner.ts`, in the `runRecord` method, change the existing blackhole check (around line 405):

```typescript
        // Before (current):
        if (pipeline.isBlackhole) {
            return new RecordDisposition.Blackholed(pipeline.name);
        }

        // After:
        if (pipeline.isBlackhole || ctx.isBlackholed) {
            return new RecordDisposition.Blackholed(pipeline.name);
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/features/PipelineRunner/PipelineRunner.test.ts -t "blackholes a record when a transformer calls ctx.blackhole"`
Expected: PASS

- [ ] **Step 5: Run the full PipelineRunner test suite**

Run: `yarn vitest run __tests__/features/PipelineRunner/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/PipelineRunner/PipelineRunner.ts \
       __tests__/features/PipelineRunner/PipelineRunner.test.ts
git commit -m "feat: runner honours ctx.isBlackholed for per-record blackholing"
```

---

### Task 3: PipelineCustomizer abstraction + PipelineCustomizerBuilder

**Files:**
- Create: `src/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts`
- Create: `src/features/PipelineCustomizer/abstractions/index.ts`
- Create: `src/features/PipelineCustomizer/index.ts`
- Create: `src/domain/pipeline/PipelineCustomizerBuilder.ts`
- Create: `__tests__/domain/pipeline/PipelineCustomizerBuilder.test.ts`

**Interfaces:**
- Consumes: `Filter` from `~/domain/pipeline/Filter.ts`, `Transformer` from `~/domain/pipeline/abstractions/Transformer.ts`
- Produces: `PipelineCustomizer` abstraction token with `Interface` and `Builder` types; `PipelineCustomizerBuilder` class

- [ ] **Step 1: Write the failing test for PipelineCustomizerBuilder**

Create `__tests__/domain/pipeline/PipelineCustomizerBuilder.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PipelineCustomizerBuilder } from "~/domain/pipeline/PipelineCustomizerBuilder.ts";
import { createFilter } from "~/domain/pipeline/Filter.ts";

describe("PipelineCustomizerBuilder", () => {
    it("accumulates filters", () => {
        const builder = new PipelineCustomizerBuilder();
        const f1 = createFilter(() => true);
        const f2 = createFilter(() => false);
        builder.filter(f1).filter(f2);
        expect(builder.getFilters()).toEqual([f1, f2]);
    });

    it("accumulates transformers (single)", () => {
        const t1 = async () => {};
        const builder = new PipelineCustomizerBuilder();
        builder.use(t1);
        expect(builder.getTransformers()).toEqual([t1]);
    });

    it("accumulates transformers (array)", () => {
        const t1 = async () => {};
        const t2 = async () => {};
        const builder = new PipelineCustomizerBuilder();
        builder.use([t1, t2]);
        expect(builder.getTransformers()).toEqual([t1, t2]);
    });

    it("is chainable", () => {
        const builder = new PipelineCustomizerBuilder();
        const result = builder
            .filter(createFilter(() => true))
            .use(async () => {});
        expect(result).toBe(builder);
    });

    it("starts empty", () => {
        const builder = new PipelineCustomizerBuilder();
        expect(builder.getFilters()).toEqual([]);
        expect(builder.getTransformers()).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/domain/pipeline/PipelineCustomizerBuilder.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the PipelineCustomizerBuilder class**

Create `src/domain/pipeline/PipelineCustomizerBuilder.ts`:

```typescript
import type { Filter } from "./Filter.ts";
import type { Transformer } from "./abstractions/Transformer.ts";

export class PipelineCustomizerBuilder {
    private readonly filters: Filter<any>[] = [];
    private readonly transformers: Transformer.Interface<any>[] = [];

    public filter(filter: Filter<any>): this {
        this.filters.push(filter);
        return this;
    }

    public use(
        transformer: Transformer.Interface<any> | readonly Transformer.Interface<any>[]
    ): this {
        if (Array.isArray(transformer)) {
            for (const item of transformer) {
                this.transformers.push(item);
            }
        } else {
            this.transformers.push(transformer as Transformer.Interface<any>);
        }
        return this;
    }

    public getFilters(): readonly Filter<any>[] {
        return this.filters;
    }

    public getTransformers(): readonly Transformer.Interface<any>[] {
        return this.transformers;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/domain/pipeline/PipelineCustomizerBuilder.test.ts`
Expected: PASS

- [ ] **Step 5: Create the PipelineCustomizer abstraction**

Create `src/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";
import type { PipelineCustomizerBuilder } from "~/domain/pipeline/PipelineCustomizerBuilder.ts";

interface IPipelineCustomizer {
    readonly name: string;
    canUse(pipelineName: string): boolean;
    configure(builder: PipelineCustomizerBuilder): void;
}

export const PipelineCustomizer = createAbstraction<IPipelineCustomizer>(
    "Core/PipelineCustomizer"
);

export namespace PipelineCustomizer {
    export type Interface = IPipelineCustomizer;
    export type Builder = PipelineCustomizerBuilder;
}
```

Create `src/features/PipelineCustomizer/abstractions/index.ts`:

```typescript
export { PipelineCustomizer } from "./PipelineCustomizer.ts";
```

Create `src/features/PipelineCustomizer/index.ts`:

```typescript
export { PipelineCustomizer } from "./abstractions/index.ts";
```

- [ ] **Step 6: Run ts-check**

Run: `yarn ts-check`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/features/PipelineCustomizer/ \
       src/domain/pipeline/PipelineCustomizerBuilder.ts \
       __tests__/domain/pipeline/PipelineCustomizerBuilder.test.ts
git commit -m "feat: add PipelineCustomizer abstraction and PipelineCustomizerBuilder"
```

---

### Task 4: Wire PipelineCustomizer into PipelineBuilderFactory + PipelineBuilder

**Files:**
- Modify: `src/features/PipelineBuilderFactory/PipelineBuilderFactory.ts`
- Modify: `src/features/PipelineBuilderFactory/abstractions/PipelineBuilderFactory.ts`
- Modify: `src/domain/pipeline/PipelineBuilder.ts`
- Create: `__tests__/features/PipelineBuilderFactory/PipelineBuilderFactory.test.ts`

**Interfaces:**
- Consumes: `PipelineCustomizer` from Task 3, `PipelineCustomizerBuilder` from Task 3
- Produces: `PipelineBuilder.build()` applies matching customizers; `PipelineBuilderFactory.warnUnmatchedCustomizers(logger)` logs warnings

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/PipelineBuilderFactory/PipelineBuilderFactory.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { Container } from "@webiny/di";
import { ContainerToken, createAbstraction } from "~/base/index.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { PipelineBuilderFactory, PipelineBuilderFactoryFeature } from "~/features/PipelineBuilderFactory/index.ts";
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

const StubScannerAbstraction = createAbstraction<StubScanner>("Test/StubScanner");
const StubScannerImpl = StubScannerAbstraction.createImplementation({
    implementation: StubScanner,
    dependencies: []
});

class StubProcessor implements Processor.Interface {
    public async checkAccess(): Promise<AccessCheck.Entry[]> {
        return [];
    }
    public async execute(_commands: Commands): Promise<void> {}
}

const StubProcessorAbstraction = createAbstraction<StubProcessor>("Test/StubProcessor");
const StubProcessorImpl = StubProcessorAbstraction.createImplementation({
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
    it("applies a customizer filter when canUse returns true", () => {
        const container = makeContainer();

        class TestCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "TestCustomizer";
            public canUse(pipelineName: string): boolean {
                return pipelineName === "MyPipeline";
            }
            public configure(builder: PipelineCustomizer.Builder): void {
                builder.filter(createFilter(() => false));
            }
        }

        const TestCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: TestCustomizer,
            dependencies: []
        });
        container.register(TestCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);
        const pipeline = factory
            .create({
                name: "MyPipeline",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .build();

        // The customizer added a filter that always rejects — pipeline should not accept any record.
        expect(pipeline.accepts({ id: "anything" })).toBe(false);
    });

    it("does NOT apply a customizer when canUse returns false", () => {
        const container = makeContainer();

        class SkipCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "SkipCustomizer";
            public canUse(_pipelineName: string): boolean {
                return false;
            }
            public configure(builder: PipelineCustomizer.Builder): void {
                builder.filter(createFilter(() => false));
            }
        }

        const SkipCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: SkipCustomizer,
            dependencies: []
        });
        container.register(SkipCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);
        const pipeline = factory
            .create({
                name: "SomePipeline",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .build();

        // No filters from the preset — should accept all records.
        expect(pipeline.accepts({ id: "anything" })).toBe(true);
    });

    it("applies a customizer transformer after preset transformers", () => {
        const container = makeContainer();
        const order: string[] = [];

        class OrderCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "OrderCustomizer";
            public canUse(): boolean {
                return true;
            }
            public configure(builder: PipelineCustomizer.Builder): void {
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
        const pipeline = factory
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

    it("warnUnmatchedCustomizers logs for customizers that never matched", () => {
        const container = makeContainer();

        class UnmatchedCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "UnmatchedCustomizer";
            public canUse(): boolean {
                return false;
            }
            public configure(): void {}
        }

        const UnmatchedCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: UnmatchedCustomizer,
            dependencies: []
        });
        container.register(UnmatchedCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);

        // Build a pipeline — the customizer never matches.
        factory
            .create({
                name: "SomePipeline",
                scanner: StubScannerImpl,
                processors: [StubProcessorImpl]
            })
            .build();

        const logger = makeLogger();
        factory.warnUnmatchedCustomizers(logger);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining("UnmatchedCustomizer")
        );
    });

    it("warnUnmatchedCustomizers does NOT log when all customizers matched", () => {
        const container = makeContainer();

        class MatchedCustomizer implements PipelineCustomizer.Interface {
            public readonly name = "MatchedCustomizer";
            public canUse(): boolean {
                return true;
            }
            public configure(): void {}
        }

        const MatchedCustomizerImpl = PipelineCustomizer.createImplementation({
            implementation: MatchedCustomizer,
            dependencies: []
        });
        container.register(MatchedCustomizerImpl);

        const factory = container.resolve(PipelineBuilderFactory);
        factory
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

    it("works with zero customizers registered", () => {
        const container = makeContainer();
        const factory = container.resolve(PipelineBuilderFactory);
        const pipeline = factory
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/features/PipelineBuilderFactory/PipelineBuilderFactory.test.ts`
Expected: FAIL — `warnUnmatchedCustomizers` does not exist, customizers are not wired.

- [ ] **Step 3: Add `warnUnmatchedCustomizers` to the factory abstraction**

In `src/features/PipelineBuilderFactory/abstractions/PipelineBuilderFactory.ts`, add the import and method to `IPipelineBuilderFactory`:

```typescript
import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";
```

Add to the `IPipelineBuilderFactory` interface after `create`:

```typescript
    warnUnmatchedCustomizers(logger: Logger.Interface): void;
```

- [ ] **Step 4: Modify PipelineBuilder to accept and apply customizers**

In `src/domain/pipeline/PipelineBuilder.ts`:

1. Add import:

```typescript
import type { PipelineCustomizer } from "~/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts";
import { PipelineCustomizerBuilder } from "./PipelineCustomizerBuilder.ts";
```

2. Add `customizers` to `PipelineBuilderConfig`:

```typescript
export interface PipelineBuilderConfig<
    TRecord,
    _TContext extends BaseTransformContext.Interface<TRecord>,
    TShard
> {
    name: string;
    scanner: Scanner.Interface<TRecord, TShard>;
    processors: readonly Processor.Interface<BaseTransformContext.Interface<TRecord>, any>[];
    customizers: readonly PipelineCustomizer.Interface[];
}
```

3. Add field + constructor assignment:

```typescript
    private readonly customizers: readonly PipelineCustomizer.Interface[];
```

And in the constructor body:

```typescript
    this.customizers = config.customizers;
```

4. In `build()`, before constructing `pipelineConfig`, apply customizers:

```typescript
        const custFilters: Filter<TRecord>[] = [];
        const custTransformers: Transformer.Interface<TContext>[] = [];

        for (const customizer of this.customizers) {
            if (!customizer.canUse(this.name)) {
                continue;
            }
            const custBuilder = new PipelineCustomizerBuilder();
            customizer.configure(custBuilder);
            custFilters.push(...custBuilder.getFilters());
            custTransformers.push(...custBuilder.getTransformers());
        }

        const pipelineConfig: PipelineConfig<TRecord, TContext, TShard> = {
            name: this.name,
            scanner: this.scanner,
            processors: this.processors,
            filters: [...this.filters, ...custFilters],
            transformers: [...this.transformers, ...custTransformers],
            beforeHooks: [...this.beforeHooks],
            afterHooks: [...this.afterHooks],
            blackhole: this.blackholeCommands
        };
```

- [ ] **Step 5: Modify PipelineBuilderFactoryImpl to inject customizers and track consumption**

In `src/features/PipelineBuilderFactory/PipelineBuilderFactory.ts`:

1. Add imports:

```typescript
import { PipelineCustomizer } from "~/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts";
import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";
```

2. Change the class to accept customizers and track consumed indices:

```typescript
class PipelineBuilderFactoryImpl implements PipelineBuilderFactoryAbstraction.Interface {
    private readonly consumedCustomizers: Set<number> = new Set();

    public constructor(
        private readonly processors: Processor.Interface[],
        private readonly scanners: ScannerInstance[],
        private readonly customizers: PipelineCustomizer.Interface[]
    ) {}

    public create(input: CreateImplInput): PipelineBuilder<any, any, any> {
        // ... existing scanner/processor resolution ...

        // Track which customizers match this pipeline name.
        for (let i = 0; i < this.customizers.length; i++) {
            if (this.customizers[i]!.canUse(input.name)) {
                this.consumedCustomizers.add(i);
            }
        }

        return new PipelineBuilder({
            name: input.name,
            scanner: scannerInstance,
            processors: processorInstances,
            customizers: this.customizers
        });
    }

    public warnUnmatchedCustomizers(logger: Logger.Interface): void {
        for (let i = 0; i < this.customizers.length; i++) {
            if (!this.consumedCustomizers.has(i)) {
                logger.warn(
                    `PipelineCustomizer "${this.customizers[i]!.name}" did not match any registered pipeline`
                );
            }
        }
    }
}
```

3. Update the dependencies array:

```typescript
export const PipelineBuilderFactory = PipelineBuilderFactoryAbstraction.createImplementation({
    implementation: PipelineBuilderFactoryImpl,
    dependencies: [
        [Processor, { multiple: true }],
        [Scanner, { multiple: true }],
        [PipelineCustomizer, { multiple: true }]
    ]
});
```

- [ ] **Step 6: Update the existing PipelineRunner test's `makeContainer`**

The test in `__tests__/features/PipelineRunner/PipelineRunner.test.ts` calls `PipelineBuilderFactoryFeature.register(container)`. Since the factory now depends on `PipelineCustomizer` with `{ multiple: true }`, it resolves to an empty array when nothing is registered. Verify no code change is needed — `{ multiple: true }` returns `[]` for an unregistered abstraction.

If ts-check complains about the `PipelineBuilderConfig` missing `customizers` in tests that construct `PipelineBuilder` directly, add `customizers: []` to those callsites.

- [ ] **Step 7: Run tests**

Run: `yarn vitest run __tests__/features/PipelineBuilderFactory/PipelineBuilderFactory.test.ts`
Expected: PASS

Run: `yarn vitest run __tests__/features/PipelineRunner/`
Expected: PASS (no regression)

Run: `yarn ts-check`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/features/PipelineBuilderFactory/ \
       src/domain/pipeline/PipelineBuilder.ts \
       __tests__/features/PipelineBuilderFactory/PipelineBuilderFactory.test.ts \
       __tests__/features/PipelineRunner/PipelineRunner.test.ts
git commit -m "feat: wire PipelineCustomizer into PipelineBuilderFactory and PipelineBuilder.build()"
```

---

### Task 5: Call `warnUnmatchedCustomizers` in handlers + export from public API

**Files:**
- Modify: `src/commands/run/handler.ts`
- Modify: `src/commands/processSegment/handler.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `PipelineBuilderFactory.warnUnmatchedCustomizers(logger)` from Task 4
- Produces: public export of `PipelineCustomizer`; warnings emitted after `preset.configure()`

- [ ] **Step 1: Add `warnUnmatchedCustomizers` call to the run handler**

In `src/commands/run/handler.ts`, after the `await preset.configure(...)` call (line 104), add:

```typescript
        pipelineBuilderFactory.warnUnmatchedCustomizers(logger);
```

The `pipelineBuilderFactory` variable is already resolved on line 103.

- [ ] **Step 2: Add `warnUnmatchedCustomizers` call to the processSegment handler**

In `src/commands/processSegment/handler.ts`, after the `await preset.configure(...)` call (lines 49–53), add:

```typescript
    const pipelineBuilderFactory = container.resolve(PipelineBuilderFactory);
```

Wait — it's already resolved inline on line 51. Extract to a named local (per feedback_resolve_before_conditionals memory) and call:

```typescript
    const pipelineBuilderFactory = container.resolve(PipelineBuilderFactory);
    await preset.configure({
        runner,
        pipelineBuilderFactory,
        container
    });
    pipelineBuilderFactory.warnUnmatchedCustomizers(logger);
```

- [ ] **Step 3: Export PipelineCustomizer from public API**

In `src/index.ts`, add after the `PipelineBuilderFactory` re-export section:

```typescript
// PipelineCustomizer — extend built-in preset pipelines from setup.ts.
export { PipelineCustomizer } from "./features/PipelineCustomizer/index.ts";
```

- [ ] **Step 4: Update PipelineBuilder.filter() JSDoc**

In `src/domain/pipeline/PipelineBuilder.ts`, update the JSDoc on `filter()`:

```typescript
    /**
     * Add a filter. Order across .filter() calls within a single builder
     * does NOT matter — all filters are AND-composed. PipelineCustomizer
     * filters are always appended after the preset's filters at build()
     * time.
     */
```

- [ ] **Step 5: Run checks**

Run: `yarn ts-check`
Expected: 0 errors

Run: `yarn test`
Expected: All tests PASS

Run: `yarn check:imports`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/commands/run/handler.ts \
       src/commands/processSegment/handler.ts \
       src/index.ts \
       src/domain/pipeline/PipelineBuilder.ts
git commit -m "feat: export PipelineCustomizer and wire unmatched warnings into handlers"
```

---

### Task 6: Full verification pass

**Files:**
- No new files — verification only.

- [ ] **Step 1: Run the full check suite**

```bash
yarn format:fix
yarn ts-check
yarn test:coverage
yarn lint
yarn check:imports
```

All must pass with 0 errors.

- [ ] **Step 2: Commit any format fixes**

If `format:fix` changed files:

```bash
git add -u
git commit -m "chore: format fixes"
```
