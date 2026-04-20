# Slice-Merging Processors — Design

**Date:** 2026-04-20
**Author:** Bruno Zorić (design), Claude (drafting)

## Goal

Split today's god-processors (`DdbProcessor` handles both DDB writes AND S3 copies; `OsProcessor` is the OS equivalent) into single-responsibility per-command-type processors. Pipelines compose them via a `processors: [...]` array. The transform context that filters and transformers see is composed at runtime by merging each processor's "slice" of helpers onto a shared base context. Slice-key collisions throw — that's the implicit "two processors of the same type cannot coexist in a pipeline" rule.

## Motivation

The previous refactor (per-command executors) split the WRITE concern but kept `DdbProcessor` as a god-orchestrator (handles `PutRecord` + `S3Copy`). That left a naming smell: the processor's name implies a single target system, but it actually drains two. Adding a new command type still requires editing this orchestrator.

Bruno's recurring concern: "im still bothered by the fact that DdbProcessor is handling file transfers." The deferred discussion lands now.

What this design fixes:

- **One concern per processor.** `DdbProcessor` writes records to DDB; `S3Processor` copies S3 objects; `OsProcessor` writes records to the OS DDB table (with gzip + ensureIndex preamble). Each has its own slice of context helpers (e.g., `S3Processor` contributes `copyFile`/`getFile`; `DdbProcessor` contributes `putRecord`).
- **Per-pipeline opt-in.** A settings-only pipeline that never touches files just lists `processors: [DdbProcessor]`. No S3 copy code path runs. Today every DDB pipeline pays for `S3CopyExecutor` registration even if it never emits an S3 command.
- **Adding a new command type = new processor file + add to relevant pipelines.** No edits to existing processors.
- **Mutually-exclusive types are caught structurally.** `DdbProcessor` and `OsProcessor` both contribute `putRecord` to the slice. Putting them both in one pipeline collides at registration → throw. No new `Role` enum needed.

## End shape

```typescript
import type { MigrationPreset } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor, S3Processor, createFilter } from "@webiny/data-transfer";

export const filesPreset: MigrationPreset = {
    name: "Files",
    description: "Copy file-manager records + the underlying S3 objects.",
    configure(runner) {
        const filePipeline = runner
            .pipeline({
                name: "Files",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
            })
            .filter(createFilter(isFmFile))
            .use(wrapInData)
            .use(extractImageMetadata)
            .build();

        runner.register(filePipeline);
    }
};
```

Inside a transformer:

```typescript
const extractImageMetadata = createDdbTransformer("extractImageMetadata", async ctx => {
    // ctx has BaseContext + DdbProcessorSlice + S3ProcessorSlice merged
    const buf = await ctx.getFile(ctx.record.key);          // S3 slice helper
    ctx.record.metadata = sharp(buf).metadata();
    ctx.copyFile(ctx.record.key, ctx.record.key);           // S3 slice helper
    // OR raw command push if you need a custom command type:
    // ctx.addCommand(MyCustomCmd.create({...}));
    // After this transformer chain finishes, DdbProcessor.onEnd runs
    // automatically and emits ctx.putRecord(ctx.record). No .build() arg.
});
```

Type inference: `ctx` is `BaseTransformContext<BaseRecord> & DdbProcessorSlice & S3ProcessorSlice`. Auto-complete shows everything available; missing-processor errors point at the call site.

## Decisions (grilled with user)

