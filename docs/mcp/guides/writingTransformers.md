---
name: writingTransformers
description: How to write custom transformers — createDdbTransformer/createOsTransformer/createTransformer factories, context types, processor slices, ctx.record, ctx.putRecord(), ctx.blackhole().
category: Guides
---

# Writing transformers

A transformer is a named function `(ctx) => void | Promise<void>` that mutates `ctx.record`. Register it on a pipeline builder with `.use(...)`; transformers run in registration order, each seeing the mutations of the ones before it.

Source: `docs/guides/writing-transformers.md`, `src/transformers/createTransformer.ts`, `src/transformers/createDdbTransformer.ts`, `src/transformers/createOsTransformer.ts`, `src/features/TransformContext/abstractions/`.

## Factories

```typescript
// src/transformers/createTransformer.ts
function createTransformer<TContext extends Processor.Context>(
    name: string,
    fn: Transformer.Interface<TContext>
): Transformer.Interface<TContext>;

// src/transformers/createDdbTransformer.ts
function createDdbTransformer(
    name: string,
    fn: Transformer.Interface<DdbTransformContext.Interface>
): Transformer.Interface<DdbTransformContext.Interface>;

// src/transformers/createOsTransformer.ts
function createOsTransformer(
    name: string,
    fn: Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>>
): Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>>;
```

All three do the same thing at runtime — stamp a non-enumerable `transformerName` property onto `fn` for logging/debugging — and differ only in which context type they bind `fn`'s parameter to:

- **`createTransformer<TContext>(name, fn)`** — generic over any context type. Use for `BaseTransformContext` or `DdbCoreTransformContext` transformers, or anything the two convenience factories don't fit.
- **`createDdbTransformer(name, fn)`** — binds `DdbTransformContext.Interface` (Base + `DdbProcessor` slice + `S3Processor` slice). Default choice for v5-to-v6 DDB transformers.
- **`createOsTransformer(name, fn)`** — binds `OsTransformContext.Interface` (Base + `OsProcessor` slice).

```typescript
import { createDdbTransformer } from "@webiny/data-transfer";
import type { DdbTransformContext } from "@webiny/data-transfer";

export const stampMigratedAt = createDdbTransformer(
  "stampMigratedAt",
  (ctx: DdbTransformContext.Interface) => {
    ctx.record.migratedAt = new Date().toISOString();
  }
);
```

**Compile-time contract, not just naming:** whichever context type you bind the transformer to must match the processors actually registered on any pipeline that uses it. A `createDdbTransformer` transformer calling `ctx.copyFile(...)` will only type-check on a pipeline whose `processors` includes `S3Processor`.

## Context type aliases

Use the narrowest type that covers what your transformer needs. Source: `src/features/TransformContext/abstractions/contextAliases.ts`.

| Type | Processors required in pipeline | When to use |
| --- | --- | --- |
| `BaseTransformContext.Interface<TRecord>` | any | Only touches `ctx.record`, `ctx.cache`, `ctx.logger`, etc. — no processor-specific helpers. |
| `DdbCoreTransformContext.Interface<TRecord>` | `DdbProcessor` only | Needs `querySourceRecord` / `queryTargetRecord` / `putRecord` but not S3 helpers. |
| `DdbTransformContext.Interface<TRecord>` | `DdbProcessor` + `S3Processor` | Default for v5-to-v6 DDB transformers that may call `ctx.copyFile` / `ctx.getFile`. |
| `OsTransformContext.Interface<TRecord>` | `OsProcessor` | OS transformers. `ctx.record.data` is the decompressed payload — always present. |

All four are generic over `TRecord`, defaulting to `BaseRecord`. Import from `@webiny/data-transfer`.

## Base context API

Available on every transformer context regardless of pipeline configuration (`src/features/TransformContext/abstractions/BaseTransformContext.ts`):

```typescript
interface BaseTransformContext<TRecord = unknown> {
    record: TRecord;
    readonly original: Readonly<TRecord>;
    readonly modelProvider: ModelProvider.Interface;
    readonly cache: Cache.Interface;
    readonly logger: Logger.Interface;
    readonly compressionHandler: CompressionHandler.Interface;
    replace(newRecord: TRecord): void;
    addCommand(cmd: Command): void;
    blackhole(): void;
    readonly isBlackholed: boolean;
}
```

