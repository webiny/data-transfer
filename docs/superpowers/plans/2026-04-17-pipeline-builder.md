# PipelineBuilder Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the new pipeline-centric API primitives (Scanner/Processor/Hook abstractions, Filter + createFilter helper, Pipeline class, PipelineBuilder class) as pure domain code, TDD'd against fake implementations. No runner integration, no real scanner/processor impls, no preset migration in this plan.

**Architecture:** New code lives under `src/domain/pipeline/` in parallel with the existing `src/domain/transform/Pipeline.ts` / `PipelineBuilder.ts` (which stay intact until a later plan migrates callers). Abstractions are declared via the project's `createAbstraction` helper using the `namespace Name { export type Interface = ... }` pattern. Pipeline holds a container reference and resolves DI tokens on demand; filters are plain functions branded through `createFilter`; hooks and transformers stay DI-class tokens.

**Tech Stack:** TypeScript strict, `@webiny/di` (`Abstraction`, `Container`, `createAbstraction`), vitest, `~/` path alias (maps to `src/`).

**Design reference:** `docs/design/generic-pipeline-framework.md` → "Resolved design decisions" section captures all 16 grilled decisions this plan implements.

**Out of scope (future plans):**
- `PipelineRunner.pipeline()` factory and `register()` merge-group grouping/validation.
- Real `DdbScanner`, `OsScanner`, `DdbProcessor`, `OsProcessor` implementations.
- Worker framework changes (batch flushing, state-file writing).
- Preset migration to the new API.
- Interactive orchestration / resume layer.

---

## File Structure

**New files:**

- `src/domain/pipeline/Filter.ts` — `Filter<T>` interface + `createFilter` helper.
- `src/domain/pipeline/abstractions/Scanner.ts` — `Scanner` abstraction + namespace.
- `src/domain/pipeline/abstractions/Processor.ts` — `Processor` abstraction + namespace.
- `src/domain/pipeline/abstractions/Hook.ts` — `Hook` abstraction + namespace.
- `src/domain/pipeline/abstractions/index.ts` — barrel for abstractions.
- `src/domain/pipeline/Pipeline.ts` — `Pipeline` class.
- `src/domain/pipeline/PipelineBuilder.ts` — `PipelineBuilder` class.
- `src/domain/pipeline/index.ts` — public barrel.
- `__tests__/domain/pipeline/fixtures/types.ts` — shared test record/context/shard types.
- `__tests__/domain/pipeline/fixtures/fakes.ts` — fake Scanner/Processor/Hook/Transformer classes + registration helper.
- `__tests__/domain/pipeline/Filter.test.ts` — Filter helper tests.
- `__tests__/domain/pipeline/Pipeline.test.ts` — Pipeline behavior tests.
- `__tests__/domain/pipeline/PipelineBuilder.test.ts` — builder API + build() output tests.

**No existing files modified** (old `src/domain/transform/Pipeline.ts` / `PipelineBuilder.ts` stay untouched).

**Public API (exported from `src/domain/pipeline/index.ts`):**
- `createFilter` (value), `Filter` (type)
- `Scanner`, `Processor`, `Hook` (abstraction tokens + namespaces)
- `Pipeline` (class)
- `PipelineBuilder` (class)

---

## Project conventions to follow

- Use `yarn` for all commands. Never `npm`.
- Always wrap `if`/`for`/`while` bodies in curly braces.
- All class members get explicit `public` / `private` / `protected` modifiers.
- Abstraction `index.ts` exports only constants. Types go through the namespace (`export namespace X { export type Interface = ... }`).
- Path alias: `~/features/X`, `~/domain/X`, etc. (points to `src/`).
- Use `.ts` extensions on all imports from source files.
- Do NOT import `reflect-metadata` — `@webiny/di` handles that internally.
- After each task, run `yarn format:fix` + `yarn ts-check` + `yarn test` and commit only after green.
- Commit per task (each task is one logical section).

---

## Task 1: Scaffold directory + `createFilter` helper

**Files:**
- Create: `src/domain/pipeline/Filter.ts`
- Create: `src/domain/pipeline/index.ts`
- Test: `__tests__/domain/pipeline/Filter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/domain/pipeline/Filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createFilter, type Filter } from "~/domain/pipeline/index.ts";

interface TestRecord {
    type: string;
    deleted?: boolean;
}

describe("createFilter", () => {
    it("wraps a predicate into a branded Filter", () => {
        const isFoo = createFilter<TestRecord>((record) => record.type === "foo");

        expect(isFoo.kind).toBe("filter");
        expect(typeof isFoo.check).toBe("function");
        expect(isFoo.check({ type: "foo" })).toBe(true);
        expect(isFoo.check({ type: "bar" })).toBe(false);
    });

    it("preserves the predicate's logic exactly", () => {
        const notDeleted = createFilter<TestRecord>((record) => !record.deleted);

        expect(notDeleted.check({ type: "x", deleted: false })).toBe(true);
        expect(notDeleted.check({ type: "x", deleted: true })).toBe(false);
        expect(notDeleted.check({ type: "x" })).toBe(true);
    });

    it("returns an object compatible with Filter<T>", () => {
        const filter: Filter<TestRecord> = createFilter<TestRecord>(
            (record) => record.type === "foo"
        );

        expect(filter).toBeDefined();
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `yarn test __tests__/domain/pipeline/Filter.test.ts`
Expected: FAIL — module `~/domain/pipeline/index.ts` does not exist.

- [ ] **Step 3: Implement `Filter.ts`**

Create `src/domain/pipeline/Filter.ts`:

```typescript
export interface Filter<TRecord> {
    readonly kind: "filter";
    readonly check: (record: TRecord) => boolean;
}

