---
name: writing-data-transfer-preset
description: Use when writing or editing a @webiny/data-transfer preset file (the one referenced by pipeline.preset in a config). Covers createTransferPreset, pipelineBuilderFactory.create, filter/use/hook composition, first-match-wins record dispatch, unmatched-record drop semantics, writing transformers (createDdbTransformer / createOsTransformer), registering pipelines with the runner, and the onEnd auto-put behavior for DdbProcessor / OsProcessor.
---

# Writing a `@webiny/data-transfer` preset

A preset is a `.ts` file that `export default`s a `createTransferPreset({...})` call. The config points at it via `pipeline.preset: "./presets/my-preset.ts"` (relative path) OR a built-in name.

The preset's job: register one or more **pipelines** — each pipeline is a `{scanner, processors, filter, transformers}` quadruple that processes matching records.

## Minimal shape

```ts
import {
    createTransferPreset,
    createFilter,
    DdbScanner,
    DdbProcessor
} from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

export default createTransferPreset({
    name: "tag-entries",
    description: "Stamp every internal-tagged CMS entry with migratedAt.",
    configure({ runner, pipelineBuilderFactory }) {
        const tagged = pipelineBuilderFactory
            .create({
                name: "TaggedEntries",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(r => r.TYPE === "cms.entry" && r.tags?.includes("internal")))
            .use(stampMigratedAt)
            .build();

        runner.register(tagged);
    }
});
```

## `createTransferPreset({...})`

Wraps your preset object so TypeScript infers the `configure` callback's arg types correctly. It's a typed identity helper — no runtime transformation. Without it, you'd have to import and annotate `MigrationPreset` yourself.

Required fields:
- **`name: string`** — unique preset identifier.
- **`description: string`** — user-facing summary.
- **`configure({ runner, pipelineBuilderFactory, container })`** — sync or async. Builds pipelines and calls `runner.register(...)`.

## `pipelineBuilderFactory.create({...})` — typed pipeline builder

```ts
const pipeline = pipelineBuilderFactory
    .create({
        name: "MyPipeline",      // unique within this runner
        scanner: DdbScanner,     // which source iterator to use
        processors: [DdbProcessor, S3Processor]  // which processors contribute slices + drain commands
    })
    .filter(createFilter(r => /* ... */))  // zero or more filters; all must pass
    .use(myTransformer)                     // zero or more transformers; run in order
    .build();
```

### Scanner tokens (pick one)

- **`DdbScanner`** — iterates a DDB table via parallel-scan. Yields `BaseRecord` (PK/SK/_et/_ct/_md/TYPE + index sig).
- **`OsScanner`** — iterates the OpenSearch companion DDB table, gzip-decoding each record before yielding.

All pipelines sharing the same scanner form a **merge group** — they run together, sharing a single scan.

### Processor tokens

- **`DdbProcessor`** — slice: `{ putRecord(record) }`. `onEnd` auto-puts `ctx.record`. `execute` drains `PutRecord` commands to the target DDB table.
- **`S3Processor`** — slice: `{ copyFile(src, tgt), getFile(key) }`. No `onEnd` — transformers call `copyFile` explicitly. `execute` drains `S3Copy` commands.
- **`OsProcessor`** — slice: `{ putRecord(record) }`. `onEnd` auto-puts. `execute` gzips, ensures the target index exists, and writes to the target OS DDB table.

**Slice-key collision is a compile error.** `DdbProcessor + OsProcessor` in the same pipeline is rejected because both contribute `putRecord`. `DdbProcessor + S3Processor` is fine (disjoint slices).

### Builder chain

All methods are chainable and can be called in any order (multiple `.use()` calls are ordered by insertion for execution):

- `.filter(filter)` — AND-composes if called multiple times.
- `.use(transformer)` — insertion order IS execution order. Also accepts an **array** (`.use([t1, t2, t3])`) so you can declare a shared stack once and apply it across pipelines. Mixing single and array calls is fine — the list just accumulates.
- `.beforeExecuteCommands(hook)` / `.afterExecuteCommands(hook)` — optional merge-group hooks.
- `.blackhole()` — observe-only mode. Filters + transformers + `onEnd` still run; every emitted command is discarded at the per-record → shard fold step. Useful for validation-only pipelines or dry-running a single pipeline inside an otherwise real transfer. Snapshot (if enabled) still captures what would have been written, so you can diff the blackholed pipeline's intended output without touching the target.
- `.build()` — snapshot into an immutable `Pipeline`. Required before `runner.register()`.

## Filter semantics

### First-match-wins

Within a merge group, each record is tried against pipelines **in registration order**. The first one whose filters all pass gets the record; subsequent pipelines are skipped for that record.

**Register more-specific pipelines BEFORE catch-alls.** Example:

```ts
runner
    .register(fmFilePipeline)  // specific: cms.entry with modelId=fmFile
    .register(cmsEntryPipeline); // catch-all: any cms.entry
```