| # | Decision | Rationale |
|---|---|---|
| 1 | `runner.pipeline({ name, scanner, processors: NonEmptyArray<...> })` — array of processors per pipeline; empty array fails at the call site (TS). | Explicit composition; per-pipeline opt-in to executor sets. Pipelines with zero processors are bugs. |
| 2 | Each processor exposes optional `extendContext(base) → slice`, optional `onEnd(ctx)`, `execute(commands)`, `getShardState(): unknown`. No `keys()` declaration. | Slice is the helper contribution; onEnd is the per-record terminal hook (replaces magic auto-put); execute drains; shard state is per-processor. Unhandled-command detection lives in `Commands.unclaimedKeys()` instead — see Decision 11. |
| 3 | Slice-key collision = the implicit "processor type". No `Role` enum. | The slice IS the contract. Two processors both contributing `putRecord` are by definition incompatible. |
| 4 | Base context exposes `record`, `original`, `addCommand(cmd)`, `replace`, `queryRecord<T>(...)`, `modelProvider`, `cache`. **Raw `commands` bag is hidden** — `addCommand` is the only public push path. Processor slices contribute everything else. | Cleaner public surface; transformers shouldn't need bag introspection. The bag still exists internally for processor `execute(commands)`. |
| 5 | One shared `DdbExecutor` (the actual batchPut implementation). `DdbProcessor` and `OsProcessor` both compose it as a dependency. | Single source of truth for "write records to a DDB table". OS adds gzip + ensureIndex preamble inside its `execute()`. |
| 6 | Slice helpers split by responsibility: **command-pushing helpers are sync** (`putRecord`, `copyFile` — just construct + `addCommand`). **Read helpers can be async** (`getFile` — hits the network). Heavy batched async (gzip, ensureIndex, batchPut, batchCopy) lives in `execute()`. | Sync push helpers callable from sync contexts (onEnd, sync transformers). Async read helpers when the slice genuinely does I/O. Batched async stays at execute time for concurrency control. |
| 7 | Both `onEnd` (per-record) and `execute()` (per-shard) run **sequentially in array order**. No `Promise.all` parallelism across processors. | "Don't hammer services" — one processor at a time. The few extra `await`s per record/shard are negligible vs scan time. Order is the user's lever. |
| 8 | `.build()` takes no arg. Per-record terminal behavior comes entirely from each processor's `onEnd` hook. | No magic, no per-pipeline override config. If you want custom end logic, write a transformer at the end of `.use()` chain — it runs before all `onEnd` hooks. |
| 9 | Slice-collision detection is **TypeScript-only** via `DisjointKeys<TProcessors>`. No runtime check. | If users cast their way past TS, the spread silently last-wins per JS spec — that's on them. Keeps runtime simple. |
| 10 | `addCommand(cmd)` on the base context is the canonical primitive. Slice helpers internally use `addCommand`. | Generic command emission for command types no slice provides (custom user commands, future processor types). |
| 11 | Unhandled-command detection lives in `Commands.unclaimedKeys()`: a key is "claimed" when any processor's `execute()` calls `commands.get(key)`. After all `execute()` runs, runner warns once per pipeline if any unclaimed key has commands. | No `keys()` declaration on Processor needed — the act of calling `commands.get(X)` IS the declaration. Future-proof. |
| 12 | Errors in `onEnd` or `execute` bubble up unconditionally — fail the shard. After-hooks SKIPPED on shard failure (matches today). | Loud + safe. Per-record resilience added later if a real use case appears. |
| 13 | `getShardState` payloads keyed by **DI abstraction token name** (e.g., `"Core/OsProcessor"`). | Stable across processes, automatic, no extra processor declaration. On-disk JSON is internal between worker and orchestrator within one run. |
| 14 | User-authored DI features (custom processors, transformers, etc.) registered via a sibling `setup.ts` file, loaded BEFORE the preset's `configure(runner)` runs. CLI auto-discovers it next to the config file. Optional. | Single canonical place for custom DI wiring; explicit; no auto-registration magic. See "Setup file" section. |

## API surfaces

### `Processor` abstraction

```typescript
// src/domain/pipeline/abstractions/Processor.ts

import { createAbstraction } from "~/base/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface IProcessor<TBaseContext extends BaseTransformContext.Interface<unknown>, TSlice = {}> {
    /** Per-record helper contribution. Called once per record; returns a slice that's spread onto the base ctx. Optional — pure execute-only processors omit it. */
    extendContext?(base: TBaseContext): TSlice;

    /**
     * Per-record terminal hook. Runs after the transformer chain completes,
     * before processors' execute() is called at shard end. Same signature as
     * a transformer — uses slice helpers (or addCommand) to push terminal
     * commands. Optional — processors without a sensible per-record default
     * (e.g., S3Processor) omit it.
     *
     * Replaces today's `runner auto-puts ctx.record` magic — now declared in
     * the processor that owns the put.
     */
    onEnd?(ctx: TBaseContext & TSlice): void | Promise<void>;

    /**
     * Drain the processor's commands from the bag and write to target. The
     * act of calling commands.get(key) marks that key as "claimed" — the
     * runner uses Commands.unclaimedKeys() to warn-once on commands that
     * no processor handled.
     */
    execute(commands: Commands): Promise<void>;

    /** Per-shard state for the worker handler to serialize and pass to after-hooks. */
    getShardState(): unknown;
}

export const Processor = createAbstraction<IProcessor<any, any>>("Core/Processor");

export namespace Processor {
    export type Interface<
        TBaseContext extends BaseTransformContext.Interface<unknown>,
        TSlice = {}
    > = IProcessor<TBaseContext, TSlice>;
}
```