| Member | Description |
| --- | --- |
| `ctx.record` | Mutable record. Transformers mutate this directly. |
| `ctx.original` | Frozen, deep-cloned pre-transform snapshot — **always present**, never touched by earlier transformers in the chain. Use for gate-checks or audit comparisons; never modify it. |
| `ctx.replace(newRecord)` | Replace `ctx.record` wholesale (rather than mutating field by field). |
| `ctx.addCommand(cmd)` | Push a raw command onto the command bag. Processor slice helpers (`putRecord`, `copyFile`, `putAuditLog`) are sugar over this — reach for it directly only when emitting a command type no slice helper covers. |
| `ctx.modelProvider` | Loaded CMS models (from DB + `pipeline.modelsDir` JSON files if configured). `ctx.modelProvider.getModel(modelId)`. |
| `ctx.cache` | Shared `Map`-like cache, persists across records **within a shard** (not across shards/workers). Useful for dedup or memoizing lookups. |
| `ctx.logger` | Logger bound to the current worker — use instead of `console.*`; respects `debug.logLevel`. |
| `ctx.compressionHandler` | Gzip compression utility (used internally by OS record handling). Rarely needed directly. |
| `ctx.blackhole()` | Per-record blackholing — suppresses all writes for **this record only**. Remaining transformers and each processor's `onEnd` still run; the runner discards the accumulated commands before forwarding to processors. Irreversible for the record's lifetime. |
| `ctx.isBlackholed` | Read-only flag; `true` after `ctx.blackhole()` has been called for this record. |

## Processor slices

Each processor class in a pipeline's `processors` array contributes additional helpers onto the effective context — types intersect via `MergeSlices`, so the context your transformer receives is `BaseTransformContext & <union of every processor's slice>`.

### `DdbProcessor` slice

Present on `DdbCoreTransformContext` and `DdbTransformContext`.

```typescript
interface DdbProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
    querySourceRecord<T = Record<string, unknown>>(pk: string, sk?: string): Promise<T | null>;
    queryTargetRecord<T = Record<string, unknown>>(pk: string, sk?: string): Promise<T | null>;
}
```

| Member | Description |
| --- | --- |
| `ctx.putRecord(record)` | Emit an **extra** `PutRecord` to the DDB target, beyond the automatic put at chain end (see Auto-put below). Use for transformers that need to write a second/related record (e.g. a denormalized index entry). |
| `ctx.querySourceRecord<T>(pk, sk?)` | Query the source DDB primary table directly. Returns `null` if not found. |
| `ctx.queryTargetRecord<T>(pk, sk?)` | Query the target DDB primary table directly. Returns `null` if not found. |

### `S3Processor` slice

Present on `DdbTransformContext` only (not `DdbCoreTransformContext`).

```typescript
interface S3ProcessorSlice {
    copyFile(sourceKey: string, targetKey: string): void;
    getFile(key: string): Promise<Buffer | null>;
}
```

| Member | Description |
| --- | --- |
| `ctx.copyFile(sourceKey, targetKey)` | Emit an S3 copy command (source → target bucket, per config). Keys may differ — e.g. reshaping the storage path during migration. |
| `ctx.getFile(key)` | Read a file from the **source** bucket. Returns `Buffer \| null`. |

### `OsProcessor` slice

Present on `OsTransformContext`. Same member names as the DDB slice but reading/writing the OS companion DDB table:

```typescript
interface OsProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
    querySourceRecord<T = Record<string, unknown>>(pk: string, sk?: string): Promise<T | null>;
    queryTargetRecord<T = Record<string, unknown>>(pk: string, sk?: string): Promise<T | null>;
}
```

Because the key names collide with `DdbProcessorSlice`, `[DdbProcessor, OsProcessor]` cannot be registered together on the same pipeline — the factory's disjoint-keys check rejects it at compile time.

### `AuditLogProcessor` slice

Not one of the four context type aliases (no dedicated `AuditLogTransformContext` export), but usable via `createTransformer<TContext>` with an inline intersection, or accessible implicitly when writing the audit log transformer chain:

```typescript
interface AuditLogProcessorSlice {
    putAuditLog(record: Record<string, unknown>): void;
}
```

`ctx.putAuditLog(record)` emits a put to the configured audit log table. No-op if `target.auditLog` is not configured.

## Auto-put behavior

`DdbProcessor`, `OsProcessor`, and `AuditLogProcessor` each register an `onEnd` hook that fires once per record, after all transformers have run: it calls `putRecord(ctx.record)` (or `putAuditLog(ctx.record)`) automatically. This is why a **zero-transformer pipeline still writes records** — see the "Zero-transformer preset" example in `writingPresets.md`.

`S3Processor` has **no** `onEnd` — nothing is copied unless a transformer explicitly calls `ctx.copyFile(...)`.

`onEnd` hooks run **sequentially in processor array order** when a pipeline has multiple processors (e.g. `[DdbProcessor, S3Processor]` → DDB auto-put runs, then S3Processor's `onEnd` runs — which is a no-op since S3Processor doesn't define one).

## Built-in transformer factories that take config

Not every built-in transformer is a bare `(ctx) => void` — some are factory functions that must be **called with a config argument** before `.use(...)`:

```typescript
import { replaceFileUrls, MigrationConfig } from "@webiny/data-transfer";

