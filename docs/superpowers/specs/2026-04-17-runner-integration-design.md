# Runner Integration & DDB Implementations — Design

**Status:** Approved spec / pending implementation plan
**Date:** 2026-04-17
**Implements:** locked decisions in `docs/design/generic-pipeline-framework.md` → "Resolved design decisions" + 2026-04-17 revision note (scanner-only merge key, all-matches semantics, mandatory filters).
**Builds on:** `docs/superpowers/plans/2026-04-17-pipeline-builder.md` (delivered: `Filter`, `Scanner`/`Processor`/`Hook` abstractions, `Pipeline`, `PipelineBuilder`).

---

## Goal

Make the `src/domain/pipeline/` primitives runnable end-to-end. Replace `PipelineRunner` so it uses the new `Pipeline` type, exposes a `runner.pipeline(...)` factory, groups pipelines by scanner token, and runs them in-process. Build real `DdbScanner` + `DdbProcessor` so a DDB-only preset can execute against a `MockDynamoDbClient` test container. Hooks and worker spawning are explicitly deferred.

---

## Scope

### In scope

- Rewrite `PipelineRunner` around the new `Pipeline` type. Old `register(TransformPipeline)` / `processRecord(record)` / `processAll(records)` methods deleted.
- New `runner.pipeline(config)` factory returning a typed `PipelineBuilder`.
- New `runner.register(pipeline)` accepting only the new `Pipeline`. Validates pipeline-name uniqueness; logs hook tokens at debug level (collected, not invoked).
- New `runner.run()` for in-process end-to-end execution.
- **Tighten `Processor.Interface` generic constraint** — `TContext extends { readonly commands: Commands }`. Minimal constraint that lets the runner safely extract commands from a transformer's context without coupling Processor to the full `BaseTransformContext.Interface` shape. `BaseTransformContext.Interface` (production) and `FakeContext` (tests) both have `commands`, so they satisfy it. A wider constraint to `BaseTransformContext.Interface<TRecord>` is a separate refactor about standardizing all contexts on shared services (`modelProvider`, `cache`, etc.) — out of scope here, deferred.
- Refactor `Pipeline` to drop its container reference and remove `Pipeline.run()`. Pipeline becomes pure config + `accepts(record)`. Add public `transformerTokens` getter for the runner to consume.
- Refactor `PipelineBuilder` to drop the `container` field from its config. The runner is the only thing that ever holds a container reference.
- Build `DdbScanner` (wraps `SourceDynamoDbClient.scan` + `MigrationConfig.pipeline.segments`).
- Build `DdbProcessor` (wraps `DdbCommandExecutor.execute` + `DdbTransformContextFactory.create`).
- Add `ContainerToken` abstraction at `src/base/`. One-line `bootstrap.ts` registration so `PipelineRunner` can inject it.
- Update test fixtures: `FakeContext` already has `commands: Commands` so the minimal `{ readonly commands: Commands }` constraint passes; no shape change needed in `__tests__/domain/pipeline/fixtures/types.ts` or `fakes.ts`.

### Out of scope (deferred to future plans)

- **Hook lifecycle** — before/after invocation with token-level dedup at merge-group lifecycle points. Hooks are stored on `Pipeline` (already done by Tasks 6/12) but never invoked by this runner.
- **Worker spawning + shard parallelism + `.transfer/<runId>/.../<shard>.json` state files** — `processor.getShardState()` exists for future use; this plan does not call it.
- **Real OS / S3 scanners + processors** — `OsScanner`, `OsProcessor`, `S3Scanner`, `S3Processor`. They will follow the same shape as `DdbScanner` / `DdbProcessor` but require their own service wiring.
- **Preset migration** — `v5-to-v6-ddb` and other production presets keep using the now-deleted legacy API and break in this plan. They will be ported (or deleted) in a follow-up plan.
- **Configurable batching** — runner batches commands at shard boundary only. The future worker plan introduces a `BatchAccumulator` between transformers and processor with the existing `BATCH_SIZE` config.

### Accepted fallout