export function createFilter<TRecord>(
    predicate: (record: TRecord) => boolean
): Filter<TRecord> {
    return {
        kind: "filter",
        check: predicate
    };
}
```

- [ ] **Step 4: Create barrel `index.ts`**

Create `src/domain/pipeline/index.ts`:

```typescript
export { createFilter, type Filter } from "./Filter.ts";
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `yarn test __tests__/domain/pipeline/Filter.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Format, type-check, commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/Filter.ts src/domain/pipeline/index.ts \
        __tests__/domain/pipeline/Filter.test.ts
git commit -m "feat: add createFilter helper for pipeline filters"
```

---

## Task 2: `Scanner` abstraction

**Files:**
- Create: `src/domain/pipeline/abstractions/Scanner.ts`
- Create: `src/domain/pipeline/abstractions/index.ts`
- Modify: `src/domain/pipeline/index.ts`
- Test: `__tests__/domain/pipeline/Scanner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/pipeline/Scanner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { createImplementation } from "~/base/index.ts";
import { Scanner } from "~/domain/pipeline/index.ts";

interface TestRecord {
    id: string;
}

interface TestShard {
    from: number;
    to: number;
}

class FakeScanner implements Scanner.Interface<TestRecord, TestShard> {
    public async listShards(): Promise<TestShard[]> {
        return [
            { from: 0, to: 10 },
            { from: 10, to: 20 }
        ];
    }

    public async *scan(shard: TestShard): AsyncIterable<TestRecord> {
        for (let i = shard.from; i < shard.to; i++) {
            yield { id: `record-${i}` };
        }
    }
}

const TestScanner = Scanner.createImplementation({
    implementation: FakeScanner,
    dependencies: []
});

describe("Scanner abstraction", () => {
    it("is registrable and resolvable via the DI container", () => {
        const container = new Container();
        container.register(TestScanner).inSingletonScope();

        const scanner = container.resolve(Scanner);
        expect(scanner).toBeInstanceOf(FakeScanner);
    });

    it("lists shards and yields records for each shard", async () => {
        const container = new Container();
        container.register(TestScanner).inSingletonScope();
        const scanner = container.resolve(Scanner) as Scanner.Interface<
            TestRecord,
            TestShard
        >;

        const shards = await scanner.listShards();
        expect(shards).toHaveLength(2);

        const collected: TestRecord[] = [];
        for await (const record of scanner.scan(shards[0]!)) {
            collected.push(record);
        }
        expect(collected).toHaveLength(10);
        expect(collected[0]).toEqual({ id: "record-0" });
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `yarn test __tests__/domain/pipeline/Scanner.test.ts`
Expected: FAIL — `Scanner` is not exported from `~/domain/pipeline/index.ts`.

- [ ] **Step 3: Implement `Scanner` abstraction**

Create `src/domain/pipeline/abstractions/Scanner.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";

interface IScanner<TRecord = unknown, TShard = unknown> {
    listShards(): Promise<TShard[]>;
    scan(shard: TShard): AsyncIterable<TRecord>;
}

export const Scanner = createAbstraction<IScanner>("Core/Scanner");

export namespace Scanner {
    export type Interface<TRecord = unknown, TShard = unknown> = IScanner<TRecord, TShard>;
}
```

- [ ] **Step 4: Create abstractions barrel**

Create `src/domain/pipeline/abstractions/index.ts`:

```typescript
export { Scanner } from "./Scanner.ts";
```

- [ ] **Step 5: Re-export from pipeline barrel**

Modify `src/domain/pipeline/index.ts`:

```typescript
export { createFilter, type Filter } from "./Filter.ts";
export { Scanner } from "./abstractions/index.ts";
```

- [ ] **Step 6: Run tests**

Run: `yarn test __tests__/domain/pipeline/Scanner.test.ts`
Expected: PASS (2/2).

- [ ] **Step 7: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/abstractions/Scanner.ts \
        src/domain/pipeline/abstractions/index.ts \
        src/domain/pipeline/index.ts \
        __tests__/domain/pipeline/Scanner.test.ts
git commit -m "feat: add Scanner abstraction for pipeline record sources"
```

---

## Task 3: `Processor` abstraction

**Files:**
- Create: `src/domain/pipeline/abstractions/Processor.ts`
- Modify: `src/domain/pipeline/abstractions/index.ts`
- Modify: `src/domain/pipeline/index.ts`
- Test: `__tests__/domain/pipeline/Processor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/pipeline/Processor.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { createImplementation } from "~/base/index.ts";
import { Processor } from "~/domain/pipeline/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";

interface TestRecord {
    id: string;
}

interface TestContext {
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
        return {
            record,
            emit: (cmd: string) => {
                this.shardState.push(cmd);
            }
        };
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

    it("exposes accumulated shard state", async () => {
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
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `yarn test __tests__/domain/pipeline/Processor.test.ts`
Expected: FAIL — `Processor` not exported.

- [ ] **Step 3: Implement `Processor` abstraction**

Create `src/domain/pipeline/abstractions/Processor.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";