// replaceFileUrls(config: MigrationConfig.Interface) => Transformer<BaseTransformContext.Interface<BaseRecord>>
async configure({ runner, pipelineBuilderFactory: factory, container }) {
  const config = container.resolve(MigrationConfig);

  const pipeline = await factory
    .create({ name: "cms-entries", scanner: DdbScanner, processors: [DdbProcessor] })
    .use(replaceFileUrls(config)) // NOTE: called, not passed bare
    .build();

  runner.register(pipeline);
}
```

`replaceFileUrls` requires a `fileUrls: { source, target }` block at the config root (see `configReference.md`) — it's a no-op transformer if that block is absent.

Most other built-ins (`wrapInData`, `addGsiTenant`, `removeLocale`, `groupsToRoles`, etc.) are plain transformers — pass them bare to `.use(...)`. Check each transformer's doc under `docs/mcp/transformers/` for its exact call shape before wiring it in.

## Full example: DDB transformer with a source lookup

```typescript
import { createDdbTransformer } from "@webiny/data-transfer";
import type { DdbTransformContext } from "@webiny/data-transfer";

export const enrichFromSource = createDdbTransformer(
  "enrichFromSource",
  async (ctx: DdbTransformContext.Interface) => {
    if (ctx.record.TYPE !== "cms.entry") {
      return;
    }

    const related = await ctx.querySourceRecord<{ title: string }>(
      `T#${ctx.record.tenant}#L#en-US#CMS#CMG#category`,
      ctx.record.categoryId as string
    );

    if (!related) {
      ctx.logger.warn(`enrichFromSource: category not found for ${ctx.record.PK}`);
      return;
    }

    ctx.record.categoryTitle = related.title;
  }
);
```

## Full example: OS transformer

```typescript
import { createOsTransformer } from "@webiny/data-transfer";
import type { OsTransformContext } from "@webiny/data-transfer";

export const dropInternalField = createOsTransformer(
  "dropInternalField",
  (ctx: OsTransformContext.Interface) => {
    const data = ctx.record.data as Record<string, unknown> | undefined;
    if (data) {
      delete data.internalDebugFlag;
    }
  }
);
```

## Built-in processors reference

| Processor | Slice helpers | Auto-put (`onEnd`) | Notes |
| --- | --- | --- | --- |
| `DdbProcessor` | `putRecord`, `querySourceRecord`, `queryTargetRecord` | Yes | Primary DDB table. |
| `S3Processor` | `copyFile`, `getFile` | No | S3 bucket — emit copies explicitly via `ctx.copyFile`. |
| `OsProcessor` | `putRecord`, `querySourceRecord`, `queryTargetRecord` | Yes | OS companion DDB table. Gzips on write, ensures the target index exists. |
| `AuditLogProcessor` | `putAuditLog` | Yes | Writes to the audit log table. No-op when `target.auditLog` is null/unset. |

For built-in ready-made transformers (e.g. `copyFileToTarget`), see `docs/mcp/transformers/`.
