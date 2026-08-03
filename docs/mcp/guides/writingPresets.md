---
name: writingPresets
description: How to write a custom preset — createTransferPreset shape, pipelineBuilderFactory.create(), builder methods, filter/use/hook composition, first-match-wins dispatch, built-in presets.
category: Guides
---

# Writing presets

A preset is a file exporting `default: MigrationPreset` — `{ name, description, configure }`. `configure(ctx)` receives `{ runner, pipelineBuilderFactory, container }`, builds one or more `Pipeline` objects, and registers them on `runner`. The wizard/CLI selects a preset by `name` at runtime (`--preset=<name>` or `presetsDir` for custom files).

Source: `src/utils/createTransferPreset.ts`, `src/domain/transform/Preset.ts`, `src/domain/pipeline/PipelineBuilder.ts`, `src/features/PipelineBuilderFactory/`.

## Minimal preset

```typescript
import {
  createTransferPreset,
  DdbScanner,
  DdbProcessor,
  S3Processor,
  createFilter
} from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

export default createTransferPreset({
  name: "my-preset",
  description: "One-line description shown in CLI output.",
  async configure({ runner, pipelineBuilderFactory }) {
    const pipeline = await pipelineBuilderFactory
      .create({ name: "my-pipeline", scanner: DdbScanner, processors: [DdbProcessor, S3Processor] })
      .filter(createFilter(r => r.TYPE === "cms.entry"))
      .use(stampMigratedAt)
      .build();

    runner.register(pipeline);
  }
});
```

Drop the file in your `pipeline.presetsDir` (see `configReference.md`). The wizard offers it by name alongside the 5 built-ins.

**`createTransferPreset(preset)`** is an identity function — it exists purely so `configure({...})` gets typed inference without you importing and annotating `MigrationPreset` yourself. Pair it with `export default`; the loader looks for `default` first.

## `PresetConfigureContext` — what `configure` receives

```typescript
interface PresetConfigureContext {
    runner: PipelineRunner.Interface;
    pipelineBuilderFactory: PipelineBuilderFactory.Interface;
    container: Container; // @webiny/di container
}
```

- **`runner`** — call `runner.register(...pipelines)` (variadic, chainable) once your pipelines are built.
- **`pipelineBuilderFactory`** — call `.create({ name, scanner, processors })` to start a new `PipelineBuilder`.
- **`container`** — resolve DI-registered services, e.g. `container.resolve(MigrationConfig)` to read the parsed config at preset-build time (used by built-in presets to decide whether to blackhole audit logs — see below).

`configure` may be `sync` or `async` — declare it `async` whenever you `await` a `.build()` call (you always will, since `.build()` is async — see below).

## `pipelineBuilderFactory.create({ name, scanner, processors })`

```typescript
factory.create<TRecord, TShard, TProcessors extends NonEmptyArray<...>>(input: {
    name: string;
    scanner: ScannerImpl<TRecord, TShard>;
    processors: TProcessors; // non-empty tuple, disjoint slice keys enforced at compile time
}): PipelineBuilder<TRecord, EffectiveContext, TShard>
```

- **`name`** — unique across the run; `PipelineBuilder`'s constructor throws if empty/whitespace-only, and the runner throws on duplicate names.
- **`scanner`** — `DdbScanner` or `OsScanner` (both exported from `@webiny/data-transfer`). Determines which table is scanned and the `TRecord` shape flowing through filters/transformers.
- **`processors`** — a non-empty array of processor implementation classes (`DdbProcessor`, `S3Processor`, `OsProcessor`, `AuditLogProcessor`). Each contributes a **slice** of helpers onto the effective transformer context (`ctx.putRecord`, `ctx.copyFile`, etc. — see `writingTransformers.md`). TypeScript rejects:
  - an empty `processors` array, and
  - combinations whose slices share a key (e.g. `[DdbProcessor, OsProcessor]` — both contribute `putRecord`/`querySourceRecord`/`queryTargetRecord`).

## Builder methods

All methods return `this` (chainable) except `.build()`.