interface IProcessor<TRecord = unknown, TContext = unknown> {
    execute(commands: Commands): Promise<void>;
    getShardState(): unknown;
    createContext(record: TRecord): TContext;
}

export const Processor = createAbstraction<IProcessor>("Core/Processor");

export namespace Processor {
    export type Interface<TRecord = unknown, TContext = unknown> = IProcessor<
        TRecord,
        TContext
    >;
}
```

- [ ] **Step 4: Wire barrels**

Modify `src/domain/pipeline/abstractions/index.ts`:

```typescript
export { Scanner } from "./Scanner.ts";
export { Processor } from "./Processor.ts";
```

Modify `src/domain/pipeline/index.ts`:

```typescript
export { createFilter, type Filter } from "./Filter.ts";
export { Scanner, Processor } from "./abstractions/index.ts";
```

- [ ] **Step 5: Run tests**

Run: `yarn test __tests__/domain/pipeline/Processor.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/abstractions/Processor.ts \
        src/domain/pipeline/abstractions/index.ts \
        src/domain/pipeline/index.ts \
        __tests__/domain/pipeline/Processor.test.ts
git commit -m "feat: add Processor abstraction for pipeline command execution"
```

---

## Task 4: `Hook` abstraction

**Files:**
- Create: `src/domain/pipeline/abstractions/Hook.ts`
- Modify: `src/domain/pipeline/abstractions/index.ts`
- Modify: `src/domain/pipeline/index.ts`
- Test: `__tests__/domain/pipeline/Hook.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/pipeline/Hook.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { Hook } from "~/domain/pipeline/index.ts";

class FakeHook implements Hook.Interface {
    public readonly calls: Array<{ runId: string; mergeGroupId: string }> = [];

    public async run(params: { runId: string; mergeGroupId: string }): Promise<void> {
        this.calls.push(params);
    }
}

const TestHook = Hook.createImplementation({
    implementation: FakeHook,
    dependencies: []
});