`__tests__/security-teams.test.ts` and any other test calling `PipelineRunner.processRecord()` / `processAll()` will break in this plan and stay broken until the cleanup plan ports or removes them. Test count drops from 372 to whatever survives.

---

## Architecture

Three new units + one bootstrap line:

| Unit | Path | Role |
| --- | --- | --- |
| `PipelineRunner` (rewritten) | `src/features/PipelineRunner/` | Factory + register + run. Owns container reference. |
| `DdbScanner` | `src/features/DdbScanner/` | `Scanner.Interface<BaseRecord, DdbShard>` over `SourceDynamoDbClient`. |
| `DdbProcessor` | `src/features/DdbProcessor/` | `Processor.Interface<BaseRecord, BaseTransformContext.Interface>` over `DdbCommandExecutor` + `DdbTransformContextFactory`. |
| `ContainerToken` | `src/base/Container.ts` | Abstraction so the container can be DI-injected. |

The runner is the only thing that holds a container; `Pipeline` and `PipelineBuilder` no longer hold one.

---

## Components

### 1. `ContainerToken`

Lives at `src/base/Container.ts`:

```typescript
import { type Container, createAbstraction } from "@webiny/di";

export const ContainerToken = createAbstraction<Container>("Core/Container");
```

`bootstrap.ts` registers the container against itself, immediately after creation:

```typescript
const container = new Container();
container.registerInstance(ContainerToken, container);
// ... rest of bootstrap registrations
```

No new feature folder. No accessor wrapper. One abstraction + one line.

### 2. `PipelineRunner` (rewritten)

#### Abstraction

```typescript
// src/features/PipelineRunner/abstractions/PipelineRunner.ts
interface IPipelineRunner {
    pipeline<TRecord, TContext, TShard>(
        config: PipelineRunnerFactoryInput<TRecord, TContext, TShard>
    ): PipelineBuilder<TRecord, TContext, TShard>;
    register(pipeline: Pipeline<unknown, unknown, unknown>): this;
    run(): Promise<void>;
}

export const PipelineRunner = createAbstraction<IPipelineRunner>("Core/PipelineRunner");

export namespace PipelineRunner {
    export type Interface = IPipelineRunner;
    export type FactoryInput<TRecord, TContext, TShard> = PipelineRunnerFactoryInput<TRecord, TContext, TShard>;
}
```

The factory-input type lives next to the abstraction:

```typescript
export interface PipelineRunnerFactoryInput<TRecord, TContext, TShard> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processor: Abstraction<Processor.Interface<TRecord, TContext>>;
}
```

#### Implementation

Internal state:

```typescript
private mergeGroups: Map<Abstraction<Scanner.Interface<unknown, unknown>>, Pipeline<unknown, unknown, unknown>[]> = new Map();
private pipelineNames: Set<string> = new Set();
```

Dependencies (`createImplementation`): `[ContainerToken, Logger]`.

Method behavior:

- **`pipeline(config)`** — returns `new PipelineBuilder({ ...config })`. The builder is a pure typed config accumulator (no container in its config anymore). Generic parameters `<TRecord, TContext, TShard>` flow from the scanner/processor token types into the returned builder.
- **`register(pipeline)`** — validates name uniqueness (throws if `pipelineNames.has(pipeline.name)`); adds the name; pushes pipeline onto its merge group (keyed by `pipeline.scannerToken` reference identity); for each token in `pipeline.beforeHookTokens` and `pipeline.afterHookTokens`, calls `this.logger.debug("hook registered but not invoked in this runner version", { hookToken: token.description, mergeGroupId, pipeline: pipeline.name })`. Returns `this`.
- **`run()`** — see "Runtime flow" below.

### 3. `Pipeline` refactor

Three changes to `src/domain/pipeline/Pipeline.ts`:

1. **Drop the container field** — `constructor(config)` only (no `container` argument). Drop the `protected getContainer()` helper.
2. **Delete `Pipeline.run()`** — runner does the resolution.
3. **Add public `transformerTokens` getter** — replaces the `protected getTransformerTokens()` helper. Symmetric with `beforeHookTokens` / `afterHookTokens`.

Also delete `protected getFilters()` — `accepts(record)` is the only consumer of filters and it stays.

