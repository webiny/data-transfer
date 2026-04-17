# Runner Integration & DDB Implementations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new `src/domain/pipeline/` primitives runnable end-to-end via a rewritten `PipelineRunner` plus real `DdbScanner` + `DdbProcessor` implementations, against a `MockDynamoDbClient` test container.

**Architecture:** Replace the legacy `PipelineRunner` (no coexistence) with a new one that exposes a `runner.pipeline(...)` factory, groups pipelines by scanner token, dispatches records with first-match-wins semantics (registration order matters), and flushes per-processor command buffers at shard boundaries. Pipeline class drops its container reference (runner owns DI resolution); `Processor.Interface` tightens its TContext constraint to `{ readonly commands: Commands }` so the runner can extract commands safely.

**Tech Stack:** TypeScript strict, `@webiny/di`, vitest, `~/` path alias.

**Spec reference:** `docs/superpowers/specs/2026-04-17-runner-integration-design.md`

**Out of scope:** hook lifecycle invocation; worker spawning + `.transfer/` state files; `OsScanner`/`OsProcessor`/`S3Scanner`/`S3Processor`; preset migration. See spec § "Out of scope".

**Accepted fallout:** `__tests__/features/PipelineRunner/PipelineRunner.test.ts` (legacy `processRecord`/`processAll` tests) and `__tests__/security-teams.test.ts` (uses legacy `runner.processRecord`) will fail starting at Task 5 and stay broken. They get deleted in Task 5 (the runner test) and stay broken (the security-teams test) until a follow-up cleanup plan ports or removes them. Test count drops accordingly — record the new total at end of plan.

---

## File Structure

**New files:**

- `src/base/Container.ts` — `ContainerToken` abstraction.
- `src/features/DdbScanner/abstractions/DdbScanner.ts` — `DdbShard` named type.
- `src/features/DdbScanner/abstractions/index.ts` — barrel.
- `src/features/DdbScanner/DdbScanner.ts` — implementation.
- `src/features/DdbScanner/feature.ts` — feature registration.
- `src/features/DdbScanner/index.ts` — public barrel.
- `src/features/DdbProcessor/abstractions/DdbProcessor.ts` — `DdbShardState` named type.
- `src/features/DdbProcessor/abstractions/index.ts` — barrel.
- `src/features/DdbProcessor/DdbProcessor.ts` — implementation.
- `src/features/DdbProcessor/feature.ts` — feature registration.
- `src/features/DdbProcessor/index.ts` — public barrel.
- `__tests__/containers/pipelineRunner.ts` — minimal test container helper for runner-only tests.
- `__tests__/features/PipelineRunner/PipelineRunner.test.ts` — REWRITTEN (delete existing, write new).
- `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` — end-to-end test against `MockDynamoDbClient`.
- `__tests__/features/DdbScanner/DdbScanner.test.ts`.
- `__tests__/features/DdbProcessor/DdbProcessor.test.ts`.
- `__tests__/base/ContainerToken.test.ts`.

**Modified files:**

- `src/base/index.ts` — re-export `ContainerToken`.
- `src/bootstrap.ts` — register container against `ContainerToken`.
- `src/domain/pipeline/abstractions/Processor.ts` — tighten `TContext` constraint.
- `src/domain/pipeline/Pipeline.ts` — drop container, delete `run()`, expose `transformerTokens`.
- `src/domain/pipeline/PipelineBuilder.ts` — drop container from config.
- `src/features/PipelineRunner/abstractions/PipelineRunner.ts` — replace interface.
- `src/features/PipelineRunner/PipelineRunner.ts` — replace implementation.
- `src/features/PipelineRunner/feature.ts` — likely no change, verify.
- `src/features/PipelineRunner/index.ts` — verify exports.
- `__tests__/containers/ddb.ts` — register `DdbScannerFeature` + `DdbProcessorFeature`.
- `__tests__/containers/index.ts` — re-export new helper.
- `__tests__/domain/pipeline/Processor.test.ts` — update `TestContext` to satisfy new constraint.
- `__tests__/domain/pipeline/Pipeline.test.ts` — drop container construction; delete `Pipeline.run()` describe; add `transformerTokens` test.
- `__tests__/domain/pipeline/PipelineBuilder.test.ts` — drop container from all builder construction.
- `__tests__/domain/pipeline/PipelineBuilder.integration.test.ts` — DELETE (the runner integration test in Task 12 supersedes it).

---

## Project conventions to follow

- Use `yarn` for all commands. Never `npm`.
- Always wrap `if`/`for`/`while` bodies in curly braces.
- All class members get explicit `public`/`private`/`protected` modifiers.
- Path alias: `~/features/X`, `~/domain/X`, etc. (points to `src/`).
- Use `.ts` extensions on all imports from source files.
- Do NOT import `reflect-metadata` — `@webiny/di` loads it internally.
- Always declare named interfaces/types — no inline structural types in generics, params, or returns.
- After each task, run `yarn format:fix` + `yarn ts-check` + `yarn test` and commit only after green (with the legacy-test-fallout exception noted in each affected task).
- Commit per task (each task is one logical section).
- Pre-existing `src/presets/example.ts` ts-check errors are unrelated WIP and should not be touched.

---

## Task 1: `ContainerToken` abstraction + bootstrap registration

**Files:**
- Create: `src/base/Container.ts`
- Modify: `src/base/index.ts`
- Modify: `src/bootstrap.ts`
- Test: `__tests__/base/ContainerToken.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/base/ContainerToken.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";

describe("ContainerToken", () => {
    it("resolves to the container instance it was registered with", () => {
        const container = new Container();
        container.registerInstance(ContainerToken, container);

        const resolved = container.resolve(ContainerToken);
        expect(resolved).toBe(container);
    });

    it("returns the same reference on repeated resolves", () => {
        const container = new Container();
        container.registerInstance(ContainerToken, container);

        expect(container.resolve(ContainerToken)).toBe(container.resolve(ContainerToken));
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test __tests__/base/ContainerToken.test.ts`
Expected: FAIL — `ContainerToken` not exported from `~/base/index.ts`.

- [ ] **Step 3: Create the abstraction**

Create `src/base/Container.ts`:

```typescript
import type { Container } from "@webiny/di";
import { createAbstraction } from "./createAbstraction.js";

export const ContainerToken = createAbstraction<Container>("Core/Container");
```

- [ ] **Step 4: Re-export from barrel**

Modify `src/base/index.ts` — add the export at the end:

```typescript
export { createDecorator, createImplementation, createComposite } from "@webiny/di";
export { createFeature } from "./createFeature.js";
export { createAbstraction } from "./createAbstraction.js";
export { Result } from "./Result.js";
export { ResultAsync } from "./ResultAsync.js";
export { BaseError } from "./BaseError.js";
export { ContainerToken } from "./Container.ts";
```

- [ ] **Step 5: Register the container in bootstrap**

Modify `src/bootstrap.ts` — add the import and one registration line right after `const container = new Container();`:

```typescript
// at top with other imports
import { ContainerToken } from "~/base/index.ts";

// inside bootstrap(), immediately after `const container = new Container();`
container.registerInstance(ContainerToken, container);
```

- [ ] **Step 6: Run tests**

Run: `yarn test __tests__/base/ContainerToken.test.ts`
Expected: PASS (2/2).

- [ ] **Step 7: Format, type-check, commit**

```bash
yarn format:fix
yarn ts-check
git add src/base/Container.ts src/base/index.ts src/bootstrap.ts \
        __tests__/base/ContainerToken.test.ts
git commit -m "feat: add ContainerToken abstraction for runner DI"
```

---

## Task 2: Tighten `Processor.Interface` generic constraint

**Files:**
- Modify: `src/domain/pipeline/abstractions/Processor.ts`
- Modify: `__tests__/domain/pipeline/Processor.test.ts`

- [ ] **Step 1: Update the abstraction**

Modify `src/domain/pipeline/abstractions/Processor.ts` to add the constraint:

```typescript
import { createAbstraction } from "~/base/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";

interface IProcessorContext {
    readonly commands: Commands;
}

interface IProcessor<TRecord = unknown, TContext extends IProcessorContext = IProcessorContext> {
    execute(commands: Commands): Promise<void>;
    getShardState(): unknown;
    createContext(record: TRecord): TContext;
}

export const Processor = createAbstraction<IProcessor>("Core/Processor");

export namespace Processor {
    export type Interface<
        TRecord = unknown,
        TContext extends IProcessorContext = IProcessorContext
    > = IProcessor<TRecord, TContext>;
    export type Context = IProcessorContext;
}
```

- [ ] **Step 2: Run existing Processor tests to confirm they fail**

Run: `yarn test __tests__/domain/pipeline/Processor.test.ts`
Expected: FAIL — `TestContext` (`{ record, emit }`) does not satisfy the new constraint (no `commands` field).

- [ ] **Step 3: Update Processor.test.ts to satisfy the constraint**

In `__tests__/domain/pipeline/Processor.test.ts`, update `TestContext` and `FakeProcessor`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { Processor } from "~/domain/pipeline/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";

interface TestRecord {
    id: string;
}

interface TestContext {
    readonly commands: Commands;
    record: TestRecord;
    emit(cmd: string): void;
}

class FakeProcessor implements Processor.Interface<TestRecord, TestContext> {
    public readonly executed: Commands[] = [];
    private shardState: string[] = [];

    public async execute(commands: Commands): Promise<void> {
        this.executed.push(commands);
    }

    public getShardState(): { emitted: string[] } {
        return { emitted: [...this.shardState] };
    }

    public createContext(record: TestRecord): TestContext {
        const ctx: TestContext = {
            commands: new Commands(),
            record,
            emit: (cmd: string) => {
                this.shardState.push(cmd);
            }
        };
        return ctx;
    }
}

const TestProcessor = Processor.createImplementation({
    implementation: FakeProcessor,
    dependencies: []
});

describe("Processor abstraction", () => {
    it("is registrable and resolvable via the DI container", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor);
        expect(processor).toBeInstanceOf(FakeProcessor);
    });

    it("creates a fresh context per record", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as Processor.Interface<
            TestRecord,
            TestContext
        >;

        const ctxA = processor.createContext({ id: "a" });
        const ctxB = processor.createContext({ id: "b" });
        expect(ctxA).not.toBe(ctxB);
        expect(ctxA.record.id).toBe("a");
        expect(ctxB.record.id).toBe("b");
    });

    it("exposes accumulated shard state", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as Processor.Interface<
            TestRecord,
            TestContext
        >;

        const ctx = processor.createContext({ id: "x" });
        ctx.emit("one");
        ctx.emit("two");

        expect(processor.getShardState()).toEqual({ emitted: ["one", "two"] });
    });

    it("contexts carry a Commands instance per record", () => {
        const container = new Container();
        container.register(TestProcessor).inSingletonScope();
        const processor = container.resolve(Processor) as Processor.Interface<
            TestRecord,
            TestContext
        >;

        const ctx = processor.createContext({ id: "x" });
        expect(ctx.commands).toBeInstanceOf(Commands);
        expect(ctx.commands.size()).toBe(0);
    });
});
```

- [ ] **Step 4: Run tests**

Run: `yarn test __tests__/domain/pipeline/Processor.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Run the full pipeline test suite to catch fallout**

Run: `yarn test __tests__/domain/pipeline/`
Expected: PASS — `FakeContext` already has `commands: Commands` so it satisfies the constraint without changes; Pipeline + PipelineBuilder tests still green.

- [ ] **Step 6: Format, type-check, commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/abstractions/Processor.ts \
        __tests__/domain/pipeline/Processor.test.ts
git commit -m "feat: tighten Processor.Interface TContext constraint to require commands"
```

---

## Task 3: Refactor `Pipeline` + `PipelineBuilder` to drop container

This task does both refactors together because splitting them leaves the codebase in a broken intermediate state (`PipelineBuilder.build()` calls `new Pipeline(config, container)` — change Pipeline alone and the builder won't compile).

**Files:**
- Modify: `src/domain/pipeline/Pipeline.ts`
- Modify: `src/domain/pipeline/PipelineBuilder.ts`
- Modify: `__tests__/domain/pipeline/Pipeline.test.ts`
- Modify: `__tests__/domain/pipeline/PipelineBuilder.test.ts`
- Delete: `__tests__/domain/pipeline/PipelineBuilder.integration.test.ts`

- [ ] **Step 1: Rewrite `Pipeline.ts`**

Replace the contents of `src/domain/pipeline/Pipeline.ts`:

```typescript
import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Filter } from "./Filter.ts";

export interface PipelineConfig<TRecord, TContext extends Processor.Context, TShard> {
    readonly name: string;
    readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    readonly processor: Abstraction<Processor.Interface<TRecord, TContext>>;
    readonly filters: readonly Filter<TRecord>[];
    readonly transformers: readonly Abstraction<unknown>[];
    readonly beforeHooks: readonly Abstraction<Hook.Interface>[];
    readonly afterHooks: readonly Abstraction<Hook.Interface>[];
}

export class Pipeline<
    TRecord = unknown,
    TContext extends Processor.Context = Processor.Context,
    TShard = unknown