describe("Hook abstraction", () => {
    it("is registrable and resolvable via the DI container", () => {
        const container = new Container();
        container.register(TestHook).inSingletonScope();
        const hook = container.resolve(Hook);
        expect(hook).toBeInstanceOf(FakeHook);
    });

    it("receives runId and mergeGroupId when run is invoked", async () => {
        const container = new Container();
        container.register(TestHook).inSingletonScope();
        const hook = container.resolve(Hook) as FakeHook;

        await hook.run({ runId: "run-1", mergeGroupId: "ddb-group" });
        await hook.run({ runId: "run-1", mergeGroupId: "os-group" });

        expect(hook.calls).toHaveLength(2);
        expect(hook.calls[0]).toEqual({ runId: "run-1", mergeGroupId: "ddb-group" });
        expect(hook.calls[1]).toEqual({ runId: "run-1", mergeGroupId: "os-group" });
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `yarn test __tests__/domain/pipeline/Hook.test.ts`
Expected: FAIL — `Hook` not exported.

- [ ] **Step 3: Implement `Hook` abstraction**

Create `src/domain/pipeline/abstractions/Hook.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";

interface IHookRunParams {
    runId: string;
    mergeGroupId: string;
}

interface IHook {
    run(params: IHookRunParams): Promise<void>;
}

export const Hook = createAbstraction<IHook>("Core/Hook");

export namespace Hook {
    export type Interface = IHook;
    export type RunParams = IHookRunParams;
}
```

- [ ] **Step 4: Wire barrels**

Modify `src/domain/pipeline/abstractions/index.ts`:

```typescript
export { Scanner } from "./Scanner.ts";
export { Processor } from "./Processor.ts";
export { Hook } from "./Hook.ts";
```

Modify `src/domain/pipeline/index.ts`:

```typescript
export { createFilter, type Filter } from "./Filter.ts";
export { Scanner, Processor, Hook } from "./abstractions/index.ts";
```

- [ ] **Step 5: Run tests**

Run: `yarn test __tests__/domain/pipeline/Hook.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/abstractions/Hook.ts \
        src/domain/pipeline/abstractions/index.ts \
        src/domain/pipeline/index.ts \
        __tests__/domain/pipeline/Hook.test.ts
git commit -m "feat: add Hook abstraction for pipeline before/after lifecycle"
```

---

## Task 5: Shared test fixtures

Shared fakes and types used by Pipeline + PipelineBuilder tests.

**Files:**
- Create: `__tests__/domain/pipeline/fixtures/types.ts`
- Create: `__tests__/domain/pipeline/fixtures/fakes.ts`

- [ ] **Step 1: Create shared types**

Create `__tests__/domain/pipeline/fixtures/types.ts`:

```typescript
import type { Commands } from "~/domain/transform/commands/Commands.ts";

export interface FakeRecord {
    id: string;
    type: string;
    payload?: Record<string, unknown>;
}

export interface FakeShard {
    from: number;
    to: number;
}

export interface FakeContext {
    record: FakeRecord;
    emitted: string[];
    emit(value: string): void;
    commands: Commands;
}
```

- [ ] **Step 2: Create fake DI implementations**

Create `__tests__/domain/pipeline/fixtures/fakes.ts`:

```typescript
import { Container } from "@webiny/di";
import { createAbstraction } from "~/base/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { Scanner, Processor, Hook } from "~/domain/pipeline/index.ts";
import type { FakeRecord, FakeShard, FakeContext } from "./types.ts";

export class FakeScanner implements Scanner.Interface<FakeRecord, FakeShard> {
    public records: FakeRecord[] = [];

    public async listShards(): Promise<FakeShard[]> {
        return [{ from: 0, to: this.records.length }];
    }

    public async *scan(shard: FakeShard): AsyncIterable<FakeRecord> {
        for (let i = shard.from; i < shard.to; i++) {
            yield this.records[i]!;
        }
    }
}

export const FakeScannerImpl = Scanner.createImplementation({
    implementation: FakeScanner,
    dependencies: []
});

export class FakeProcessor implements Processor.Interface<FakeRecord, FakeContext> {
    public executed: Commands[] = [];

    public async execute(commands: Commands): Promise<void> {
        this.executed.push(commands);
    }

    public getShardState(): { count: number } {
        return { count: this.executed.length };
    }

    public createContext(record: FakeRecord): FakeContext {
        const ctx: FakeContext = {
            record,
            emitted: [],
            commands: new Commands(),
            emit(value: string): void {
                ctx.emitted.push(value);
            }
        };
        return ctx;
    }
}

export const FakeProcessorImpl = Processor.createImplementation({
    implementation: FakeProcessor,
    dependencies: []
});

export class FakeHookA implements Hook.Interface {
    public calls: Array<{ runId: string; mergeGroupId: string }> = [];
    public async run(params: { runId: string; mergeGroupId: string }): Promise<void> {
        this.calls.push(params);
    }
}

export const FakeHookAImpl = Hook.createImplementation({
    implementation: FakeHookA,
    dependencies: []
});

export class FakeHookB implements Hook.Interface {
    public calls: Array<{ runId: string; mergeGroupId: string }> = [];
    public async run(params: { runId: string; mergeGroupId: string }): Promise<void> {
        this.calls.push(params);
    }
}

export const FakeHookBImpl = Hook.createImplementation({
    implementation: FakeHookB,
    dependencies: []
});

// A distinct Transformer abstraction for tests — isolated from src/domain/transform/Transformer.ts
// so we can register fakes without reaching into production abstractions.
interface IFakeTransformer {
    transform(ctx: FakeContext): void | Promise<void>;
}

export const FakeTransformer = createAbstraction<IFakeTransformer>("Test/FakeTransformer");
export namespace FakeTransformer {
    export type Interface = IFakeTransformer;
}

export class TagTransformer implements IFakeTransformer {
    public constructor(private readonly tag: string = "TAG") {}
    public transform(ctx: FakeContext): void {
        ctx.emit(`${this.tag}:${ctx.record.id}`);
    }
}

export const TagTransformerImpl = FakeTransformer.createImplementation({
    implementation: TagTransformer,
    dependencies: []
});

export class UppercaseTransformer implements IFakeTransformer {
    public transform(ctx: FakeContext): void {
        ctx.record.type = ctx.record.type.toUpperCase();
    }
}

export const UppercaseTransformerImpl = FakeTransformer.createImplementation({
    implementation: UppercaseTransformer,
    dependencies: []
});

export function registerFakes(container: Container): void {
    container.register(FakeScannerImpl).inSingletonScope();
    container.register(FakeProcessorImpl).inSingletonScope();
}
```

- [ ] **Step 3: Commit fixtures**

No tests to run yet — these are purely fixtures. Type-check verifies correctness.

```bash
yarn format:fix
yarn ts-check
git add __tests__/domain/pipeline/fixtures/types.ts \
        __tests__/domain/pipeline/fixtures/fakes.ts
git commit -m "test: add shared fixtures for pipeline tests"
```

---

## Task 6: `Pipeline` class — construction + token getters

**Files:**
- Create: `src/domain/pipeline/Pipeline.ts`
- Modify: `src/domain/pipeline/index.ts`
- Test: `__tests__/domain/pipeline/Pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/pipeline/Pipeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import {
    Pipeline,
    Scanner,
    Processor,
    createFilter
} from "~/domain/pipeline/index.ts";
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
            scanner: Scanner,
            processor: Processor,
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
            scanner: Scanner,
            processor: Processor,
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
            scanner: Scanner,
            processor: Processor,
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
        const filter = createFilter<FakeRecord>((r) => r.type === "foo");
        const config: PipelineConfig<FakeRecord, FakeContext, FakeShard> = {
            name: "filtered",
            scanner: Scanner,
            processor: Processor,
            filters: [filter],
            transformers: [],
            beforeHooks: [],
            afterHooks: []
        };
        const pipeline = new Pipeline(config, container);

        expect(pipeline.hasFilter).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `yarn test __tests__/domain/pipeline/Pipeline.test.ts`
Expected: FAIL — `Pipeline` and `PipelineConfig` not defined.

- [ ] **Step 3: Implement the `Pipeline` class**

Create `src/domain/pipeline/Pipeline.ts`:

```typescript
import type { Abstraction, Container } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Filter } from "./Filter.ts";

export interface PipelineConfig<TRecord, TContext, TShard> {
    readonly name: string;
    readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    readonly processor: Abstraction<Processor.Interface<TRecord, TContext>>;
    readonly filters: readonly Filter<TRecord>[];
    readonly transformers: readonly Abstraction<unknown>[];
    readonly beforeHooks: readonly Abstraction<Hook.Interface>[];
    readonly afterHooks: readonly Abstraction<Hook.Interface>[];
}

export class Pipeline<TRecord = unknown, TContext = unknown, TShard = unknown> {
    public constructor(
        private readonly config: PipelineConfig<TRecord, TContext, TShard>,
        private readonly container: Container
    ) {
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

    public get hasFilter(): boolean {
        return this.config.filters.length > 0;
    }

    protected getContainer(): Container {
        return this.container;
    }

    protected getFilters(): readonly Filter<TRecord>[] {
        return this.config.filters;
    }

    protected getTransformerTokens(): readonly Abstraction<unknown>[] {
        return this.config.transformers;
    }
}
```

- [ ] **Step 4: Export `Pipeline` from barrel**

Modify `src/domain/pipeline/index.ts`:

```typescript
export { createFilter, type Filter } from "./Filter.ts";
export { Scanner, Processor, Hook } from "./abstractions/index.ts";
export { Pipeline, type PipelineConfig } from "./Pipeline.ts";
```

- [ ] **Step 5: Run tests**

Run: `yarn test __tests__/domain/pipeline/Pipeline.test.ts`
Expected: PASS (4/4).

- [ ] **Step 6: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/Pipeline.ts src/domain/pipeline/index.ts \
        __tests__/domain/pipeline/Pipeline.test.ts
git commit -m "feat: add Pipeline class with token getters and filter presence"
```

---

## Task 7: `Pipeline.accepts()` — filter evaluation

**Files:**
- Modify: `src/domain/pipeline/Pipeline.ts` (add `accepts` method)
- Modify: `__tests__/domain/pipeline/Pipeline.test.ts` (add tests)

- [ ] **Step 1: Add failing tests**

Append to `__tests__/domain/pipeline/Pipeline.test.ts` inside the `describe("Pipeline — ...")` — add a new `describe` block:

```typescript
describe("Pipeline.accepts()", () => {
    it("returns true when no filters are present", () => {
        const container = makeContainer();
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            {
                name: "p",
                scanner: Scanner,
                processor: Processor,
                filters: [],
                transformers: [],
                beforeHooks: [],
                afterHooks: []
            },
            container
        );
        expect(pipeline.accepts({ id: "x", type: "foo" })).toBe(true);
    });

    it("returns true only when every filter passes", () => {
        const container = makeContainer();
        const isFoo = createFilter<FakeRecord>((r) => r.type === "foo");
        const notDeleted = createFilter<FakeRecord>(
            (r) => r.payload?.deleted !== true
        );
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            {
                name: "p",
                scanner: Scanner,
                processor: Processor,
                filters: [isFoo, notDeleted],
                transformers: [],
                beforeHooks: [],
                afterHooks: []
            },
            container
        );

        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
        expect(
            pipeline.accepts({ id: "c", type: "foo", payload: { deleted: true } })
        ).toBe(false);
    });

    it("short-circuits on first failing filter", () => {
        const container = makeContainer();
        const calls: string[] = [];
        const first = createFilter<FakeRecord>((r) => {
            calls.push(`first:${r.id}`);
            return false;
        });
        const second = createFilter<FakeRecord>((r) => {
            calls.push(`second:${r.id}`);
            return true;
        });
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            {
                name: "p",
                scanner: Scanner,
                processor: Processor,
                filters: [first, second],
                transformers: [],
                beforeHooks: [],
                afterHooks: []
            },
            container
        );

        expect(pipeline.accepts({ id: "r1", type: "x" })).toBe(false);
        expect(calls).toEqual(["first:r1"]);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `yarn test __tests__/domain/pipeline/Pipeline.test.ts`
Expected: FAIL — `pipeline.accepts` is not a function.

- [ ] **Step 3: Add `accepts` method**

In `src/domain/pipeline/Pipeline.ts`, add the public method under the existing getters:

```typescript
    public accepts(record: TRecord): boolean {
        for (const filter of this.config.filters) {
            if (!filter.check(record)) {
                return false;
            }
        }
        return true;
    }
```

- [ ] **Step 4: Run tests**

Run: `yarn test __tests__/domain/pipeline/Pipeline.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/Pipeline.ts \
        __tests__/domain/pipeline/Pipeline.test.ts
git commit -m "feat: Pipeline.accepts evaluates filters with short-circuit"
```

---

## Task 8: `Pipeline.run()` — transformer execution

**Files:**
- Modify: `src/domain/pipeline/Pipeline.ts`
- Modify: `__tests__/domain/pipeline/Pipeline.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/domain/pipeline/Pipeline.test.ts`:

```typescript
describe("Pipeline.run()", () => {
    it("runs registered transformers in order against the given context", async () => {
        const container = makeContainer();
        // FakeTransformer's default registration in makeContainer is TagTransformer (emits "TAG:${id}").
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            {
                name: "run-test",
                scanner: Scanner,
                processor: Processor,
                filters: [],
                transformers: [FakeTransformer],
                beforeHooks: [],
                afterHooks: []
            },
            container
        );

        const processor = container.resolve(Processor) as any;
        const ctx = processor.createContext({ id: "r1", type: "foo" }) as FakeContext;
        await pipeline.run(ctx);

        expect(ctx.emitted).toEqual(["TAG:r1"]);
    });

    it("runs zero transformers without error", async () => {
        const container = makeContainer();
        const pipeline = new Pipeline<FakeRecord, FakeContext, FakeShard>(
            {
                name: "no-transformers",
                scanner: Scanner,
                processor: Processor,
                filters: [],
                transformers: [],
                beforeHooks: [],
                afterHooks: []
            },
            container
        );

        const processor = container.resolve(Processor) as any;
        const ctx = processor.createContext({ id: "r1", type: "foo" }) as FakeContext;

        await expect(pipeline.run(ctx)).resolves.toBeUndefined();
        expect(ctx.emitted).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `yarn test __tests__/domain/pipeline/Pipeline.test.ts`
Expected: FAIL — `pipeline.run` is not a function.

- [ ] **Step 3: Implement `run()` in `Pipeline.ts`**

Add to `src/domain/pipeline/Pipeline.ts`:

```typescript
    public async run(ctx: TContext): Promise<void> {
        for (const token of this.config.transformers) {
            const transformer = this.container.resolve(
                token as Abstraction<{ transform(ctx: TContext): void | Promise<void> }>
            );
            await transformer.transform(ctx);
        }
    }
```

The transformer interface is structural (`transform(ctx)`); tests use the `FakeTransformer` abstraction wrapping classes that implement that shape. A later plan defines the production `Transformer` abstraction; this generic `run()` accepts anything with a `.transform(ctx)` method, keeping the `Pipeline` class decoupled from the specific Transformer shape.

- [ ] **Step 4: Run tests**

Run: `yarn test __tests__/domain/pipeline/Pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/Pipeline.ts \
        __tests__/domain/pipeline/Pipeline.test.ts
git commit -m "feat: Pipeline.run executes transformers sequentially"
```

---

## Task 9: `PipelineBuilder` — minimal construction + `.build()`

**Files:**
- Create: `src/domain/pipeline/PipelineBuilder.ts`
- Modify: `src/domain/pipeline/index.ts`
- Test: `__tests__/domain/pipeline/PipelineBuilder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/domain/pipeline/PipelineBuilder.test.ts` (imports cover all tasks in this file — 9 through 12):

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
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
    it("produces a Pipeline with the configured name and tokens", () => {
        const container = makeContainer();
        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "basic",
            scanner: Scanner,
            processor: Processor,
            container
        }).build();

        expect(pipeline).toBeInstanceOf(Pipeline);
        expect(pipeline.name).toBe("basic");
        expect(pipeline.scannerToken).toBe(Scanner);
        expect(pipeline.processorToken).toBe(Processor);
        expect(pipeline.beforeHookTokens).toEqual([]);
        expect(pipeline.afterHookTokens).toEqual([]);
        expect(pipeline.hasFilter).toBe(false);
    });

    it("throws when name is empty", () => {
        const container = makeContainer();
        expect(
            () =>
                new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
                    name: "",
                    scanner: Scanner,
                    processor: Processor,
                    container
                })
        ).toThrow(/name/i);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts`
Expected: FAIL — `PipelineBuilder` not exported.

- [ ] **Step 3: Implement `PipelineBuilder`**

Create `src/domain/pipeline/PipelineBuilder.ts`:

```typescript
import type { Abstraction, Container } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { Hook } from "./abstractions/Hook.ts";
import type { Filter } from "./Filter.ts";
import { Pipeline, type PipelineConfig } from "./Pipeline.ts";

export interface PipelineBuilderConfig<TRecord, TContext, TShard> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processor: Abstraction<Processor.Interface<TRecord, TContext>>;
    container: Container;
}

export class PipelineBuilder<TRecord = unknown, TContext = unknown, TShard = unknown> {
    private readonly name: string;
    private readonly scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    private readonly processor: Abstraction<Processor.Interface<TRecord, TContext>>;
    private readonly container: Container;

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
        this.container = config.container;
    }

    public build(): Pipeline<TRecord, TContext, TShard> {
        const pipelineConfig: PipelineConfig<TRecord, TContext, TShard> = {
            name: this.name,
            scanner: this.scanner,
            processor: this.processor,
            filters: [...this.filters],
            transformers: [...this.transformers],
            beforeHooks: [...this.beforeHooks],
            afterHooks: [...this.afterHooks]
        };
        return new Pipeline(pipelineConfig, this.container);
    }
}
```

- [ ] **Step 4: Export `PipelineBuilder`**

Modify `src/domain/pipeline/index.ts`:

```typescript
export { createFilter, type Filter } from "./Filter.ts";
export { Scanner, Processor, Hook } from "./abstractions/index.ts";
export { Pipeline, type PipelineConfig } from "./Pipeline.ts";
export { PipelineBuilder, type PipelineBuilderConfig } from "./PipelineBuilder.ts";
```

- [ ] **Step 5: Run tests**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/PipelineBuilder.ts src/domain/pipeline/index.ts \
        __tests__/domain/pipeline/PipelineBuilder.test.ts
git commit -m "feat: add PipelineBuilder with name validation and build()"
```

---

## Task 10: `PipelineBuilder.filter()` — single-call enforcement, single/array input

**Files:**
- Modify: `src/domain/pipeline/PipelineBuilder.ts`
- Modify: `__tests__/domain/pipeline/PipelineBuilder.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/domain/pipeline/PipelineBuilder.test.ts` (imports already include `createFilter` from Task 9):

```typescript
describe("PipelineBuilder.filter()", () => {
    it("accepts a single Filter and stores it on the pipeline", () => {
        const container = makeContainer();
        const isFoo = createFilter<FakeRecord>((r) => r.type === "foo");

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "single-filter",
            scanner: Scanner,
            processor: Processor,
            container
        })
            .filter(isFoo)
            .build();

        expect(pipeline.hasFilter).toBe(true);
        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
    });

    it("accepts an array of Filters and AND-combines them in order", () => {
        const container = makeContainer();
        const isFoo = createFilter<FakeRecord>((r) => r.type === "foo");
        const notDeleted = createFilter<FakeRecord>(
            (r) => r.payload?.deleted !== true
        );

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "array-filter",
            scanner: Scanner,
            processor: Processor,
            container
        })
            .filter([isFoo, notDeleted])
            .build();

        expect(pipeline.accepts({ id: "a", type: "foo" })).toBe(true);
        expect(pipeline.accepts({ id: "b", type: "bar" })).toBe(false);
        expect(
            pipeline.accepts({ id: "c", type: "foo", payload: { deleted: true } })
        ).toBe(false);
    });

    it("throws when .filter() is called a second time on the same builder", () => {
        const container = makeContainer();
        const isFoo = createFilter<FakeRecord>((r) => r.type === "foo");
        const isBar = createFilter<FakeRecord>((r) => r.type === "bar");

        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "double-filter",
            scanner: Scanner,
            processor: Processor,
            container
        }).filter(isFoo);

        expect(() => builder.filter(isBar)).toThrow(/\.filter\(\).*already called/i);
    });

    it("throws when .filter() receives an empty array", () => {
        const container = makeContainer();
        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "empty-array",
            scanner: Scanner,
            processor: Processor,
            container
        });

        expect(() => builder.filter([])).toThrow(/empty/i);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts`
Expected: FAIL — `.filter` not defined on builder.

- [ ] **Step 3: Add `.filter()` to `PipelineBuilder`**

Add to `src/domain/pipeline/PipelineBuilder.ts`, inside the `PipelineBuilder` class:

```typescript
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
```

- [ ] **Step 4: Run tests**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/PipelineBuilder.ts \
        __tests__/domain/pipeline/PipelineBuilder.test.ts
git commit -m "feat: PipelineBuilder.filter enforces single call, accepts arrays"
```

---

## Task 11: `PipelineBuilder.use()` — transformer token chain

**Files:**
- Modify: `src/domain/pipeline/PipelineBuilder.ts`
- Modify: `__tests__/domain/pipeline/PipelineBuilder.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/domain/pipeline/PipelineBuilder.test.ts`:

```typescript
describe("PipelineBuilder.use()", () => {
    it("chains the same transformer token twice — run() invokes it twice in order", async () => {
        const container = makeContainer();
        // makeContainer registered TagTransformerImpl on the FakeTransformer abstraction
        // (singleton — one instance). Using the token twice means Pipeline.run will
        // resolve that same instance twice and invoke transform() twice, each call
        // pushing onto the context's emitted array.

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "with-transformers",
            scanner: Scanner,
            processor: Processor,
            container
        })
            .use(FakeTransformer)
            .use(FakeTransformer)
            .build();

        const processor = container.resolve(Processor) as any;
        const ctx = processor.createContext({ id: "r1", type: "foo" }) as FakeContext;
        await pipeline.run(ctx);

        expect(ctx.emitted).toEqual(["TAG:r1", "TAG:r1"]);
    });

    it("returns the builder for chaining", () => {
        const container = makeContainer();
        const builder = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "chain",
            scanner: Scanner,
            processor: Processor,
            container
        });
        expect(builder.use(FakeTransformer)).toBe(builder);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts`
Expected: FAIL — `.use` not defined.

- [ ] **Step 3: Add `.use()` to `PipelineBuilder`**

Add to `src/domain/pipeline/PipelineBuilder.ts`:

```typescript
    public use(token: Abstraction<unknown>): this {
        this.transformers.push(token);
        return this;
    }
```

- [ ] **Step 4: Run tests**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/PipelineBuilder.ts \
        __tests__/domain/pipeline/PipelineBuilder.test.ts
git commit -m "feat: PipelineBuilder.use chains transformer tokens in order"
```

---

## Task 12: `PipelineBuilder.beforeExecuteCommands()` / `.afterExecuteCommands()`

**Files:**
- Modify: `src/domain/pipeline/PipelineBuilder.ts`
- Modify: `__tests__/domain/pipeline/PipelineBuilder.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/domain/pipeline/PipelineBuilder.test.ts` (imports already include `Hook` from Task 9):

```typescript
describe("PipelineBuilder — hook registration", () => {
    it("registers before-hooks in declaration order", () => {
        const container = makeContainer();
        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "before-hooks",
            scanner: Scanner,
            processor: Processor,
            container
        })
            .beforeExecuteCommands(Hook)
            .beforeExecuteCommands(Hook)
            .build();

        expect(pipeline.beforeHookTokens).toHaveLength(2);
        expect(pipeline.beforeHookTokens[0]).toBe(Hook);
        expect(pipeline.beforeHookTokens[1]).toBe(Hook);
    });

    it("registers after-hooks in declaration order", () => {
        const container = makeContainer();
        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "after-hooks",
            scanner: Scanner,
            processor: Processor,
            container
        })
            .afterExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.afterHookTokens).toHaveLength(2);
    });

    it("keeps before and after hook lists independent", () => {
        const container = makeContainer();
        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "mixed-hooks",
            scanner: Scanner,
            processor: Processor,
            container
        })
            .beforeExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .afterExecuteCommands(Hook)
            .build();

        expect(pipeline.beforeHookTokens).toHaveLength(1);
        expect(pipeline.afterHookTokens).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Add hook methods to `PipelineBuilder`**

Add to `src/domain/pipeline/PipelineBuilder.ts`:

```typescript
    public beforeExecuteCommands(token: Abstraction<Hook.Interface>): this {
        this.beforeHooks.push(token);
        return this;
    }

    public afterExecuteCommands(token: Abstraction<Hook.Interface>): this {
        this.afterHooks.push(token);
        return this;
    }
```

- [ ] **Step 4: Run tests**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/PipelineBuilder.ts \
        __tests__/domain/pipeline/PipelineBuilder.test.ts
git commit -m "feat: PipelineBuilder hooks for before/after execute commands"
```

---

## Task 13: Integration smoke test — full builder → Pipeline → accepts + run

**Files:**
- Create: `__tests__/domain/pipeline/PipelineBuilder.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `__tests__/domain/pipeline/PipelineBuilder.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
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

        const isFoo = createFilter<FakeRecord>((r) => r.type === "foo");

        const pipeline = new PipelineBuilder<FakeRecord, FakeContext, FakeShard>({
            name: "integration",
            scanner: Scanner,
            processor: Processor,
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
```

- [ ] **Step 2: Run the test**

Run: `yarn test __tests__/domain/pipeline/PipelineBuilder.integration.test.ts`
Expected: PASS — the whole builder flow wires up.

- [ ] **Step 3: Run the complete test suite**

Run: `yarn test`
Expected: ALL PASS — no existing tests regressed.

- [ ] **Step 4: Run full verification**

```bash
yarn format:fix
yarn ts-check
yarn test:coverage
```
Expected: all green; coverage on new files is high (branches exercised: filter short-circuit, empty-array guard, double-filter guard, build with/without hooks).

- [ ] **Step 5: Commit**

```bash
git add __tests__/domain/pipeline/PipelineBuilder.integration.test.ts
git commit -m "test: end-to-end PipelineBuilder integration smoke test"
```

---

## Task 14: Completion summary

- [ ] **Verify final state:**

```bash
yarn format:fix
yarn ts-check
yarn test
git log --oneline -14
```

Expected:
- All code formatted.
- TypeScript clean.
- All tests pass.
- 12–13 focused commits, one per task.

The public surface exported from `~/domain/pipeline/index.ts` after this plan:

- `createFilter<TRecord>(fn)` → `Filter<TRecord>`
- `Filter<TRecord>` type
- `Scanner` abstraction + `Scanner.Interface<TRecord, TShard>`
- `Processor` abstraction + `Processor.Interface<TRecord, TContext>`
- `Hook` abstraction + `Hook.Interface` + `Hook.RunParams`
- `Pipeline<TRecord, TContext, TShard>` class
- `PipelineConfig<...>` type
- `PipelineBuilder<...>` class
- `PipelineBuilderConfig<...>` type

**Not wired up yet:**
- `PipelineRunner.pipeline()` factory — user still calls `new PipelineBuilder(...)` with an explicit container until the runner plan lands.
- No real `DdbScanner` / `OsScanner` / `DdbProcessor` / `OsProcessor` implementations.
- No preset uses this new API yet — existing presets continue to use `src/domain/transform/PipelineBuilder.ts` (old) until a later migration plan.

**Next plans to write (NOT this plan):**

1. `PipelineRunner` integration: add `runner.pipeline()` factory, rewrite `register()` with merge-group grouping, uniqueness + filter-presence validation, token-symbol-based `mergeGroupId`.
2. Concrete Scanner + Processor implementations: `DdbScanner`, `OsScanner`, `DdbProcessor`, `OsProcessor`, wiring them into the existing `bootstrap.ts`.
3. Worker framework unification: collapse `processSegment` / `processOsSegment` into a single handler that reads the registered merge groups from the runner and dispatches shards generically.
4. Preset migration pilot: convert `v5-to-v6-ddb` to the new API using the factory.