`PipelineConfig` interface stays the same shape (still has `transformers`, `filters`, etc.); it just isn't paired with a container at construction.

### 4. `PipelineBuilder` refactor

Two changes to `src/domain/pipeline/PipelineBuilder.ts`:

1. **Drop `container` from `PipelineBuilderConfig`** — constructor takes only `{ name, scanner, processor }`.
2. **`build()` calls `new Pipeline(config)`** — no container argument.

### 5. `DdbScanner`

```typescript
// src/features/DdbScanner/abstractions/DdbScanner.ts
export interface DdbShard {
    segment: number;
    total: number;
}

// src/features/DdbScanner/DdbScanner.ts
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
        yield* this.source.scan({
            tableName: this.config.source.dynamodb.tableName,
            segment: shard.segment,
            total: shard.total
        });
    }
}

export const DdbScanner = Scanner.createImplementation({
    implementation: DdbScannerImpl,
    dependencies: [SourceDynamoDbClient, MigrationConfig]
});
```

The scanner is registered against `Scanner` (the generic abstraction). Future `OsScanner` / `S3Scanner` register against the same abstraction; pipelines pick the one they want by token reference.

### 6. `DdbProcessor`

```typescript
// src/features/DdbProcessor/abstractions/DdbProcessor.ts
export interface DdbShardState {
    // empty for now — DDB has no per-shard state to persist in this scope.
    // Future plan adds fields like { recordsProcessed: number } if needed.
}

// src/features/DdbProcessor/DdbProcessor.ts
class DdbProcessorImpl implements Processor.Interface<BaseRecord, BaseTransformContext.Interface> {
    public constructor(
        private readonly executor: DdbCommandExecutor.Interface,
        private readonly contextFactory: DdbTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        await this.executor.execute(commands);
    }

    public createContext(record: BaseRecord): BaseTransformContext.Interface {
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

`DdbProcessor` only resolves cleanly in DDB-mode containers (its dependencies are DDB-mode-only). OS-mode and other modes will register their own processors against the same `Processor` abstraction.

---

## Runtime flow

### `register(pipeline)`

1. **Name uniqueness** — if `this.pipelineNames.has(pipeline.name)`, throw `Error("PipelineRunner: pipeline name '<name>' already registered")`. Otherwise add to set.
2. **Merge-group bucketing** — get-or-create `this.mergeGroups.get(pipeline.scannerToken)`, push `pipeline` onto its array. Map iteration order = insertion order = first-registered-pipeline-per-group order.
3. **Hook breadcrumbs** — for each token in `pipeline.beforeHookTokens` and `pipeline.afterHookTokens`, emit `logger.debug(...)` per hook. Format: `{ hookToken: token.description, lifecycle: "before"|"after", pipeline: pipeline.name, mergeGroupId }`. No invocation, no storage beyond what's already on `Pipeline`.
4. Return `this` (chaining).

No other validation is needed at register-time. Filter-required is enforced by `PipelineBuilder.build()`. Scanner/processor type-mismatch is caught by TypeScript at the builder. There is no hook validation (hooks are silent until the hook-lifecycle plan lands).

### `run()`

```
for each (scannerToken, pipelines) in mergeGroups (insertion order):
    scanner = container.resolve(scannerToken)
    processorBuffers: Map<Processor.Interface, Commands> = new Map()
    pipelineToProcessor: Map<Pipeline, Processor.Interface> = new Map()

    // Pre-resolve processors once per pipeline (DI singletons → same instance for shared tokens)
    for each pipeline in pipelines:
        pipelineToProcessor.set(pipeline, container.resolve(pipeline.processorToken))

    shards = await scanner.listShards()

    for each shard in shards (sequential):
        // Reset buffers per shard
        processorBuffers.clear()

        for await record of scanner.scan(shard):
            matched = false
            for each pipeline in pipelines:
                if !pipeline.accepts(record): continue
                matched = true
                processor = pipelineToProcessor.get(pipeline)
                ctx = processor.createContext(record)
                for each token in pipeline.transformerTokens:
                    transformer = container.resolve(token)
                    await transformer.transform(ctx)
                buffer = processorBuffers.get(processor) ?? new Commands()
                for cmd of ctx.commands.all():
                    buffer.add(cmd)
                processorBuffers.set(processor, buffer)
            if !matched:
                logger.debug("record dropped: no matching pipeline in merge group", { mergeGroupId })

        // Shard-end flush — one execute() per processor instance
        for each (processor, buffer) in processorBuffers:
            if buffer non-empty:
                await processor.execute(buffer)