> {
    public constructor(private readonly config: PipelineConfig<TRecord, TContext, TShard>) {
        Object.freeze(this);
    }

    public get name(): string {
        return this.config.name;
    }

    public get scannerToken(): Abstraction<Scanner.Interface<TRecord, TShard>> {
        return this.config.scanner;
    }

    public get processorToken(): Abstraction<Processor.Interface<TRecord, TContext>> {
        return this.config.processor;
    }

    public get beforeHookTokens(): readonly Abstraction<Hook.Interface>[] {
        return this.config.beforeHooks;
    }

    public get afterHookTokens(): readonly Abstraction<Hook.Interface>[] {
        return this.config.afterHooks;
    }

    public get transformerTokens(): readonly Abstraction<unknown>[] {
        return this.config.transformers;
    }

    public get hasFilter(): boolean {
        return this.config.filters.length > 0;
    }

    public accepts(record: TRecord): boolean {
        for (const filter of this.config.filters) {
            if (!filter.check(record)) {
                return false;
            }
        }
        return true;
    }
}
```

Key changes vs prior:
- Constructor takes `(config)` only (no container).
- `Object.freeze(this)` retained — only own properties freeze, prototype methods still work.
- Deleted `Pipeline.run()` (runner does resolution).
- Deleted protected `getContainer`, `getFilters`, `getTransformerTokens`.
- New public getter `transformerTokens`.
- `PipelineConfig` `TContext` now extends `Processor.Context` (the constraint added in Task 2).

- [ ] **Step 2: Rewrite `PipelineBuilder.ts`**

Replace the contents of `src/domain/pipeline/PipelineBuilder.ts`:

```typescript
import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Filter } from "./Filter.ts";
import { Pipeline, type PipelineConfig } from "./Pipeline.ts";

export interface PipelineBuilderConfig<TRecord, TContext extends Processor.Context, TShard> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processor: Abstraction<Processor.Interface<TRecord, TContext>>;
}

export class PipelineBuilder<
    TRecord = unknown,
    TContext extends Processor.Context = Processor.Context,
    TShard = unknown
> {
    private readonly name: string;
    private readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    private readonly processor: Abstraction<Processor.Interface<TRecord, TContext>>;

    private filters: Filter<TRecord>[] = [];
    private filterCalled = false;
    private transformers: Abstraction<unknown>[] = [];
    private beforeHooks: Abstraction<Hook.Interface>[] = [];
    private afterHooks: Abstraction<Hook.Interface>[] = [];

    public constructor(config: PipelineBuilderConfig<TRecord, TContext, TShard>) {
        if (!config.name || config.name.trim().length === 0) {
            throw new Error("PipelineBuilder: `name` is required and must be non-empty");
        }
        this.name = config.name;
        this.scanner = config.scanner;
        this.processor = config.processor;
    }

    public filter(input: Filter<TRecord> | Filter<TRecord>[]): this {
        if (this.filterCalled) {
            throw new Error(
                `PipelineBuilder "${this.name}": .filter() already called. ` +
                    "Pass an array to apply multiple filters in one call."
            );
        }
        const asArray = Array.isArray(input) ? input : [input];
        if (asArray.length === 0) {
            throw new Error(
                `PipelineBuilder "${this.name}": .filter([]) is empty — ` +
                    "pass at least one filter or omit the call entirely."
            );
        }
        this.filters = asArray;
        this.filterCalled = true;
        return this;
    }

    public use(token: Abstraction<unknown>): this {
        this.transformers.push(token);
        return this;
    }

    public beforeExecuteCommands(token: Abstraction<Hook.Interface>): this {
        this.beforeHooks.push(token);
        return this;
    }

    public afterExecuteCommands(token: Abstraction<Hook.Interface>): this {
        this.afterHooks.push(token);
        return this;
    }

    public build(): Pipeline<TRecord, TContext, TShard> {
        if (!this.filterCalled) {
            throw new Error(
                `PipelineBuilder "${this.name}": .filter() is required ` +
                    "(use createFilter(() => true) for an explicit catch-all)."
            );
        }
        const pipelineConfig: PipelineConfig<TRecord, TContext, TShard> = {
            name: this.name,
            scanner: this.scanner,
            processor: this.processor,
            filters: [...this.filters],
            transformers: [...this.transformers],
            beforeHooks: [...this.beforeHooks],
            afterHooks: [...this.afterHooks]
        };
        return new Pipeline(pipelineConfig);
    }
}
```

Key changes vs prior:
- Removed `container` field from `PipelineBuilderConfig` and the class.
- Constructor takes `{ name, scanner, processor }` only.
- `.build()` calls `new Pipeline(pipelineConfig)` — no container argument.
- `TContext` constrained to `Processor.Context`.

- [ ] **Step 3: Delete the old PipelineBuilder integration test**

```bash
rm __tests__/domain/pipeline/PipelineBuilder.integration.test.ts
```

The runner integration test in Task 12 supersedes it. Trying to keep it would require a manual transformer-resolution loop in the test, duplicating what the runner does.

- [ ] **Step 4: Update `Pipeline.test.ts`**

Replace the contents of `__tests__/domain/pipeline/Pipeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import { Pipeline, Scanner, Processor, createFilter } from "~/domain/pipeline/index.ts";
import type { PipelineConfig } from "~/domain/pipeline/Pipeline.ts";
import { FakeTransformer } from "./fixtures/fakes.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";

function baseConfig(
    overrides: Partial<PipelineConfig<FakeRecord, FakeContext, FakeShard>> = {}
): PipelineConfig<FakeRecord, FakeContext, FakeShard> {
    return {
        name: "test-pipeline",
        scanner: Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
        processor: Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>,
        filters: [],
        transformers: [],
        beforeHooks: [],
        afterHooks: [],
        ...overrides
    };
}

describe("Pipeline — construction + getters", () => {
    it("exposes name, scanner/processor tokens, and empty hook lists", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ name: "exposes-tokens", transformers: [FakeTransformer] })
        );

        expect(pipeline.name).toBe("exposes-tokens");
        expect(pipeline.scannerToken).toBe(Scanner);
        expect(pipeline.processorToken).toBe(Processor);
        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
    });

    it("exposes transformerTokens in registration order", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ transformers: [FakeTransformer, FakeTransformer] })
        );

        expect(pipeline.transformerTokens).toHaveLength(2);
        expect(pipeline.transformerTokens[0]).toBe(FakeTransformer);
        expect(pipeline.transformerTokens[1]).toBe(FakeTransformer);
    });

    it("reports hasFilter=false when filters array is empty", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(baseConfig());
        expect(pipeline.hasFilter).toBe(false);
    });

    it("reports hasFilter=true when at least one filter exists", () => {
        const filter = createFilter<FakeRecord>(r => r.type === "foo");
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ filters: [filter] })
        );
        expect(pipeline.hasFilter).toBe(true);
    });
});