### `BaseTransformContext` (unchanged shape, simplified)

```typescript
// src/features/TransformContext/abstractions/BaseTransformContext.ts

interface IBaseTransformContext<TRecord> {
    record: TRecord;
    readonly original: Readonly<TRecord>;
    /**
     * The canonical primitive for emitting commands. Slice helpers (e.g.,
     * `ctx.putRecord`) internally call this. Transformers/onEnd use slice
     * helpers when available; reach for addCommand only for custom command
     * types no processor provides a slice helper for.
     *
     * The raw bag is intentionally NOT exposed on the public ctx surface —
     * it lives internally for processor `execute()` to drain.
     */
    addCommand(cmd: Command): void;
    modelProvider: ModelProvider.Interface;
    cache: Cache.Interface;
    replace(newRecord: TRecord): void;
    queryRecord<T extends Record<string, unknown> = Record<string, unknown>>(
        pk: string,
        sk?: string
    ): Promise<T | null>;
}
```

`BaseTransformContextFactory` is the only context factory. It depends on `SourceDynamoDbClient` (for `queryRecord`), `ModelProvider`, `Cache`, `MigrationConfig`. Provides the per-record base.

`DdbTransformContextFactory` and `OsTransformContextFactory` are **deleted** — their helpers move to processor slices (see below).

### Per-processor implementations

#### DdbProcessor

Slice: `{ putRecord(record: Record<string, unknown>): void }`. Pushes a `PutRecord` command targeting the DDB primary table. `execute()` delegates to the shared `DdbExecutor`.

```typescript
class DdbProcessorImpl implements Processor.Interface<BaseTransformContext.Interface<BaseRecord>, DdbProcessorSlice> {
    public constructor(
        private readonly executor: DdbExecutor.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<BaseRecord>): DdbProcessorSlice {
        const targetTable = this.config.target.dynamodb.tableName;
        return {
            putRecord(record: Record<string, unknown>) {
                base.addCommand(PutRecord.create({ table: targetTable, record }));
            }
        };
    }

    public onEnd(ctx: BaseTransformContext.Interface<BaseRecord> & DdbProcessorSlice): void {
        ctx.putRecord(ctx.record);
    }

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        await this.executor.execute(puts);
    }

    public getShardState(): unknown {
        return {};
    }
}

interface DdbProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
}
```

#### OsProcessor

Slice: `{ putRecord(record: Record<string, unknown>): void }` — same shape as `DdbProcessor`'s slice (this is what makes them mutually exclusive). Pushes a `PutRecord` targeting the OS DDB table. `execute()` runs ensureIndex preamble + gzip + delegates to `DdbExecutor`.

**Command-key coupling**: both `DdbProcessor` and `OsProcessor` drain `PutRecord.key`. Compile-time `DisjointKeys<>` catches the direct case (both listed in one pipeline) via the shared `putRecord` slice key. Runtime safety belt: each processor's `extendContext` throws if `config.storage` mode doesn't match its role. A future processor that needed to drain `PutRecord.key` alongside DdbProcessor would need either a new distinct command type or explicit dedup logic — flagged at the command file (`src/domain/transform/commands/PutRecord.ts`).