If you reverse the order, `cmsEntryPipeline` would swallow fm.file records and `fmFilePipeline` never runs.

### Unmatched records are DROPPED SILENTLY

If no pipeline in the merge group accepts a record, it's skipped. Logged at `debug` level only — invisible under the default `info` log level.

A preset picks which record types to transfer. Types outside the preset's filter set are intentionally left behind. **If you want every record to land on the target**, add a catch-all passthrough:

```ts
const catchAll = pipelineBuilderFactory
    .create({ name: "catch-all", scanner: DdbScanner, processors: [DdbProcessor] })
    .build(); // no .filter, no .use → accepts everything, emits verbatim
runner.register(catchAll); // MUST be last
```

## Writing transformers

A transformer is an async function that mutates `ctx.record` (or replaces it via `ctx.replace(...)`). Wrap with a factory to get typed ctx inference:

```ts
import { createDdbTransformer } from "@webiny/data-transfer";
import type { DdbTransformContext } from "@webiny/data-transfer";

export const stampMigratedAt = createDdbTransformer(
    "stampMigratedAt",
    (ctx: DdbTransformContext.Interface) => {
        ctx.record.migratedAt = new Date().toISOString();
    }
);
```

### Factory variants

- **`createTransformer<TContext>(name, fn)`** — generic, pick any context shape.
- **`createDdbTransformer(name, fn)`** — binds to `DdbTransformContext.Interface` (has `.putRecord`, `.copyFile`, `.getFile`).
- **`createOsTransformer(name, fn)`** — binds to `OsTransformContext.Interface` (has `.putRecord`).

### Context API

**Base context** — always present regardless of processors:

| Member                     | Description                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `ctx.record`               | Mutable. Transformers modify this.                                                      |
| `ctx.original`             | **Frozen** pre-transform snapshot. Always present. Use for audit/gate-checks.           |
| `ctx.replace(newRecord)`   | Replace `ctx.record` wholesale. Propagates to subsequent transformers + onEnd.          |
| `ctx.addCommand(cmd)`      | Low-level — push any command into the shared bag. Prefer `putRecord` / `copyFile`.      |
| `ctx.modelProvider`        | Loaded CMS models from `config.pipeline.modelsDir` if set.                              |
| `ctx.cache`                | `Map`-like cache, persists across records in the same worker.                           |
| `ctx.logger`               | Worker-bound logger. Use instead of `console.*` — respects log level config.            |

**DdbProcessor slice** — available when pipeline includes `DdbProcessor`:

| Member                     | Description                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `ctx.putRecord(r)`         | Emit an EXTRA `PutRecord` beyond the auto-put. Don't call this on `ctx.record` itself — that's a duplicate. |
| `ctx.querySourceRecord(pk, sk?)` | Query the **source primary DDB table** (`config.source.dynamodb.tableName`). Returns `null` if not found. |
| `ctx.queryTargetRecord(pk, sk?)` | Query the **target primary DDB table** (`config.target.dynamodb.tableName`). Returns `null` if not found. |

**S3Processor slice** — available when pipeline includes `S3Processor`:

| Member                     | Description                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `ctx.copyFile(src, tgt)`   | Emit an S3 copy command (source bucket → target bucket).                                |
| `ctx.getFile(key)`         | Read a file from the SOURCE bucket. Returns `Buffer`.                                   |

**OsProcessor slice** — available when pipeline includes `OsProcessor`:

| Member                     | Description                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `ctx.putRecord(r)`         | Emit an EXTRA `PutRecord` beyond the auto-put.                                          |
| `ctx.querySourceRecord(pk, sk?)` | Query the **source OS companion DDB table** (`config.source.opensearch.tableName`). Returns `null` if not found. |
| `ctx.queryTargetRecord(pk, sk?)` | Query the **target OS companion DDB table** (`config.target.opensearch.tableName`). Returns `null` if not found. |

Use `DdbCoreTransformContext.Interface` when a transformer only needs DDB slice methods (no S3). Use `DdbTransformContext.Interface` when it also needs `copyFile` / `getFile`. Use `OsTransformContext.Interface` for OS pipelines.

### Auto-put behavior (`onEnd`)

`DdbProcessor` and `OsProcessor` include an `onEnd` hook that automatically emits a `PutRecord` for `ctx.record` at the end of each transformer chain. So:

- **Passthrough** (`.filter(...)` with no `.use(...)`) — still writes the record to the target, unchanged.
- **Transformed** (with `.use(fn)`) — the mutated record gets written. Don't call `ctx.putRecord(ctx.record)` manually; that's a duplicate.

`S3Processor` has no `onEnd` — copies fire only when a transformer explicitly calls `ctx.copyFile(...)`.

## Registration order matters

```ts
runner
    .register(fmSettings)    // most-specific filter first
    .register(securityGroups)
    .register(cmsEntries)    // catch-all LAST
    .register(fallback);     // optional passthrough if you want every record
```

