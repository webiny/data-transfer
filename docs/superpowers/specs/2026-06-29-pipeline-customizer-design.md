# Pipeline Customizer

**Date:** 2026-06-29
**Status:** Design approved

## Problem

Users running built-in presets (e.g., `v5-to-v6-ddb`) need to extend specific
pipelines — add filters to narrow which records a pipeline processes, add
transformers for custom post-processing — without forking the preset. Today,
the only option is to copy the entire preset and modify it, which means losing
future updates to the built-in preset.

A secondary need: transformers that query source/target DynamoDB to decide
whether a record should be written. Since filters are synchronous and don't
have access to the transform context (no `querySourceRecord`/`queryTargetRecord`),
the user needs async transformer-level logic that can suppress writes for
individual records.

## Solution

Two changes:

1. **PipelineCustomizer** — a DI abstraction that users implement to extend
   pipelines by name. Registered in `setup.ts`, discovered by
   `PipelineBuilderFactory` via `{ multiple: true }`, and applied inside
   `PipelineBuilder.build()`.

2. **`ctx.blackhole()`** — a per-record method on `BaseTransformContext` that
   marks the current record for blackholing. Commands are discarded for this
   record, but the remaining transformer chain and `onEnd` hooks still run.

## PipelineCustomizer

### Abstraction

```
src/features/PipelineCustomizer/
├── abstractions/
│   ├── PipelineCustomizer.ts    # Interface + abstraction token + namespace
│   └── index.ts                 # const token re-export
└── index.ts                     # Public re-export
```

```typescript
interface IPipelineCustomizer {
    readonly name: string;
    canUse(pipelineName: string): boolean;
    configure(builder: PipelineCustomizer.Builder): void;
}

const PipelineCustomizer = createAbstraction<IPipelineCustomizer>("Core/PipelineCustomizer");

namespace PipelineCustomizer {
    type Interface = IPipelineCustomizer;
    type Builder = IPipelineCustomizerBuilder;
}
```

`createAbstraction` returns an `Abstraction<T>` object from `@webiny/di`.
That object exposes `.createImplementation()` at runtime — so
`PipelineCustomizer.createImplementation({...})` works because the call
targets the `Abstraction` instance method, while the merged `namespace`
contributes only the type-level members (`Interface`, `Builder`).

- `name` — human-readable identifier used in the unmatched-customizer
  warning. Avoids reliance on `constructor.name` (unreliable under
  minification).
- `canUse(pipelineName)` — returns `true` for any pipeline the customizer
  wants to extend. Can target multiple pipelines.
- `configure(builder)` — receives a slim builder with `.filter()` and `.use()`
  only. Appends filters and transformers.

### Slim builder

```
src/domain/pipeline/PipelineCustomizerBuilder.ts
```

```typescript
interface IPipelineCustomizerBuilder {
    filter(filter: Filter<any>): this;
    use(transformer: Transformer.Interface<any> | readonly Transformer.Interface<any>[]): this;
}
```

Plain class, not a DI abstraction. Instantiated internally by `PipelineBuilder.build()`.
Collects filters and transformers into arrays that the builder reads after
`configure()` returns.

Not exported as a constructor — users interact via `PipelineCustomizer.Builder` type.

**Type erasure trade-off:** the slim builder uses `any` for both `Filter` and
`Transformer.Interface` type parameters. Pipeline names are runtime strings, so
the builder cannot know the pipeline's concrete `TRecord` / `TContext` types at
compile time. Users writing transformers that call slice helpers (e.g.,
`ctx.queryTargetRecord`) on a pipeline that does not provide that slice will
get a runtime error, not a compile-time error. This is a deliberate trade-off
— the alternative (exposing pipeline generics to customizers) would require
users to import internal pipeline type parameters, defeating the decoupling
goal.

### DI wiring

**`PipelineBuilderFactoryImpl`** gains a third constructor parameter:
`customizers: PipelineCustomizer.Interface[]`. The dependency list becomes:

```typescript
dependencies: [
    [Processor, { multiple: true }],
    [Scanner, { multiple: true }],
    [PipelineCustomizer, { multiple: true }]
]
```

The factory passes the customizer array to each `PipelineBuilder` it creates.

**`PipelineBuilder`** gains a new constructor parameter:
`customizers: readonly PipelineCustomizer.Interface[]` (added to
`PipelineBuilderConfig`). The builder stores the array and consumes it in
`build()`. No other `PipelineBuilder` API changes.

**`PipelineBuilderFactory` abstraction interface** gains one method:

```typescript
warnUnmatchedCustomizers(logger: Logger.Interface): void;
```

The factory tracks a `Set<number>` of consumed customizer indices. Each
`build()` call that finds `canUse(name) === true` adds that customizer's
index to the set. `warnUnmatchedCustomizers` iterates the customizer array
and logs a warning for each index not in the set.

### Application point

`PipelineBuilder.build()`:

1. Iterates all customizers.
2. For each customizer where `canUse(this.name)` returns `true`:
   - Creates a fresh `PipelineCustomizerBuilder`.
   - Calls `customizer.configure(builder)`.
   - Appends the builder's accumulated filters after the preset's filters.
   - Appends the builder's accumulated transformers after the preset's transformers.
3. Constructs the `Pipeline` with the merged lists.

Multiple customizers targeting the same pipeline are applied in registration
order (array order from `{ multiple: true }`).

### Unmatched customizer warning

After `preset.configure()` completes and all pipelines are registered, the
system checks which customizers never matched any pipeline name. For each
unmatched customizer, a warning is logged:

```
PipelineCustomizer "SkipUnwantedModels" did not match any registered pipeline
```

This catches typos (e.g., `"CmsEntry"` instead of `"CmsEntries"`). The
transfer proceeds — it does not throw.

The warning uses the customizer's `name` property (an explicit field on
`IPipelineCustomizer`, not `constructor.name` — avoids minification issues).

The check lives in `PipelineBuilderFactory`. The factory tracks which
customizer indices were consumed (i.e., `canUse()` returned `true` for at
least one `build()` call). After `preset.configure()` returns, the run
handler (`src/commands/run/handler.ts`) resolves the factory from the
container and calls `factory.warnUnmatchedCustomizers(logger)`, which logs
a warning for each customizer that was never consumed.

### Lifecycle order

1. `bootstrap()` — registers all features (including the `PipelineCustomizer`
   abstraction token).
2. `setup.ts` — user registers customizer implementations via
   `container.register(...)`. This completes before step 3 — the ordering is
   what makes customizers available to the factory during `build()`.
3. `preset.configure()` — preset calls `factory.create(...).filter(...).use(...).build()`.
4. Inside each `build()` — customizers whose `canUse(name)` returns `true` get
   their `configure(builder)` called, appending to the pipeline.
5. After `preset.configure()` — the run handler calls
   `factory.warnUnmatchedCustomizers(logger)` for any customizer that was
   never consumed.

### User-land example

```typescript
// projects/my-project/setup.ts
import {
    initDataTransfer,
    PipelineCustomizer,
    createFilter,
    createDdbTransformer
} from "@webiny/data-transfer";

class SkipUnwantedModels implements PipelineCustomizer.Interface {
    public readonly name = "SkipUnwantedModels";

    public canUse(pipelineName: string): boolean {
        return pipelineName === "CmsEntries";
    }

    public configure(builder: PipelineCustomizer.Builder): void {
        builder
            .filter(createFilter(record => record.modelId !== "unwantedModel"))
            .use(createDdbTransformer("skipExisting", async (ctx) => {
                const existing = await ctx.queryTargetRecord(ctx.record.PK, ctx.record.SK);
                if (existing.length > 0) {
                    ctx.blackhole();
                }
            }));
    }
}

const SkipUnwantedModelsCustomizer = PipelineCustomizer.createImplementation({
    implementation: SkipUnwantedModels,
    dependencies: []
});

export default initDataTransfer(async ({ container }) => {
    container.register(SkipUnwantedModelsCustomizer);
});
```