```typescript
class OsProcessorImpl implements Processor.Interface<BaseTransformContext.Interface<BaseRecord>, OsProcessorSlice> {
    public constructor(
        private readonly executor: DdbExecutor.Interface,
        private readonly osClient: OpenSearchClient.Interface,
        private readonly gzip: GzipCompression.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface,
        private readonly config: MigrationConfig.Interface,
        private readonly logger: Logger.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<BaseRecord>): OsProcessorSlice {
        const targetTable = this.config.target.opensearch.tableName;
        return {
            putRecord(record: Record<string, unknown>) {
                base.addCommand(PutRecord.create({ table: targetTable, record }));
            }
        };
    }

    public onEnd(ctx: BaseTransformContext.Interface<BaseRecord> & OsProcessorSlice): void {
        ctx.putRecord(ctx.record);
    }

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            return;
        }
        // 1. ensureIndex per unique index (sequential, classifier-gated)
        const uniqueIndexes = new Set(puts.map(p => p.record.index as string));
        for (const indexName of uniqueIndexes) {
            await this.ensureIndex(indexName);
        }
        // 2. Gzip in batches (gzipConcurrency cap)
        const gzipped = await this.gzipBatch(puts);
        // 3. Delegate to shared DDB executor
        await this.executor.execute(gzipped);
    }

    public getShardState(): { touchedIndexes: TouchedIndexes.Item[] } {
        return { touchedIndexes: this.touchedIndexes.all() };
    }

    // ensureIndex / gzipBatch / withRetry — same logic as today's PutOsDynamoDbRecordExecutor
}

interface OsProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
}
```

#### S3Processor

Slice: `{ copyFile(srcKey, tgtKey): void; getFile(key): Promise<Buffer | null> }`. `copyFile` pushes an `S3Copy` command; `getFile` directly invokes `SourceS3Client.getObject` (read, no command). `execute()` drains `S3Copy` commands via `TargetS3Client.batchCopy`.

```typescript
class S3ProcessorImpl implements Processor.Interface<BaseTransformContext.Interface<BaseRecord>, S3ProcessorSlice> {
    public constructor(
        private readonly sourceS3: SourceS3Client.Interface,
        private readonly targetS3: TargetS3Client.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<BaseRecord>): S3ProcessorSlice {
        const sourceBucket = this.config.source.s3.bucket;
        const targetBucket = this.config.target.s3.bucket;
        const sourceS3 = this.sourceS3;
        return {
            copyFile(sourceKey: string, targetKey: string) {
                base.addCommand(S3Copy.create({ sourceBucket, sourceKey, targetBucket, targetKey }));
            },
            async getFile(key: string): Promise<Buffer | null> {
                return sourceS3.getObject(sourceBucket, key);
            }
        };
    }

    // No onEnd — S3 doesn't have a sensible per-record default. Transformers
    // call ctx.copyFile(...) explicitly when they want to emit a copy.

    public async execute(commands: Commands): Promise<void> {
        const copies = commands.get<S3Copy>(S3Copy.key);
        if (copies.length === 0) { return; }
        await this.targetS3.batchCopy(
            copies.map(c => ({
                sourceBucket: c.sourceBucket, sourceKey: c.sourceKey,
                targetBucket: c.targetBucket, targetKey: c.targetKey
            }))
        );
    }

    public getShardState(): unknown {
        return {};
    }
}

interface S3ProcessorSlice {
    copyFile(sourceKey: string, targetKey: string): void;
    getFile(key: string): Promise<Buffer | null>;
}
```

Note: `S3Processor` reads from `SourceS3Client` (for `getFile`) and writes via `TargetS3Client` (for `S3Copy` execution). Today's S3 source/target split is preserved.

#### DdbExecutor (the shared batchPut)

```typescript
// src/features/DdbExecutor — replaces PutDynamoDbRecordExecutor

interface IDdbExecutor {
    /** Group puts by table and write via TargetDynamoDbClient.batchPut. No-op on empty input. */
    execute(puts: PutRecord[]): Promise<void>;
}
```

Same impl as today's `PutDynamoDbRecordExecutor` — only the name changes. Both `DdbProcessor` and `OsProcessor` depend on it.

### `runner.pipeline()` signature

```typescript
type NonEmptyArray<T> = readonly [T, ...T[]];

runner.pipeline<
    TRecord,
    TShard,
    TProcessors extends NonEmptyArray<ProcessorImpl<BaseTransformContext.Interface<TRecord>, any>>
>(input: {
    name: string;
    scanner: ScannerImpl<TRecord, TShard>;
    processors: DisjointKeys<TProcessors>;          // compile-time collision check
}): PipelineBuilder<
    TRecord,
    BaseTransformContext.Interface<TRecord> & MergeSlices<TProcessors>,
    TShard
>;
```