`runner.register()` is variadic + chainable. Throws on duplicate pipeline names across the whole runner.

## Hooks (optional, per merge group)

```ts
import { createAbstraction, createFeature } from "@webiny/di";
// Declare a Hook token (one-off) that implements Hook.Interface.
```

Hooks run:
- **before-hook** once at merge group start, before any shards run.
- **after-hook** once after ALL shards succeed. Skipped on shard failure.

Use them for index preparation, schema migration, cache warm-up, etc.

## Built-in transformer stacks

Two pre-built transformer arrays are exported from `@webiny/data-transfer` (via `src/transformers/index.ts`):

- **`cmsEntryTransformers`** — DDB-mode stack: `wrapInData, addGsiTenant, removeLocale, fixCmePk, fixBrokenStorageKeys, transformRichText, updateModelIds, removeFolderRevision, removeAttributes`. Use with `.use(cmsEntryTransformers)` in DDB pipelines.
- **`osCmsEntryTransformers`** — OS-mode stack: same as above but **omits `wrapInData`** (OS records already have `data` populated) and adds `updateOsIndex` after `updateModelIds`. Use in OS pipelines.

`addLiveField` is **not** in either shared stack — apply it explicitly on pipelines that cover publishable CMS entries only. File manager files cannot be published and must not receive it.

## Built-in presets

Two built-in presets ship with the package (pass by name in `config.pipeline.preset`):

- **`v5-to-v6-ddb`** — full Webiny v5→v6 DDB + S3 migration. Pipelines: ContentModelGroups, BackgroundTasks (blackhole), FileManagerSettings, FileManagerFiles (blackhole for S3), MailerSettings, SecurityGroups, SecurityTeams, CmsModels, FolderPermissions, CmsEntries.
- **`v5-to-v6-os`** — OpenSearch companion table migration. Pipelines: BackgroundTasks (blackhole), MailerSettings (blackhole), FileManagerFiles, CmsEntries. Uses `OsScanner` + `OsProcessor`. Registration order is load-bearing: blackhole pipelines BEFORE CmsEntries because background tasks and mailer settings ARE CMS entries in the OS table.

## `addLiveField` — querying siblings via cache

`addLiveField` is a built-in transformer that sets `data.live = { version: N }` on CMS entries that have a published revision. Pattern for any transformer that needs to look up a sibling record once per entry:

```ts
import { createTransformer } from "@webiny/data-transfer";
import type { DdbCoreTransformContext } from "@webiny/data-transfer";
import type { BaseRecord } from "@webiny/data-transfer";

const SENTINEL = -1; // "queried, none found" — must be non-zero and truthy

export const myTransformer = createTransformer<DdbCoreTransformContext.Interface<BaseRecord>>(
    "myTransformer",
    async ctx => {
        const cacheKey = `my-key:${ctx.original.PK}`;
        const cached = ctx.cache.get<number>(cacheKey);
        if (cached) {
            // cache hit: SENTINEL means not found; any other value is the result
            if (cached !== SENTINEL) { /* use cached */ }
            return;
        }
        // cache miss — query source once, cache the result
        const sibling = await ctx.querySourceRecord(ctx.original.PK as string, "P");
        ctx.cache.set(cacheKey, sibling ? (sibling.version as number) : SENTINEL);
    }
);
```

**Key points:**
- Use `ctx.original.PK` (not `ctx.record.PK`) as the cache key — `original` is stable even after transformers mutate the record.
- DDB parallel scan guarantees all records with the same PK (same entry) go to the same segment/worker, so `ctx.cache` (an in-process singleton) is sufficient for deduplication across siblings.
- Use a non-zero truthy sentinel for "queried but not found" so a plain `if (cached)` correctly identifies cache hits (version 0 is impossible in Webiny — versions start at 1).

## Anti-patterns

- **Double write** — calling `ctx.putRecord(ctx.record)` manually AND relying on `DdbProcessor.onEnd` auto-put. The auto-put already emits it.
- **Filter order reversed** — catch-all before specific pipelines. Specific pipelines never match anything.
- **Mutating `ctx.original`** — it's frozen. Runtime will throw.
- **Emitting commands for keys no processor drains** — runner warns once per key ("command X was emitted but no processor claimed it"). Usually means the pipeline is missing the processor that drains that key (e.g., pushing `S3Copy` in a pipeline that has `[DdbProcessor]` only).

## Zero-transformer preset (pure copy)

```ts
export default createTransferPreset({
    name: "copy",
    description: "Copy every record from source to target verbatim.",
    configure({ runner, pipelineBuilderFactory }) {
        const copyAll = pipelineBuilderFactory
            .create({ name: "copy-all", scanner: DdbScanner, processors: [DdbProcessor] })
            .build(); // no .filter, no .use → accepts every record, emits verbatim
        runner.register(copyAll);
    }
});
```

Useful for prod→dev seeding without any transformation.