describe("Pipeline.accepts()", () => {
    it("returns true when no filters are present", () => {
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(baseConfig());
        expect(pipeline.accepts({ id: "x", type: "foo" })).toBe(true);
    });

    it("returns true only when every filter passes", () => {
        const isFoo = createFilter<FakeRecord>(r => r.type === "foo");
        const notDeleted = createFilter<FakeRecord>(r => r.payload?.deleted !== true);
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ filters: [isFoo, notDeleted] })
        );

        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
        expect(
            pipeline.accepts({ id: "c", type: "foo", payload: { deleted: true } })
        ).toBe(false);
    });

    it("short-circuits on first failing filter", () => {
        const calls: string[] = [];
        const first = createFilter<FakeRecord>(r => {
            calls.push(`first:${r.id}`);
            return false;
        });
        const second = createFilter<FakeRecord>(r => {
            calls.push(`second:${r.id}`);
            return true;
        });
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            baseConfig({ filters: [first, second] })
        );

        expect(pipeline.accepts({ id: "r1", type: "x" })).toBe(false);
        expect(calls).toEqual(["first:r1"]);
    });
});
```

Note: `Pipeline.run()` describe block from the prior version is intentionally deleted — that method no longer exists.

- [ ] **Step 5: Update `PipelineBuilder.test.ts` — remove `container` everywhere**

In `__tests__/domain/pipeline/PipelineBuilder.test.ts`, drop `container` from every `new PipelineBuilder({...})` call site and from `makeContainer`'s only consumer (the builder construction). Also drop `Container` from imports if `makeContainer` is no longer needed for builder tests.

The simplest concrete change at every builder construction site:

**Before:**
```typescript
new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
    name: "...",
    scanner: Scanner,
    processor: Processor,
    container
})
```

**After:**
```typescript
new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
    name: "...",
    scanner: Scanner,
    processor: Processor
})
```

Apply that change to ALL `new PipelineBuilder(...)` sites in the file (currently 12 sites across the various describe blocks — including the cast pattern `Scanner as Abstraction<...>` which stays unchanged). Drop the `makeContainer` helper if no longer needed; otherwise keep it but stop passing its result to the builder.

For test "throws when name is empty", "throws when name is whitespace-only", and "throws when build() is called without .filter()", remove the `container` property and the helper that used to build it; the rest of the assertions remain identical.

Some tests construct `Container` to resolve transformers (the `.use()` describe block needs this for `pipeline.run` checks — but `Pipeline.run()` no longer exists). Remove those resolution-and-run assertions; replace them with assertions that the built `Pipeline` has the correct `transformerTokens`. Specifically:

The `.use()` test "chains the same transformer token twice — run() invokes it twice in order" needs to change. It used to:
1. Build pipeline with two `.use(FakeTransformer)` calls.
2. Resolve `Processor` from container, `createContext`.
3. Call `await pipeline.run(ctx)`.
4. Assert `ctx.emitted` had two entries.

Replace with:
```typescript
it("chains the same transformer token twice and exposes both via transformerTokens", () => {
    const matchAll = createFilter<FakeRecord>(() => true);

    const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
        name: "with-transformers",
        scanner: Scanner,
        processor: Processor
    })
        .filter(matchAll)
        .use(FakeTransformer)
        .use(FakeTransformer)
        .build();

    expect(pipeline.transformerTokens).toHaveLength(2);
    expect(pipeline.transformerTokens[0]).toBe(FakeTransformer);
    expect(pipeline.transformerTokens[1]).toBe(FakeTransformer);
});
```

This shifts the test from "transformer fires twice" to "two tokens are stored in order" — the runner integration test in Task 12 covers actual execution. Drop any unused imports (`Container`, fixture impls used only by `makeContainer`) revealed by ts-check after this change.

- [ ] **Step 6: Run tests**

Run: `yarn test __tests__/domain/pipeline/`
Expected: PASS — Filter (3) + Scanner (2) + Processor (4) + Hook (2) + Pipeline (7) + PipelineBuilder (15: 4 construction/build + 5 filter + 2 use + 3 hooks + 1 single-filter [actually 4 single+array+double+empty+guard-order = 5]; check final count). Adjust expectations based on current test suite size after edits.

- [ ] **Step 7: Type-check and confirm only known failures remain**

Run: `yarn ts-check`
Expected: only the pre-existing `src/presets/example.ts` errors. No new errors from the pipeline domain.

- [ ] **Step 8: Format and commit**

```bash
yarn format:fix
git add src/domain/pipeline/Pipeline.ts src/domain/pipeline/PipelineBuilder.ts \
        __tests__/domain/pipeline/Pipeline.test.ts \
        __tests__/domain/pipeline/PipelineBuilder.test.ts
git rm __tests__/domain/pipeline/PipelineBuilder.integration.test.ts
git commit -m "refactor: drop container reference from Pipeline + PipelineBuilder"
```

---

## Task 4: New `PipelineRunner` abstraction interface

Replace the legacy `register/processRecord/processAll` interface with the new `pipeline/register/run` shape.

**Files:**
- Modify: `src/features/PipelineRunner/abstractions/PipelineRunner.ts`

- [ ] **Step 1: Rewrite the abstraction**

Replace the contents of `src/features/PipelineRunner/abstractions/PipelineRunner.ts`:

```typescript
import type { Abstraction } from "@webiny/di";
import { createAbstraction } from "~/base/index.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import type { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";

export interface PipelineRunnerFactoryInput<TRecord, TContext extends Processor.Context, TShard> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processor: Abstraction<Processor.Interface<TRecord, TContext>>;
}

interface IPipelineRunner {
    pipeline<TRecord, TContext extends Processor.Context, TShard>(
        config: PipelineRunnerFactoryInput<TRecord, TContext, TShard>
    ): PipelineBuilder<TRecord, TContext, TShard>;

    register(pipeline: Pipeline<unknown, Processor.Context, unknown>): this;

    run(): Promise<void>;
}

export const PipelineRunner = createAbstraction<IPipelineRunner>("Core/PipelineRunner");

export namespace PipelineRunner {
    export type Interface = IPipelineRunner;
    export type FactoryInput<
        TRecord,
        TContext extends Processor.Context,
        TShard
    > = PipelineRunnerFactoryInput<TRecord, TContext, TShard>;
}
```

This replaces the old `register/processRecord/processAll` shape entirely.

- [ ] **Step 2: Type-check (expected to surface implementation breakage)**

Run: `yarn ts-check`
Expected: errors in `src/features/PipelineRunner/PipelineRunner.ts` (the implementation no longer matches the interface) AND in any callers of the old methods (`__tests__/features/PipelineRunner/PipelineRunner.test.ts`, `__tests__/security-teams.test.ts`, possibly `src/commands/processSegment/handler.ts`). These will be addressed in subsequent tasks. Don't commit yet.

- [ ] **Step 3: Note breakage and proceed (no commit yet — Task 5 lands the implementation that makes ts-check pass again)**

Skip the commit for this task. The interface change alone leaves the codebase in a broken state; combine with Task 5's implementation in a single commit instead.

---

## Task 5: Rewrite `PipelineRunner` implementation + tests

**Files:**
- Modify: `src/features/PipelineRunner/PipelineRunner.ts`
- Modify: `src/features/PipelineRunner/feature.ts` (likely no-op, verify)
- Modify: `src/features/PipelineRunner/index.ts` (verify exports)
- Replace: `__tests__/features/PipelineRunner/PipelineRunner.test.ts` (delete old, write new)

- [ ] **Step 1: Replace the implementation**

Replace the contents of `src/features/PipelineRunner/PipelineRunner.ts`:

```typescript
import type { Container, Abstraction } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";
import {
    PipelineRunner as PipelineRunnerAbstraction,
    type PipelineRunnerFactoryInput
} from "./abstractions/PipelineRunner.ts";

interface ITransformer<TContext> {
    transform(ctx: TContext): void | Promise<void>;
}

class PipelineRunnerImpl implements PipelineRunnerAbstraction.Interface {
    private mergeGroups: Map<
        Abstraction<Scanner.Interface<unknown, unknown>>,
        Pipeline<unknown, Processor.Context, unknown>[]
    > = new Map();