Empty `processors: []` fails at the call site (`Type '[]' is not assignable to type 'NonEmptyArray<...>'`). `DisjointKeys` rejects mismatched-slice-keys (e.g., DdbProcessor + OsProcessor both contributing `putRecord`).

`runner.register(...pipelines)` unchanged from current shape (variadic, throws on duplicate name).

### Pipeline builder hooks (unchanged)

`PipelineBuilder.beforeExecuteCommands(token)` and `.afterExecuteCommands(token)` survive from the current API — per-merge-group hooks taking `Abstraction<Hook.Interface>` tokens. Runner invokes them once before any shard runs / once after all shards succeed. After-hooks SKIPPED on shard failure (matches today). Out of scope for this spec — listed here so they're not assumed deleted.

### Setup file (user-side custom DI)

Users register their own processors / features / overrides in a `setup.ts` file colocated with their config:

```typescript
// projects/example/setup.ts
import { initDataTransfer } from "@webiny/data-transfer";
import { MyCustomProcessor } from "./processors/myCustom.ts";

export default initDataTransfer(async ({ container }) => {
    container.register(MyCustomProcessor);
});
```

`initDataTransfer` is an exported typed identity helper:

```typescript
export interface InitDataTransferContext {
    container: Container;
}

export function initDataTransfer(
    fn: (ctx: InitDataTransferContext) => void | Promise<void>
): typeof fn {
    return fn;
}
```

CLI flow:

1. Load + Zod-validate config.
2. Bootstrap container with package's built-in features.
3. Look for `setup.ts` next to the config file (convention) or `config.setup` (explicit override). If present, dynamic-import its default export and `await setupFn({ container })`. Setup is **OPTIONAL** — most users won't need it.
4. Load preset (from `config.pipeline.preset`) and run `preset.configure(runner)`. Preset can now reference user-registered processors in `runner.pipeline({ processors: [...] })`.
5. Spawn workers / `runner.run()`.

Order is mandatory: setup MUST run before preset.configure, since preset.configure depends on the registered processors.

## TypeScript hardening

The whole user-experience hinges on these types working cleanly. Layered concerns:

### Slice extraction per processor

Each processor's Implementation class type carries the slice via the constructor's return type — the `extendContext(base): TSlice` signature is preserved through `Processor.createImplementation({...})` because `@webiny/di` returns `Implementation<this, I>` = `I & { __abstraction: A }`.

```typescript
type ProcessorImpl<TBase, TSlice> = Constructor<Processor.Interface<TBase, TSlice>> & {
    __abstraction: Abstraction<unknown>;
};

type SliceOf<P> = P extends ProcessorImpl<any, infer S> ? S : never;
```

### Variadic slice merge

```typescript
type UnionToIntersection<U> =
    (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

type MergeSlices<T extends readonly unknown[]> =
    UnionToIntersection<{ [K in keyof T]: SliceOf<T[K]> }[number]>;
```

Standard variadic-tuple-to-intersection trick.

### Compile-time disjoint-keys check

`DisjointKeys<T>` returns the input tuple if all slice keys are pairwise disjoint, else `never`:

```typescript
type DisjointKeys<T extends readonly unknown[]> =
    HasDuplicateSliceKeys<T> extends true ? never : T;

type HasDuplicateSliceKeys<T extends readonly unknown[]> =
    T extends readonly [infer Head, ...infer Tail]
        ? keyof SliceOf<Head> & MergedTailKeys<Tail> extends never
            ? HasDuplicateSliceKeys<Tail>
            : true
        : false;

type MergedTailKeys<T extends readonly unknown[]> =
    T extends readonly [infer Head, ...infer Tail]
        ? keyof SliceOf<Head> | MergedTailKeys<Tail>
        : never;
```

Pipeline factory uses `processors: DisjointKeys<TProcessors>`. If two processors' slices share a key, TS rejects the call. Runtime check (in `mergeSlices`) handles dynamic processor lists where TS can't see the tuple shape.

### Effective context

```typescript
type EffectiveContext<TRecord, TProcessors extends readonly unknown[]> =
    BaseTransformContext.Interface<TRecord> & MergeSlices<TProcessors>;
```

Flows into `PipelineBuilder<TRecord, EffectiveContext<...>, TShard>`. `.use(transformer)` then types `transformer: (ctx: EffectiveContext<...>) => Promise<void> | void`. Transformer authors get auto-complete for ALL slice helpers; missing-processor errors point at the call site (`Property 'copyFile' does not exist on type ...`).