```

Key properties:

- **Merge groups run sequentially.** No parallel groups in this plan.
- **Shards run sequentially within a group.** Worker plan changes this to one process per shard.
- **Pipelines are evaluated independently per record.** A record can match multiple pipelines (all-matches semantics). Each matching pipeline runs its own transformers and emits commands into its processor's buffer.
- **Processors are resolved once per group.** DI singletons mean shared tokens → same instance. Buffers are keyed by the resolved instance, so two pipelines using the same processor token share a buffer and produce one combined `execute()` call per shard.
- **No record-id leakage in logs.** The runner logs only `mergeGroupId` on the dropped-record debug line. Scanner-side logs are the right place to surface record-shape details (PK+SK for DDB, etc.).

### Error handling

Any exception from scanner / filter / transformer / processor propagates out of `run()`. No try/catch wrapping in the runner. The orchestrator (caller of `runner.run()`) decides what to do.

This is deliberately minimal. The future worker plan introduces shard-level isolation (one process per shard, one process failure ≠ whole run failure) and retry classification (transient vs. fatal).

### `mergeGroupId` derivation

```typescript
function mergeGroupId(scannerToken: Abstraction<unknown>): string {
    return scannerToken.description.replace(/\//g, "-");
}
```

Used in debug logs in this plan. The future worker plan uses it for state-file paths (`.transfer/<runId>/<mergeGroupId>/<processorId>/<shard>.json`).

---

## Public API after this plan

`src/domain/pipeline/index.ts` — same exports as today, minus changes from the Pipeline/PipelineBuilder refactor:

```typescript
export { createFilter, type Filter } from "./Filter.ts";
export { Scanner, Processor, Hook } from "./abstractions/index.ts";
export { Pipeline, type PipelineConfig } from "./Pipeline.ts";              // no container in config
export { PipelineBuilder, type PipelineBuilderConfig } from "./PipelineBuilder.ts";  // no container in config
```

`src/features/PipelineRunner/index.ts` exports `PipelineRunner` (abstraction + namespace) and the feature registration as before. The implementation class itself is not exported.

`src/features/DdbScanner/index.ts` and `src/features/DdbProcessor/index.ts` follow the existing feature pattern (export the const that's registered against the parent `Scanner` / `Processor` abstraction, plus the feature registration function).

`src/base/Container.ts` exports `ContainerToken`.

---

## Testing strategy

Unit tests per new file:

- **`PipelineRunner` tests** at `__tests__/features/PipelineRunner/PipelineRunner.test.ts`. Use a new `__tests__/containers/createPipelineRunnerContainer.ts` helper that registers `Logger`, `ContainerToken`, `PipelineRunner`, plus the test fakes from `__tests__/domain/pipeline/fixtures/fakes.ts`. Reason for a new helper rather than reusing `createDdbContainer`: `createDdbContainer` registers the legacy preset wiring + DDB clients that the runner-only tests don't need, and would also register the now-deleted legacy `PipelineRunner` plumbing. The new helper is small (~30 lines, follows the same pattern as the existing one). Cover: factory returns typed builder; register throws on duplicate name; register groups by scanner token reference; register logs hook breadcrumbs at debug level; run() executes pipelines in registration order; run() dispatches a record to all matching pipelines; run() drops unmatched records with a debug log; run() flushes per-processor buffers at shard end; run() propagates scanner/transformer/processor exceptions.
- **`DdbScanner` tests** at `__tests__/features/DdbScanner/DdbScanner.test.ts`. Cover: `listShards()` returns `[{segment:0, total:1}]` when `pipeline.segments` is unset; returns N shards when set; `scan(shard)` calls `SourceDynamoDbClient.scan` with the right `tableName` + `segment` + `total`; yields the records the mock yields. Use `MockDynamoDbClient` from `__tests__/services/DynamoDbClient/MockDynamoDbClient.ts`.
- **`DdbProcessor` tests** at `__tests__/features/DdbProcessor/DdbProcessor.test.ts`. Cover: `execute(commands)` calls `DdbCommandExecutor.execute(commands)`; `createContext(record)` calls `DdbTransformContextFactory.create({ record })` and returns the context; `getShardState()` returns `{}`. Use mocks for executor + factory.
- **`Pipeline` test updates** at `__tests__/domain/pipeline/Pipeline.test.ts`. Delete the `Pipeline.run()` describe block. Update construction tests to drop the `container` argument. Add a small test for the new `transformerTokens` getter.
- **`PipelineBuilder` test updates** at `__tests__/domain/pipeline/PipelineBuilder.test.ts` and `PipelineBuilder.integration.test.ts`. Drop `container` from config in every `new PipelineBuilder({...})` call. Drop the integration-test's manual `pipeline.run(ctx)` call (replaced by either a runner-level integration test or removed entirely).

End-to-end integration test at `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`:

- Builds a `createDdbContainer({ sourceRecords })`-style container.
- Registers `DdbScanner`, `DdbProcessor`, a couple of test transformers.
- Uses `runner.pipeline(...)` to declare 2 pipelines on the same scanner with disjoint filters.
- Calls `runner.run()`.
- Asserts the right commands hit `MockDynamoDbClient` via the executor (use the existing target-side assertion pattern from `security-teams.test.ts` as a model).

This integration test is the proof that the merge-group routing works end-to-end against real DDB infrastructure (mocked).

---

## Implementation order (preview for the plan)

The implementation plan will sequence the work roughly as:

1. `ContainerToken` + bootstrap line.
2. Tighten `Processor.Interface<TRecord, TContext extends { readonly commands: Commands }>` constraint. Update Processor abstraction + the existing `Processor.test.ts` `TestContext` (add `commands: Commands` field). `FakeContext` already satisfies the constraint — no change needed.
3. Refactor `Pipeline` (drop container, delete `run()`, expose `transformerTokens`). Update Pipeline tests.
4. Refactor `PipelineBuilder` (drop container from config). Update PipelineBuilder tests + integration test.
5. Rewrite `PipelineRunner` (factory + register + run). Add tests + new `createPipelineRunnerContainer` helper.
6. Build `DdbScanner` + tests.
7. Build `DdbProcessor` + tests.
8. End-to-end integration test.
9. Delete legacy `processRecord` / `processAll` references in `bootstrap.ts` if any. (Caller side: `processSegment` worker still uses them — it will break here and will be ported in the worker plan.)

Each step is one commit per the project convention.

---

## Future plans this enables

1. **Hook lifecycle** — implement `runner.run()` invocation of before-hooks (dedup'd by token, sequential, per merge group at start) and after-hooks (sequential reverse-order at end, skipped on failure). Read merge-group state from `processor.getShardState()`. Independent from this plan; runs against the now-stable runtime loop.
2. **Worker integration** — extract the per-shard inner loop into a worker-callable method (`runner.runShard(mergeGroupId, shard)`); orchestrator spawns workers via `WorkerSpawner`; workers serialize `processor.getShardState()` to `.transfer/<runId>/<mergeGroupId>/<processorId>/<shard>.json`; orchestrator reads those files for after-hooks.
3. **OS / S3 implementations** — `OsScanner` + `OsProcessor` + `S3Scanner` + `S3Processor` following the same shape as `DdbScanner` + `DdbProcessor`. Throws on construction if their config slice is unset (`OsClientConfig` / `S3ClientConfig`).
4. **Preset migration + legacy cleanup** — port `v5-to-v6-ddb` and other production presets to the new `runner.pipeline(...).filter(...).use(...).build()` API. Port or delete legacy tests still referencing `processRecord`. Delete `src/domain/transform/Pipeline.ts` and `PipelineBuilder.ts` (the old data-transfer-side pipeline classes).