    private pipelineNames: Set<string> = new Set();

    public constructor(
        private readonly container: Container,
        private readonly logger: Logger.Interface
    ) {}

    public pipeline<TRecord, TContext extends Processor.Context, TShard>(
        config: PipelineRunnerFactoryInput<TRecord, TContext, TShard>
    ): PipelineBuilder<TRecord, TContext, TShard> {
        return new PipelineBuilder<TRecord, TContext, TShard>({
            name: config.name,
            scanner: config.scanner,
            processor: config.processor
        });
    }

    public register(pipeline: Pipeline<unknown, Processor.Context, unknown>): this {
        if (this.pipelineNames.has(pipeline.name)) {
            throw new Error(
                `PipelineRunner: pipeline name "${pipeline.name}" already registered`
            );
        }
        this.pipelineNames.add(pipeline.name);

        const groupKey = pipeline.scannerToken as Abstraction<Scanner.Interface<unknown, unknown>>;
        const group = this.mergeGroups.get(groupKey);
        if (group) {
            group.push(pipeline);
        } else {
            this.mergeGroups.set(groupKey, [pipeline]);
        }

        const mergeGroupId = this.deriveMergeGroupId(groupKey);
        for (const hookToken of pipeline.beforeHookTokens) {
            this.logger.debug({
                msg: "hook registered but not invoked in this runner version",
                hookToken: hookToken.description,
                lifecycle: "before",
                pipeline: pipeline.name,
                mergeGroupId
            });
        }
        for (const hookToken of pipeline.afterHookTokens) {
            this.logger.debug({
                msg: "hook registered but not invoked in this runner version",
                hookToken: hookToken.description,
                lifecycle: "after",
                pipeline: pipeline.name,
                mergeGroupId
            });
        }

        return this;
    }

    public async run(): Promise<void> {
        for (const [scannerToken, pipelines] of this.mergeGroups) {
            await this.runMergeGroup(scannerToken, pipelines);
        }
    }

    private async runMergeGroup(
        scannerToken: Abstraction<Scanner.Interface<unknown, unknown>>,
        pipelines: Pipeline<unknown, Processor.Context, unknown>[]
    ): Promise<void> {
        const scanner = this.container.resolve(scannerToken);
        const mergeGroupId = this.deriveMergeGroupId(scannerToken);

        const pipelineToProcessor: Map<
            Pipeline<unknown, Processor.Context, unknown>,
            Processor.Interface<unknown, Processor.Context>
        > = new Map();
        for (const pipeline of pipelines) {
            pipelineToProcessor.set(pipeline, this.container.resolve(pipeline.processorToken));
        }

        const shards = await scanner.listShards();
        for (const shard of shards) {
            await this.runShard(mergeGroupId, pipelines, scanner, shard, pipelineToProcessor);
        }
    }

    private async runShard(
        mergeGroupId: string,
        pipelines: Pipeline<unknown, Processor.Context, unknown>[],
        scanner: Scanner.Interface<unknown, unknown>,
        shard: unknown,
        pipelineToProcessor: Map<
            Pipeline<unknown, Processor.Context, unknown>,
            Processor.Interface<unknown, Processor.Context>
        >
    ): Promise<void> {
        const processorBuffers: Map<
            Processor.Interface<unknown, Processor.Context>,
            Commands
        > = new Map();

        for await (const record of scanner.scan(shard)) {
            let matched = false;
            for (const pipeline of pipelines) {
                if (!pipeline.accepts(record)) {
                    continue;
                }
                matched = true;
                const processor = pipelineToProcessor.get(pipeline)!;
                const ctx = processor.createContext(record);
                for (const token of pipeline.transformerTokens) {
                    const transformer = this.container.resolve(
                        token as Abstraction<ITransformer<Processor.Context>>
                    );
                    await transformer.transform(ctx);
                }
                let buffer = processorBuffers.get(processor);
                if (!buffer) {
                    buffer = new Commands();
                    processorBuffers.set(processor, buffer);
                }
                for (const cmd of ctx.commands.all()) {
                    buffer.add(cmd);
                }
            }
            if (!matched) {
                this.logger.debug({
                    msg: "record dropped: no matching pipeline in merge group",
                    mergeGroupId
                });
            }
        }

        for (const [processor, buffer] of processorBuffers) {
            if (buffer.size() > 0) {
                await processor.execute(buffer);
            }
        }
    }

    private deriveMergeGroupId(scannerToken: Abstraction<unknown>): string {
        return scannerToken.description.replace(/\//g, "-");
    }
}

export const PipelineRunner = PipelineRunnerAbstraction.createImplementation({
    implementation: PipelineRunnerImpl,
    dependencies: [ContainerToken, Logger]
});
```

- [ ] **Step 2: Verify feature + barrel are consistent**

Read `src/features/PipelineRunner/feature.ts` — should still register `PipelineRunner` in singleton scope. No change needed:

```typescript
import { createFeature } from "~/base/index.ts";
import { PipelineRunner } from "./PipelineRunner.ts";

export const PipelineRunnerFeature = createFeature({
    name: "Core/PipelineRunnerFeature",
    register(container) {
        container.register(PipelineRunner).inSingletonScope();
    }
});
```

Read `src/features/PipelineRunner/index.ts` — should still export `PipelineRunner` and `PipelineRunnerFeature`. No change needed.

- [ ] **Step 3: Delete + replace the existing test file**

Delete `__tests__/features/PipelineRunner/PipelineRunner.test.ts` (it tests the removed `processRecord`/`processAll` methods — none of those tests survive the rewrite):

```bash
rm __tests__/features/PipelineRunner/PipelineRunner.test.ts
```

Create the new `__tests__/features/PipelineRunner/PipelineRunner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import type { Abstraction } from "@webiny/di";
import { ContainerToken, createAbstraction } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import {
    PipelineRunner,
    PipelineRunnerFeature
} from "~/features/PipelineRunner/index.ts";
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
    level: "debug" | "info" | "warn" | "error";
    payload: unknown;
}