### Type-test fixture

`__tests__/domain/pipeline/PipelineBuilder.slices.test.ts` — vitest type tests covering:

- Single-processor pipeline → ctx has its slice.
- Multi-processor pipeline → ctx has union of all slices.
- Missing processor → transformer using its helper fails to compile (`@ts-expect-error`).
- Two processors both contributing same key (e.g. `runner.pipeline({ processors: [DdbProcessor, OsProcessor] })`) → fails to compile (`@ts-expect-error`).
- Mismatched scanner/processor record type → fails (existing test extends).

## Runtime orchestration

Per-record (inside `runShard`):

```
base = baseContextFactory.create(record)
ctx = mergeSlices(base, pipeline.processors)   // base + each processor's slice spread in order
                                               // throws on key collision (runtime belt + suspenders)
if !pipeline.acceptsRecord(record): continue
for transformer in pipeline.transformers:
    await transformer(ctx)
for processor in pipeline.processors:
    await processor.onEnd?.(ctx)               // per-record terminal hook (e.g., DdbProcessor.onEnd → ctx.putRecord(ctx.record))
```

At shard end (sequential, array order):

```
for processor in pipeline.processors:
    await processor.execute(base.commands)
const unclaimed = base.commands.unclaimedKeys();
if (unclaimed.length > 0):
    logger.warn(`Pipeline "${pipeline.name}" emitted commands of types [${unclaimed}] but no processor drained them.`);
```

Sequential — one processor at a time, in array order. Avoids hammering services. Inside each `execute`, processor-specific ordering applies (e.g., `OsProcessor` does ensureIndex sequentially before delegating to `DdbExecutor`). Unhandled-command warning fires per-pipeline-per-shard.

Worker handler `getShardState()` collection:

```typescript
const shardState: Record<string, unknown> = {};
for (const pipeline of merge_group.pipelines):
    for (const processor of pipeline.processors):
        const key = processorTokenName(processor);  // e.g., "Core/OsProcessor"
        shardState[key] = processor.getShardState();
```

After-hook reads the keyed state. `OsProcessor`'s `{ touchedIndexes: TouchedIndexes.Item[] }` lands under `"Core/OsProcessor"`.

## File structure

**Modify:**

- `src/domain/pipeline/abstractions/Processor.ts` — new shape: `extendContext` (optional) + `onEnd` (optional) + `execute()` + `getShardState()`. Drop the `createContext`-based shape.
- `src/domain/transform/commands/Commands.ts` — add `claimedKeys: Set<string>`, mutate from `get()`; add public `unclaimedKeys(): string[]` method.
- `src/features/PipelineRunner/abstractions/PipelineRunner.ts` — `pipeline()` signature accepts `processors: [...]` array, returns `PipelineBuilder<TRecord, EffectiveContext, TShard>`.
- `src/features/PipelineRunner/PipelineRunner.ts` — runtime orchestration; per-record slice merge; per-pipeline `execute` fanout; aggregated `getShardState`.
- `src/domain/pipeline/PipelineBuilder.ts` — `.use(transformer)` types against `EffectiveContext`; build snapshots the processors list onto `Pipeline`.
- `src/domain/pipeline/Pipeline.ts` — adds `processors: readonly Processor.Interface<...>[]` field.
- `src/features/TransformContext/abstractions/BaseTransformContext.ts` — slim down to record/commands/original/modelProvider/cache/replace/queryRecord. Drop ddb/os-specific helpers.
- `src/features/TransformContext/BaseTransformContextFactory.ts` — single context factory; depends on SourceDynamoDbClient (for queryRecord), ModelProvider, Cache.
- `src/features/PipelineRunner/PipelineRunner.ts` — slice-collision runtime check + warn-once on unknown command keys at the pipeline level.
- `src/index.ts` — re-export `Processor` (the abstraction, with namespace types) so users can author processors. Re-export `BaseTransformContext`. Drop the per-mode TransformContext re-exports.
- `src/bootstrap.ts` — register `BaseTransformContextFactory`, `DdbExecutor`, `DdbProcessor`, `S3Processor` in DDB mode; `BaseTransformContextFactory`, `DdbExecutor`, `OsProcessor`, `TouchedIndexes` in OS mode.
- `src/presets/example.ts` — update `processors: [DdbProcessor, S3Processor]` shape.
- `templates/presets/example.ts` — same.
- `AGENTS.md` — Section 2 (Public API), Section 4 (Scanner/Processor/Executor description), Section 6 (hard-won decisions).