| Method | Signature | Behavior |
| --- | --- | --- |
| `.filter(filter)` | `(filter: Filter<TRecord>) => this` | Adds a filter. Multiple calls AND-compose — order across calls doesn't matter, all must pass. |
| `.use(transformer)` | `(t: Transformer \| readonly Transformer[]) => this` | Adds one transformer or an array (spread in order). Execution order = registration order; arrays and single calls can mix freely. |
| `.blackhole(condition?)` | `(condition?: () => boolean) => this` | Observe-only mode: filters/transformers/`onEnd` still run, but every emitted command for this pipeline is discarded — nothing lands on the target. `condition` is evaluated **immediately, synchronously**, at call time (not per-record); omit it to always blackhole. |
| `.beforeExecuteCommands(token)` | `(token: Abstraction<Hook.Interface>) => this` | Registers a DI-resolved hook to run once per merge group **before** any shard runs. |
| `.afterExecuteCommands(token)` | `(token: Abstraction<Hook.Interface>) => this` | Registers a DI-resolved hook to run once **after** all shards in the merge group succeed. Skipped if any shard fails. |
| `.build()` | `() => Promise<Pipeline<TRecord, TContext, TShard>>` | **Async** — snapshots the builder into an immutable `Pipeline`. Always `await` it before passing to `runner.register(...)`. |

### `.build()` is async — always `await` it

Every built-in preset does `await factory.create({...}).build()` inside an `async configure(...)`. This is easy to miss since older example code sometimes omits `await` — don't copy that pattern:

```typescript
async configure({ runner, pipelineBuilderFactory: factory }) {
    const everything = await factory
        .create({ name: "Regular DynamoDB Table Data", scanner: DdbScanner, processors: [DdbProcessor] })
        .build();

    runner.register(everything);
}
```

`.build()` is async because it resolves and applies any `PipelineCustomizer`s registered against this pipeline's `name` before finalizing it (see `pipeline-customizer.md`).

### `runner.register(...pipelines)`

```typescript
register(...pipelines: Pipeline<any, any, any>[]): this
```

Variadic and chainable — heterogeneous pipelines (different scanners/processors) can be registered in one call: `runner.register(p1, p2, p3)`.

## Filters

Use `createFilter` with a built-in predicate or an inline function:

```typescript
import { createFilter, isFmFile, isCmsEntry, byType } from "@webiny/data-transfer";

.filter(createFilter(isFmFile))
.filter(createFilter(isCmsEntry))
.filter(createFilter(byType("cms.model")))
.filter(createFilter(r => r.TYPE === "cms.entry" && r.modelId === "article")) // inline
```

Full predicate reference (all 18 built-ins): see `filters.md`.

## First-match-wins dispatch

Pipelines sharing the same `scanner` type run as a **merge group**. The scanner scans once; each record is offered to every pipeline in the group **in registration order**. The first pipeline whose filters all pass claims the record — no other pipeline in the group sees it.

```typescript
async configure({ runner, pipelineBuilderFactory: factory }) {
  const articles = await factory
    .create({ name: "articles", scanner: DdbScanner, processors: [DdbProcessor] })
    .filter(createFilter(r => r.TYPE === "cms.entry" && r.modelId === "article"))
    .use(migrateArticle)
    .build();

  const rest = await factory
    .create({ name: "rest", scanner: DdbScanner, processors: [DdbProcessor] })
    .build(); // no filter → catches everything articles doesn't

  runner.register(articles, rest); // order is load-bearing: articles MUST come first
}
```

Swap the registration order and `articles` never fires — `rest` (unfiltered) claims everything first.

**Records matching no pipeline in any merge group are silently dropped** (not written to target) — see `pipeline-runtime.md` for the unmatched-record logging.

## Hooks (`beforeExecuteCommands` / `afterExecuteCommands`)

These accept a **DI abstraction token**, not an inline callback — the runner resolves the token from the container and calls `.run({ runId, mergeGroupId })` on the resolved instance:

```typescript
interface Hook {
    run(params: { runId: string; mergeGroupId: string }): Promise<void>;
}
```

To use one, define an implementation and register it via `Abstraction.createImplementation({ implementation, dependencies })` (the same pattern used throughout the codebase for `BeforeTransferHook`/`AfterTransferHook`), register the resulting token in your `config.register` callback, then pass the abstraction token itself to the builder:

```typescript
.beforeExecuteCommands(MyHookToken)
.afterExecuteCommands(MyHookToken)
```