## Per-record `ctx.blackhole()`

### On `BaseTransformContext.Interface`

Two additions to the interface (`IBaseTransformContext`):

- `blackhole(): void` — marks this record for blackholing. Irreversible within
  the record's lifecycle.
- `readonly isBlackholed: boolean` — read-only flag, checked by the runner.

### On `BaseTransformContextFactory`

The factory (`src/features/TransformContext/BaseTransformContextFactory.ts`)
creates the concrete context object returned by `.create()`. Changes:

- Initialize `isBlackholed: false` on the concrete object.
- Implement `blackhole()` as a method that sets the internal flag to `true`.
- Expose `isBlackholed` as a getter that reads the internal flag.

### Runner change in `runRecord`

After transformers + `onEnd` hooks complete, the existing pipeline-level
blackhole check expands:

```typescript
if (pipeline.isBlackhole || ctx.isBlackholed) {
    return new RecordDisposition.Blackholed(pipeline.name);
}
```

### Semantics

- Remaining transformers and `onEnd` hooks still run after `ctx.blackhole()`
  is called — same semantics as pipeline-level blackhole. Side effects
  (cache population, logging) are preserved.
- All commands emitted for this record are discarded at the fold step.
- The record appears in blackholed logs and snapshot output.
- No undo — once called, the record is blackholed.

## Public API additions

Exports added to `src/index.ts`:

- `PipelineCustomizer` — abstraction token + namespace (`Interface`, `Builder`).

`ctx.blackhole()` and `ctx.isBlackholed` are on `BaseTransformContext.Interface`
which is already part of the exported context type aliases — no new export needed.

## Ordering

- User filters are AND'd after the preset's filters. Because `Pipeline.accepts()`
  short-circuits on the first failing filter, preset filters run first — if they
  reject, user filters never execute. The final boolean result is the same
  regardless of order (AND is commutative), but performance benefits from
  running the cheaper preset filters first.
- User transformers run after the preset's transformers.
- Multiple customizers targeting the same pipeline apply in registration order.
- Users cannot reorder, remove, or replace the preset's own filters/transformers.

**Implementation note:** the existing JSDoc on `PipelineBuilder.filter()`
("Order across `.filter()` calls does NOT matter") must be revised to clarify
it applies to intra-builder ordering only. Customizer filters always append
after preset filters at `build()` time.

## Limitations

The customizer cannot change:

- Scanner or processors (pipeline identity).
- Hook tokens (`beforeExecuteCommands`, `afterExecuteCommands`).
- Pipeline-level blackhole.
- Registration order of pipelines in the runner.

For any of these, write a custom preset.

## Available pipeline names (built-in presets)

### `v5-to-v6-ddb`

MigrationRecords, AuditLogs, AcoSearchRecordsPage, ContentModelGroups,
BackgroundTasks, FileManagerSettings, FileManagerFiles, MailerSettings,
SecurityGroups, SecurityTeams, CmsModels, FolderPermissions, CmsEntries,
AdminUsers, FormBuilderRecords.

### `v5-to-v6-os`

Consult `src/presets/v5-to-v6-os.ts` for current names — the OS preset
mirrors the DDB preset's pipeline structure with OS-specific transformers.

### `copy-ddb`, `copy-os`, `copy-files`

Each has a single catch-all pipeline. Consult the respective preset file.

## Testing

- Unit test: `PipelineCustomizerBuilder` accumulates filters and transformers.
- Unit test: `PipelineBuilder.build()` appends customizer contributions.
- Unit test: `canUse` filtering — only matching customizers apply.
- Unit test: multiple customizers on the same pipeline, registration order.
- Unit test: unmatched customizer warning (spy on logger).
- Unit test: `ctx.blackhole()` sets `isBlackholed`, runner discards commands.
- Integration test: end-to-end with a customizer registered in a test container.