class TestLogger implements Logger.Interface {
    public readonly entries: CapturedLog[] = [];
    public debug(payload: unknown): void {
        this.entries.push({ level: "debug", payload });
    }
    public info(payload: unknown): void {
        this.entries.push({ level: "info", payload });
    }
    public warn(payload: unknown): void {
        this.entries.push({ level: "warn", payload });
    }
    public error(payload: unknown): void {
        this.entries.push({ level: "error", payload });
    }
    public child(): Logger.Interface {
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
    return builder.build();
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
        const lifecycles = debugEntries.map(e => (e.payload as { lifecycle?: string }).lifecycle);
        expect(lifecycles).toContain("before");
        expect(lifecycles).toContain("after");
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
        scanner.records = [{ id: "r1", type: "foo" }, { id: "r2", type: "foo" }];

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
        runner.register(builder.build());
        await runner.run();

        // One execute() call per processor at shard end (we have one shard, one processor).
        // Buffer contains 2 commands (one per record).
        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(2);
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
        runner.register(builderA.build()).register(builderB.build());

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

        const dropMessages = logger.entries.filter(e => {
            const p = e.payload as { msg?: string };
            return p.msg === "record dropped: no matching pipeline in merge group";
        });
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
```

Note the `FakeProcessor`/`FakeScanner` imports: these are class types from `fakes.ts`. The current `fakes.ts` exports `FakeScanner` and `FakeProcessor` (the classes) — verify the export. If the existing fixture only exports the `Impl` consts, add class exports as needed (low-risk one-line additions). Keep the `as FakeScanner` type assertion to access the `.records` setter.

- [ ] **Step 4: Run the tests**

Run: `yarn test __tests__/features/PipelineRunner/PipelineRunner.test.ts`
Expected: PASS — all tests in the new file.

- [ ] **Step 5: Run the full suite to see fallout**

Run: `yarn test`
Expected: failures in `__tests__/security-teams.test.ts` (uses removed `runner.processRecord`). Other legacy tests already excluded (per `vitest.config.ts`). Record the new pass/fail count for the commit message.

- [ ] **Step 6: Type-check**

Run: `yarn ts-check`
Expected: pre-existing errors in `src/presets/example.ts` AND new errors in `__tests__/security-teams.test.ts` (calls deleted `processRecord`) AND possibly in `src/commands/processSegment/handler.ts` if it calls the deleted methods. Other code should be clean.

- [ ] **Step 7: Commit**

```bash
yarn format:fix
git add src/features/PipelineRunner/abstractions/PipelineRunner.ts \
        src/features/PipelineRunner/PipelineRunner.ts \
        __tests__/features/PipelineRunner/PipelineRunner.test.ts
git rm __tests__/features/PipelineRunner/PipelineRunner.test.ts.bak 2>/dev/null || true
git commit -m "feat: rewrite PipelineRunner around new Pipeline + merge groups

Old register(TransformPipeline) / processRecord / processAll deleted.
New API: pipeline() factory, register(Pipeline), run().
Routes records by scanner-token grouping with first-match-wins semantics,
buffers commands per processor instance, flushes at shard boundary.

Fallout: security-teams.test.ts now broken (uses old processRecord),
will be ported in cleanup plan."
```

---

## Task 6: `DdbScanner` feature

**Files:**
- Create: `src/features/DdbScanner/abstractions/DdbScanner.ts`
- Create: `src/features/DdbScanner/abstractions/index.ts`
- Create: `src/features/DdbScanner/DdbScanner.ts`
- Create: `src/features/DdbScanner/feature.ts`
- Create: `src/features/DdbScanner/index.ts`
- Test: `__tests__/features/DdbScanner/DdbScanner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/DdbScanner/DdbScanner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { Scanner } from "~/domain/pipeline/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import type { DdbShard } from "~/features/DdbScanner/abstractions/DdbScanner.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

function makeRecord(pk: string, sk: string, type: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type
    };
}

describe("DdbScanner", () => {
    it("is registrable and resolvable through the Scanner abstraction", () => {
        const container = createDdbContainer();
        const scanner = container.resolve(Scanner);
        expect(scanner).toBeDefined();
        expect(typeof scanner.listShards).toBe("function");
        expect(typeof scanner.scan).toBe("function");
    });

    it("returns a single shard when pipeline.segments is unset", async () => {
        const container = createDdbContainer();
        const scanner = container.resolve(Scanner) as Scanner.Interface<BaseRecord, DdbShard>;
        const shards = await scanner.listShards();
        expect(shards).toEqual([{ segment: 0, total: 1 }]);
    });

    it("returns N shards when pipeline.segments is set", async () => {
        const container = createDdbContainer({
            pipelineOverride: { segments: 4 }
        });
        const scanner = container.resolve(Scanner) as Scanner.Interface<BaseRecord, DdbShard>;
        const shards = await scanner.listShards();
        expect(shards).toEqual([
            { segment: 0, total: 4 },
            { segment: 1, total: 4 },
            { segment: 2, total: 4 },
            { segment: 3, total: 4 }
        ]);
    });

    it("scans the source table for records of a single shard", async () => {
        const records = [makeRecord("a", "1", "test"), makeRecord("b", "1", "test")];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const scanner = container.resolve(Scanner) as Scanner.Interface<BaseRecord, DdbShard>;

        const collected: BaseRecord[] = [];
        for await (const record of scanner.scan({ segment: 0, total: 1 })) {
            collected.push(record);
        }
        expect(collected).toHaveLength(2);
        expect(collected[0]?.PK).toBe("a");
    });
});
```

This test depends on `createDdbContainer` accepting a `pipelineOverride` option. The current helper doesn't support that (see `__tests__/containers/ddb.ts`). Update it as part of this task — see Step 4.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test __tests__/features/DdbScanner/DdbScanner.test.ts`
Expected: FAIL — `DdbScanner` not exported.

- [ ] **Step 3: Create the abstraction shape file**

Create `src/features/DdbScanner/abstractions/DdbScanner.ts`:

```typescript
export interface DdbShard {
    segment: number;
    total: number;
}
```

This file holds the shape only. The actual `Scanner` abstraction is generic — `DdbScanner` registers against `Scanner` directly, not against a `DdbScanner` abstraction.

- [ ] **Step 4: Create the abstractions barrel**

Create `src/features/DdbScanner/abstractions/index.ts`:

```typescript
export type { DdbShard } from "./DdbScanner.ts";
```

- [ ] **Step 5: Implement the scanner**

Create `src/features/DdbScanner/DdbScanner.ts`:

```typescript
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbShard } from "./abstractions/DdbScanner.ts";

class DdbScannerImpl implements Scanner.Interface<BaseRecord, DdbShard> {
    public constructor(
        private readonly source: SourceDynamoDbClient.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public async listShards(): Promise<DdbShard[]> {
        const total = this.config.pipeline.segments ?? 1;
        const shards: DdbShard[] = [];
        for (let i = 0; i < total; i++) {
            shards.push({ segment: i, total });
        }
        return shards;
    }

    public async *scan(shard: DdbShard): AsyncIterable<BaseRecord> {
        if (this.config.storage !== "ddb") {
            throw new Error(
                "DdbScanner: source is not in DDB storage mode; check config.storage"
            );
        }
        yield* this.source.scan(this.config.source.dynamodb.tableName, {
            segment: shard.segment,
            totalSegments: shard.total
        });
    }
}

export const DdbScanner = Scanner.createImplementation({
    implementation: DdbScannerImpl,
    dependencies: [SourceDynamoDbClient, MigrationConfig]
});
```

The storage-mode guard inside `scan()` is defensive: `this.config.source.dynamodb.tableName` is only available when storage === "ddb"; OS-mode configs don't have it. The check throws a clear error rather than letting TypeScript narrowing rules break at compile-time.

- [ ] **Step 6: Create the feature registration**

Create `src/features/DdbScanner/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { DdbScanner } from "./DdbScanner.ts";

export const DdbScannerFeature = createFeature({
    name: "Core/DdbScannerFeature",
    register(container) {
        container.register(DdbScanner).inSingletonScope();
    }
});
```

- [ ] **Step 7: Create the public barrel**

Create `src/features/DdbScanner/index.ts`:

```typescript
export { DdbScanner } from "./DdbScanner.ts";
export { DdbScannerFeature } from "./feature.ts";
export type { DdbShard } from "./abstractions/DdbScanner.ts";
```

- [ ] **Step 8: Update `createDdbContainer` to register the new feature + accept pipeline override**

Modify `__tests__/containers/ddb.ts`. Add the import:

```typescript
import { DdbScannerFeature } from "../../src/features/DdbScanner/index.ts";
```

Update the options type to add a pipeline override:

```typescript
export interface DdbContainerOptions {
    sourceRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    modelsDir?: string;
    logLevel?: "debug" | "info" | "warn" | "error";
    pipelineOverride?: {
        segments?: number;
    };
}
```

Update the config construction to merge the override:

```typescript
const config: MigrationConfig.Interface = {
    storage: "ddb",
    source: { /* ... unchanged ... */ },
    target: { /* ... unchanged ... */ },
    pipeline: {
        preset: "v5-to-v6",
        modelsDir: options.modelsDir,
        ...(options.pipelineOverride?.segments !== undefined
            ? { segments: options.pipelineOverride.segments }
            : {})
    }
};
```

Add the feature registration at the bottom (just after `PipelineRunnerFeature.register(container);`):

```typescript
DdbScannerFeature.register(container);
```

- [ ] **Step 9: Run the test**

Run: `yarn test __tests__/features/DdbScanner/DdbScanner.test.ts`
Expected: PASS (4/4).

- [ ] **Step 10: Format, type-check, commit**

```bash
yarn format:fix
yarn ts-check
git add src/features/DdbScanner/ \
        __tests__/features/DdbScanner/ \
        __tests__/containers/ddb.ts
git commit -m "feat: add DdbScanner over SourceDynamoDbClient"
```

---

## Task 7: `DdbProcessor` feature

**Files:**
- Create: `src/features/DdbProcessor/abstractions/DdbProcessor.ts`
- Create: `src/features/DdbProcessor/abstractions/index.ts`
- Create: `src/features/DdbProcessor/DdbProcessor.ts`
- Create: `src/features/DdbProcessor/feature.ts`
- Create: `src/features/DdbProcessor/index.ts`
- Test: `__tests__/features/DdbProcessor/DdbProcessor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/DdbProcessor/DdbProcessor.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { Container } from "@webiny/di";
import { createDdbContainer } from "../../containers/index.ts";
import { Processor } from "~/domain/pipeline/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

function makeRecord(pk: string, sk: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: "test"
    };
}

describe("DdbProcessor", () => {
    it("is registrable and resolvable through the Processor abstraction", () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);
        expect(processor).toBeDefined();
        expect(typeof processor.execute).toBe("function");
        expect(typeof processor.createContext).toBe("function");
        expect(typeof processor.getShardState).toBe("function");
    });

    it("creates a fresh context per record with a Commands collection", () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);

        const ctxA = processor.createContext(makeRecord("a", "1"));
        const ctxB = processor.createContext(makeRecord("b", "1"));

        expect(ctxA).not.toBe(ctxB);
        expect((ctxA as { record: BaseRecord }).record.PK).toBe("a");
        expect((ctxA as { commands: Commands }).commands).toBeInstanceOf(Commands);
    });

    it("delegates execute() to the underlying DdbCommandExecutor", async () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);
        const executor = container.resolve(DdbCommandExecutor);
        const spy = vi.spyOn(executor, "execute");

        const commands = new Commands();
        commands.add(new PutRecord({ PK: "a", SK: "1" }));
        await processor.execute(commands);

        expect(spy).toHaveBeenCalledWith(commands);
    });

    it("returns an empty shard-state object", () => {
        const container = createDdbContainer();
        const processor = container.resolve(Processor);
        expect(processor.getShardState()).toEqual({});
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test __tests__/features/DdbProcessor/DdbProcessor.test.ts`
Expected: FAIL — `DdbProcessor` not exported / not registered.

- [ ] **Step 3: Create the abstraction shape file**

Create `src/features/DdbProcessor/abstractions/DdbProcessor.ts`:

```typescript
export interface DdbShardState {
    // empty in this scope — DDB has no per-shard state to persist.
    // Future plans add fields like { recordsProcessed: number } if needed.
}
```

- [ ] **Step 4: Create the abstractions barrel**

Create `src/features/DdbProcessor/abstractions/index.ts`:

```typescript
export type { DdbShardState } from "./DdbProcessor.ts";
```

- [ ] **Step 5: Implement the processor**

Create `src/features/DdbProcessor/DdbProcessor.ts`:

```typescript
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import {
    DdbTransformContextFactory,
    type DdbTransformContext
} from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { DdbShardState } from "./abstractions/DdbProcessor.ts";

class DdbProcessorImpl
    implements Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
{
    public constructor(
        private readonly executor: DdbCommandExecutor.Interface,
        private readonly contextFactory: DdbTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        await this.executor.execute(commands);
    }

    public createContext(record: BaseRecord): DdbTransformContext.Interface<BaseRecord> {
        return this.contextFactory.create({ record });
    }

    public getShardState(): DdbShardState {
        return {};
    }
}

export const DdbProcessor = Processor.createImplementation({
    implementation: DdbProcessorImpl,
    dependencies: [DdbCommandExecutor, DdbTransformContextFactory]
});
```

- [ ] **Step 6: Create the feature registration**

Create `src/features/DdbProcessor/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { DdbProcessor } from "./DdbProcessor.ts";

export const DdbProcessorFeature = createFeature({
    name: "Core/DdbProcessorFeature",
    register(container) {
        container.register(DdbProcessor).inSingletonScope();
    }
});
```

- [ ] **Step 7: Create the public barrel**

Create `src/features/DdbProcessor/index.ts`:

```typescript
export { DdbProcessor } from "./DdbProcessor.ts";
export { DdbProcessorFeature } from "./feature.ts";
export type { DdbShardState } from "./abstractions/DdbProcessor.ts";
```

- [ ] **Step 8: Register in `createDdbContainer`**

Modify `__tests__/containers/ddb.ts`. Add the import:

```typescript
import { DdbProcessorFeature } from "../../src/features/DdbProcessor/index.ts";
```

Add the registration line after `DdbScannerFeature.register(container);`:

```typescript
DdbProcessorFeature.register(container);
```

- [ ] **Step 9: Run the test**

Run: `yarn test __tests__/features/DdbProcessor/DdbProcessor.test.ts`
Expected: PASS (4/4).

- [ ] **Step 10: Format, type-check, commit**

```bash
yarn format:fix
yarn ts-check
git add src/features/DdbProcessor/ \
        __tests__/features/DdbProcessor/ \
        __tests__/containers/ddb.ts
git commit -m "feat: add DdbProcessor over DdbCommandExecutor + DdbTransformContextFactory"
```

---

## Task 8: Wire `DdbScanner` + `DdbProcessor` into `bootstrap.ts`

**Files:**
- Modify: `src/bootstrap.ts`

- [ ] **Step 1: Add the imports**

Add to the import block at the top of `src/bootstrap.ts`:

```typescript
import { DdbScannerFeature } from "~/features/DdbScanner/index.ts";
import { DdbProcessorFeature } from "~/features/DdbProcessor/index.ts";
```

- [ ] **Step 2: Register inside the DDB-mode branch**

Inside `bootstrap()`, in the `if (config.storage === "ddb") { DdbCommandExecutorFeature.register(container); }` block (near the bottom), append the two new registrations:

```typescript
if (config.storage === "ddb") {
    DdbCommandExecutorFeature.register(container);
    DdbScannerFeature.register(container);
    DdbProcessorFeature.register(container);
}
```

- [ ] **Step 3: Run the full test suite**

Run: `yarn test`
Expected: same pass/fail count as after Task 7 — the bootstrap change doesn't affect tests, but verifies no DI-graph collisions arose from registering the new features in the production bootstrap path.

- [ ] **Step 4: Type-check**

Run: `yarn ts-check`
Expected: pre-existing `src/presets/example.ts` + the known fallout in `__tests__/security-teams.test.ts` and `src/commands/processSegment/handler.ts`. Nothing new from this task.

- [ ] **Step 5: Commit**

```bash
yarn format:fix
git add src/bootstrap.ts
git commit -m "feat: register DdbScannerFeature + DdbProcessorFeature in DDB-mode bootstrap"
```

---

## Task 9: End-to-end integration test

**Files:**
- Create: `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { createFilter } from "~/domain/pipeline/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { createAbstraction, createImplementation } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { DdbShard } from "~/features/DdbScanner/index.ts";

interface IPassthroughTransformer {
    transform(ctx: DdbTransformContext.Interface<BaseRecord>): void;
}

class PassthroughTransformer implements IPassthroughTransformer {
    public transform(ctx: DdbTransformContext.Interface<BaseRecord>): void {
        ctx.commands.add(new PutRecord({ ...ctx.record }));
    }
}

const PassthroughTransformerToken = createAbstraction<IPassthroughTransformer>(
    "Test/PassthroughTransformer"
);

const PassthroughTransformerImpl = PassthroughTransformerToken.createImplementation({
    implementation: PassthroughTransformer,
    dependencies: []
});

function makeRecord(pk: string, sk: string, type: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type
    };
}

describe("PipelineRunner — end-to-end against MockDynamoDbClient", () => {
    it("scans source DDB, dispatches matching records through transformers, writes to target via processor", async () => {
        const sourceRecords = [
            makeRecord("tenant-1", "team-1", "security.team"),
            makeRecord("tenant-1", "group-1", "security.group"),
            makeRecord("tenant-1", "team-2", "security.team")
        ];
        const container = createDdbContainer({
            sourceRecords: { "source-table": sourceRecords }
        });
        container.register(PassthroughTransformerImpl).inSingletonScope();

        const runner = container.resolve(PipelineRunner);

        const teamsBuilder = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbShard
        >({
            name: "teams",
            scanner: Scanner,
            processor: Processor
        });
        teamsBuilder
            .filter(createFilter<BaseRecord>(r => r.TYPE === "security.team"))
            .use(PassthroughTransformerToken);
        runner.register(teamsBuilder.build());

        const groupsBuilder = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbShard
        >({
            name: "groups",
            scanner: Scanner,
            processor: Processor
        });
        groupsBuilder
            .filter(createFilter<BaseRecord>(r => r.TYPE === "security.group"))
            .use(PassthroughTransformerToken);
        runner.register(groupsBuilder.build());

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const written = targetDb.batchPutRecords;

        expect(written).toHaveLength(3);
        const types = written.map(r => r.TYPE).sort();
        expect(types).toEqual(["security.group", "security.team", "security.team"]);
    });

    it("registering two pipelines with the same name throws even across different filters", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);

        const builderA = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbShard
        >({
            name: "dup",
            scanner: Scanner,
            processor: Processor
        });
        builderA.filter(createFilter<BaseRecord>(() => true));
        runner.register(builderA.build());

        const builderB = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbShard
        >({
            name: "dup",
            scanner: Scanner,
            processor: Processor
        });
        builderB.filter(createFilter<BaseRecord>(() => true));

        expect(() => runner.register(builderB.build())).toThrow(/already registered/i);
    });
});
```

- [ ] **Step 2: Run the integration test**

Run: `yarn test __tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`
Expected: PASS (2/2). The first test proves DDB scanner → transformers → processor → mock DDB target wiring works for two pipelines on the same scanner with disjoint filters. The second test verifies cross-group-style name uniqueness via the integration container.

- [ ] **Step 3: Run the full suite**

Run: `yarn test`
Expected: same pass/fail count as after Task 8 (only the legacy `security-teams.test.ts` regression should remain). Note the count for the final task.

- [ ] **Step 4: Format, type-check, commit**

```bash
yarn format:fix
yarn ts-check
git add __tests__/features/PipelineRunner/PipelineRunner.integration.test.ts
git commit -m "test: end-to-end runner integration against MockDynamoDbClient"
```

---

## Task 10: Final verification + record fallout

**Files:** none modified — verification only.

- [ ] **Step 1: Format-check**

Run: `yarn format:fix`
Expected: no modifications (or only minor whitespace tweaks). If files change, stage them.

- [ ] **Step 2: Type-check**

Run: `yarn ts-check`
Expected: only pre-existing errors in `src/presets/example.ts` PLUS expected fallout in `__tests__/security-teams.test.ts` and `src/commands/processSegment/handler.ts` (both call deleted methods). NO new errors from `src/domain/pipeline/`, `src/features/PipelineRunner/`, `src/features/DdbScanner/`, `src/features/DdbProcessor/`, or `src/base/`.

- [ ] **Step 3: Test run + record numbers**

Run: `yarn test`
Note the new `passed / failed / total` numbers for `security-teams.test.ts` and any other casualties. Compare to the pre-plan baseline of 372/372.

- [ ] **Step 4: Commit summary**

If Step 1 produced format changes, commit them:

```bash
git add -A
git commit -m "chore: format pass after runner integration"
```

Otherwise no commit. Report the final state to the user with these data points:

- Total commits added by this plan (expect 9 — Tasks 1, 2, 3, 5, 6, 7, 8, 9, optional Step 4 of Task 10).
- Final test pass/fail counts.
- Files broken (expected: `__tests__/security-teams.test.ts`, possibly `src/commands/processSegment/handler.ts`).
- New public surface from `src/features/PipelineRunner/`, `src/features/DdbScanner/`, `src/features/DdbProcessor/`, and `src/base/` (`ContainerToken`).

The next plan (cleanup / preset migration) ports `security-teams.test.ts` to use `runner.run()` against the new pipelines, fixes `processSegment/handler.ts`, and migrates `v5-to-v6-ddb` to the new builder API.