**Caveat:** the base `Hook` abstraction (`src/domain/pipeline/abstractions/Hook.ts`) that these methods are typed against is **not currently re-exported from the public `@webiny/data-transfer` package root** — only the higher-level `BeforeTransferHook`/`AfterTransferHook` (whole-transfer lifecycle, registered via `config.register`) and `BeforeLoadPresetHook`/`AfterLoadPresetHook` are public. In practice, reach for those transfer-lifecycle hooks (documented in `configReference.md`) for cross-cutting setup/teardown; treat per-pipeline `.beforeExecuteCommands()`/`.afterExecuteCommands()` as an advanced/internal extension point until `Hook` is added to the public surface.

## Zero-transformer preset (pure data copy)

No transformer is required — a pipeline with only a scanner + processor(s) copies records verbatim:

```typescript
import { createTransferPreset, DdbScanner, DdbProcessor } from "@webiny/data-transfer";

export default createTransferPreset({
  name: "copy",
  description: "Copy every record verbatim.",
  async configure({ runner, pipelineBuilderFactory: factory }) {
    const copyAll = await factory
      .create({ name: "copy-all", scanner: DdbScanner, processors: [DdbProcessor] })
      .build(); // no .filter → accepts all; no .use → no transformations

    runner.register(copyAll);
  }
});
```

`DdbProcessor` (and `OsProcessor`) auto-emit a `PutRecord` for `ctx.record` in their `onEnd` hook — pure-passthrough pipelines still produce writes without you calling `ctx.putRecord()` explicitly. `S3Processor` has no `onEnd`; file copies must be emitted explicitly via a transformer calling `ctx.copyFile(...)` (see `copyFileToTarget` in `writingTransformers.md`).

## Real example: extending a built-in pipeline's transformer chain

```typescript
import {
  createTransferPreset,
  DdbScanner,
  DdbProcessor,
  createFilter,
  isCmsEntry,
  addLiveField,
  replaceFileUrls,
  MigrationConfig
} from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

export default createTransferPreset({
  name: "my-v5-to-v6-ddb",
  description: "v5-to-v6-ddb plus a custom stamp on every CMS entry.",
  async configure({ runner, pipelineBuilderFactory, container }) {
    const config = container.resolve(MigrationConfig);
    const cmsEntries = await pipelineBuilderFactory
      .create({ name: "CmsEntries", scanner: DdbScanner, processors: [DdbProcessor] })
      .filter(createFilter(isCmsEntry))
      .use(addLiveField)
      .use(replaceFileUrls(config)) // factory — takes the resolved MigrationConfig, needs config.fileUrls set
      .use(stampMigratedAt)
      .build();

    runner.register(cmsEntries);
    // ...register any additional pipelines this preset needs.
  }
});
```

Prefer `PipelineCustomizer` (see `pipeline-customizer.md`) to patch a single pipeline of a built-in preset instead of re-registering all of its pipelines by hand — it's the supported extension point for "built-in preset + a few extra transformers."

## Conditional blackholing using the resolved config

Built-in presets use `container.resolve(MigrationConfig)` plus `.blackhole(condition)` to make a pipeline's disposition depend on the parsed config, evaluated once at `configure()` time:

```typescript
async configure({ runner, pipelineBuilderFactory: factory, container }) {
  const config = container.resolve(MigrationConfig);

  const auditLogs = await factory
    .create({ name: "AuditLogs", scanner: DdbScanner, processors: [AuditLogProcessor] })
    .filter(createFilter(isAuditLogEntry))
    .use(auditLogTransformers)
    .blackhole(() => !config.target.auditLog?.dynamodb?.tableName)
    .build();

  runner.register(auditLogs);
}
```

## Built-in presets

Select by `name` when the wizard asks "Which preset do you want to run?" (or pass `--preset=<name>`):

| Name | Description |
| --- | --- |
| `v5-to-v6-ddb` | Full Webiny v5 → v6 migration of the primary DynamoDB table (CMS, File Manager, Security, Mailer, Folders, Audit Logs) |
| `v5-to-v6-os` | Migration of the OpenSearch companion DynamoDB table. Run **after** `v5-to-v6-ddb` |
| `copy-ddb` | Verbatim DynamoDB + S3 copy, no transformations |
| `copy-os` | Verbatim OpenSearch companion table copy, no transformations |
| `copy-files` | S3-only file copy |

Custom presets placed in `pipeline.presetsDir` are listed alongside these five. Source: `src/presets/`.