**Create:**

- `src/features/DdbExecutor/` (renamed from `PutDynamoDbRecordExecutor/`) — same impl, new name.
- `src/features/S3Processor/` — replaces `S3CopyExecutor/`. New `extendContext` + same execute body.
- `src/features/DdbProcessor/` — restructured. New `extendContext` + `execute` delegates to `DdbExecutor`.
- `src/features/OsProcessor/` — restructured. New `extendContext` + `execute` does ensureIndex + gzip + delegates to `DdbExecutor`.
- `__tests__/domain/pipeline/PipelineBuilder.slices.test.ts` — type-test fixture.

**Delete:**

- `src/features/PutDynamoDbRecordExecutor/` (renamed to `DdbExecutor/`).
- `src/features/PutOsDynamoDbRecordExecutor/` (folded into `OsProcessor/`).
- `src/features/S3CopyExecutor/` (folded into `S3Processor/`).
- `src/features/TransformContext/DdbTransformContextFactory.ts` (helpers move to `DdbProcessor` + `S3Processor` slices).
- `src/features/TransformContext/OsTransformContextFactory.ts` (helpers move to `OsProcessor` slice).
- `src/features/TransformContext/abstractions/DdbTransformContext.ts` (replaced by base + slice intersection).
- `src/features/TransformContext/abstractions/OsTransformContext.ts` (same).
- `__tests__/features/PutDynamoDbRecordExecutor/`, `__tests__/features/PutOsDynamoDbRecordExecutor/`, `__tests__/features/S3CopyExecutor/` — coverage moves to per-processor test dirs.

## Testing strategy

- **Unit per processor**: each processor gets its own test file. Resolves from container; spies on its dependencies; verifies slice helpers emit the right commands and `execute()` drains the right keys.
- **PipelineRunner tests**: extend with cases for slice merging, runtime collision detection, multi-processor `execute` fanout, aggregated shard state.
- **Type-test fixture**: as listed above.
- **Integration**: `PipelineRunner.integration.test.ts` exercises a multi-processor pipeline end-to-end; assert both DDB writes AND S3 copies happen for a single fake record.

## Non-goals

- No changes to the command domain objects (`PutRecord`, `S3Copy`, `Commands`).
- No changes to scanners.
- No changes to `runner.register(...)` shape.
- No new command types.
- No changes to the runner-centric pipeline API (just landed); only the processor argument shape changes.
- No npm publish, init scaffolding, or AWS smoke work.

## Risk / open questions

- **`@webiny/di` slice extraction**: relies on the `__abstraction` marker pattern we already use for scanner/processor. Same risk as before — if `@webiny/di` ever changes its marker name, our type machinery breaks. Mitigated by localizing `ProcessorImpl<>` / `SliceOf<>` types in one file.
- **Slice helper bivariance**: `extendContext(base): TSlice` — TS infers the slice type from the return type, so bivariance shouldn't bite the way it did with scanner/processor record matching. Type-test fixture covers it.
- **`getShardState` keying scheme**: keying by `processorTokenName` (DI token string) is stable across processes, but ties shard state to the abstraction token. If a processor abstraction is ever renamed, the on-disk JSON layout changes. Acceptable — the on-disk format is internal between worker and orchestrator within one run.
- **Unknown-command-key warning**: implicit via `Commands.unclaimedKeys()` — a key is "claimed" when any processor's `execute()` calls `commands.get(key)`. After all `execute()` calls, runner warns if any key has commands but was never claimed. Catches "transformer pushed `S3Copy` but pipeline omits `S3Processor`" without requiring processor authors to declare a `keys()` method.
- **Pipelines with zero processors**: pure passthrough. Auto-put would fail because no processor contributes `putRecord`. Either error at `pipeline.build()` ("pipeline has no processors — what writes the records?") or allow it (pipeline is read-only? doesn't make sense in this tool). Recommend: throw at `build()` with a clear message.
