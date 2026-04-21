# Runner-Centric Pipeline Builder — Design

**Date:** 2026-04-20
**Author:** Bruno Zorić (design), Claude (drafting)

## Goal

Move pipeline construction onto the `PipelineRunner`. Drop the `createPipeline` / `createDdbPipeline` / `createOsPipeline` factory triad. Provide type inference from the scanner + processor pair so users never write generics. Make `.build()` an explicit, type-enforced step that returns an immutable `Pipeline` accepted by a variadic `runner.register(...)`.

## Motivation

Current API forces users through three friction points:

```typescript
// Today — three steps + manual wiring
import { createDdbPipeline, DdbScanner, DdbProcessor } from "@webiny/data-transfer";

export const myPipeline = createDdbPipeline("name", builder => {
    builder.filter(createFilter(byType("foo"))).use(myTransformer);
});

// In the preset:
configure(runner) {
    myPipeline.register(runner, DdbScanner, DdbProcessor);
}
```

Three problems:
1. **Three near-identical factory functions** (`createPipeline` / `createDdbPipeline` / `createOsPipeline`) — users guess which to use.
2. **Scanner / processor passed at register time, not construction time** — TS can't infer record/context types until register, so `builder.filter()` and `builder.use()` see `unknown`.
3. **`.build()` is hidden inside the factory closure** — users can't introspect or hold the built pipeline; the API forces a configure-callback pattern.

## End shape

```typescript
import type { MigrationPreset } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor, createFilter } from "@webiny/data-transfer";

export const v5ToV6Preset: MigrationPreset = {
    name: "example",
    description: "...",
    configure(runner) {
        const fileSettingsPipeline = runner
            .pipeline({ name: "FileSettings", scanner: DdbScanner, processor: DdbProcessor })
            .filter(createFilter(byType("fm.settings")))
            .use(wrapInData)
            .use(migrateFileManagerSettings)
            .filter(createFilter(oneMoreFilter))
            .use(removeAttributes)
            .build();

        const filePipeline = runner
            .pipeline({ name: "Files", scanner: DdbScanner, processor: DdbProcessor })
            .filter(createFilter(isCmsEntry))
            .filter(createFilter(isFmFile))
            .use(wrapInData)
            .use(addGsiTenant)
            .build();

        runner.register(fileSettingsPipeline, filePipeline);
    }
};
```

User-visible changes:
- One factory: `runner.pipeline({...})`.
- Inferred record + context types: `.filter()` / `.use()` know what they receive.
- `.filter()` callable any number of times, AND-composed regardless of position.
- `.use()` calls preserve insertion order; transformers run in that order.
- Explicit `.build()` returns an immutable `Pipeline`.
- Variadic `runner.register(p1, p2, ...): this`.

## Decisions (grilled with user)

| # | Decision | Rationale |
|---|---|---|
| 1 | Internal v5-to-v6 pipelines + presets get deleted (out of scope for the new API) | Per "transformers + presets are user-land examples"; don't migrate dead-end consumers |
| 2 | Two classes: `PipelineBuilder` (mutable) + `Pipeline` (frozen). `.build()` returns `Pipeline`. `runner.register` only accepts `Pipeline`. | Type-enforced immutability; no runtime freeze checks scattered through builder methods; new builder methods don't need to remember the freeze pattern |
| 3 | `runner.register(p1, p2, ...): this` — variadic + chainable | Spread (`runner.register(...arr)`) handles dynamic arrays; one signature, fewer overloads |
| 4 | Duplicate pipeline name → throw immediately | Names matter for hook dedup + log identification; collision = bug |
| 5 | Keep `.beforeExecuteCommands` / `.afterExecuteCommands` on the builder | Will be used in the final product per user direction |
| 6 | Type inference: parameterize on `<TRecord, TContext, TShard>`; constrain inputs via `ScannerImpl<TRecord, TShard>` + `ProcessorImpl<TRecord, TContext>` | TS unifies `TRecord` across scanner + processor; mismatched pairs (e.g., `DdbScanner` + `OsProcessor`) fail at compile time |

## API surfaces

### `PipelineRunner.pipeline()` — new factory entry point

```typescript
// src/features/PipelineRunner/abstractions/PipelineRunner.ts

import type { Constructor, Abstraction } from "@webiny/di";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";

type ScannerImpl<TRecord, TShard> = Constructor<Scanner.Interface<TRecord, TShard>> & {
    __abstraction: Abstraction<unknown>;
};

type ProcessorImpl<TRecord, TContext extends Processor.Context> =
    Constructor<Processor.Interface<TRecord, TContext>> & {
        __abstraction: Abstraction<unknown>;
    };

export interface PipelineFactoryInput<TRecord, TContext extends Processor.Context, TShard> {
    name: string;
    scanner: ScannerImpl<TRecord, TShard>;
    processor: ProcessorImpl<TRecord, TContext>;
}

interface IPipelineRunner {
    pipeline<TRecord, TContext extends Processor.Context, TShard>(
        input: PipelineFactoryInput<TRecord, TContext, TShard>
    ): PipelineBuilder<TRecord, TContext, TShard>;

    register(...pipelines: Pipeline<unknown, Processor.Context, unknown>[]): this;

    run(opts?: RunOptions): Promise<void>;

    getProcessors(): Processor.Interface<unknown, Processor.Context>[];
}
```

The `__abstraction` marker on the constructor types is what `@webiny/di` adds via `Abstraction.createImplementation`. We use it as a "this is an Implementation, not a plain Constructor" tag.

`runner.register` is variadic over `Pipeline<unknown, Processor.Context, unknown>` — the variance is intentional: a runner holds heterogeneous pipelines (different record/context types per pipeline). Internally it iterates them generically.

### `PipelineBuilder<TRecord, TContext, TShard>`

Lives in `src/domain/pipeline/PipelineBuilder.ts`. Methods:

```typescript
class PipelineBuilder<TRecord, TContext extends Processor.Context, TShard> {
    constructor(input: PipelineBuilderConfig<TRecord, TContext, TShard>);

    /** Add one filter. Order across .filter() calls does NOT matter — all filters are AND-composed at build time. */
    filter(filter: Filter<TRecord>): this;

    /** Add one transformer. Order ACROSS .use() calls is preserved at execution time. */
    use(transformer: Transformer.Interface<TContext>): this;

    /** Register a hook that fires once before the merge group's shards run. */
    beforeExecuteCommands(token: Abstraction<Hook.Interface>): this;

    /** Register a hook that fires once after all merge group shards complete. */
    afterExecuteCommands(token: Abstraction<Hook.Interface>): this;

    /** Snapshot the builder into an immutable Pipeline. The builder may be discarded after this. */
    build(): Pipeline<TRecord, TContext, TShard>;
}
```

Behaviors:

- `.filter(filter)` accepts a single `Filter<TRecord>`. Multiple calls allowed; all collected, AND-composed in `.build()`.
- `.use(transformer)` accepts a single `Transformer.Interface<TContext>`. Multiple calls accumulate in declared order. The transformer's parameter type matches `TContext` — TS catches mismatched-context errors at the call site.
- `.beforeExecuteCommands` / `.afterExecuteCommands`: signatures unchanged from today.
- `.build()`: returns a frozen `Pipeline`. The builder remains intact (could be re-`.build()`ed if desired) — there's no hard prohibition, but the produced Pipeline is the contract.

The current builder behavior — `.filter()` throwing on second call — is **removed**. Multi-`.filter()` is the new norm.

### `Pipeline<TRecord, TContext, TShard>`

Lives in `src/domain/pipeline/Pipeline.ts`. Read-only interface that the runner consumes. No mutation methods. Same shape as today's `Pipeline` class — already exists.

### `runner.register(...pipelines)`

```typescript
register(...pipelines: Pipeline<any, Processor.Context, any>[]): this {
    for (const pipeline of pipelines) {
        if (this.registeredNames.has(pipeline.name)) {
            throw new Error(
                `PipelineRunner: pipeline name "${pipeline.name}" is already registered. ` +
                `Names must be unique within a runner.`
            );
        }
        this.registeredNames.add(pipeline.name);
        // ... existing register logic ...
    }
    return this;
}
```

Returns `this` to allow chaining (`runner.register(a, b).register(c)`). Throws on the first duplicate name encountered (does not partially-register the rest of the args).

## Type inference details

User writes:

```typescript
runner.pipeline({ name: "X", scanner: DdbScanner, processor: DdbProcessor })
```

TS unification:

1. `DdbScanner` instance type is `DdbScannerImpl` which is `Scanner.Interface<BaseRecord, DdbShard>`.
2. `DdbProcessor` instance type is `DdbProcessorImpl` which is `Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>`.
3. `runner.pipeline<TRecord, TContext, TShard>(...)` constrains:
   - `scanner: ScannerImpl<TRecord, TShard>` → `TRecord = BaseRecord`, `TShard = DdbShard`.
   - `processor: ProcessorImpl<TRecord, TContext>` → `TRecord = BaseRecord` (must agree), `TContext = DdbTransformContext.Interface<BaseRecord>`.
4. Returns `PipelineBuilder<BaseRecord, DdbTransformContext.Interface<BaseRecord>, DdbShard>`.
5. `.filter()` then expects `Filter<BaseRecord>`; `.use()` expects `Transformer.Interface<DdbTransformContext.Interface<BaseRecord>>`.

Mismatched pairs fail at the `pipeline({...})` call:

```typescript
runner.pipeline({ name, scanner: DdbScanner, processor: OsProcessor });
//                                            ^^^^^^^^^^^
// Type 'OsProcessor' is not assignable to type 'ProcessorImpl<BaseRecord, ...>'.
//   The instance type of OsProcessor is Processor.Interface<OsRecord, ...>,
//   but TRecord was inferred as BaseRecord from the scanner.
```

Runtime extraction of the abstraction token (for DI resolution) uses `new Metadata(impl).getAbstraction()` — same as the existing `resolveAbstraction` helper in `createPipeline.ts`. Move that helper into `PipelineRunner` (or `PipelineBuilder`) since it's no longer needed externally.

## Public API delta (`src/index.ts`)

**Drop:**
- `createPipeline`
- `createDdbPipeline`
- `createOsPipeline`
- `PipelineDefinition` type

**Keep:**
- `createFilter`, `Filter` type
- `MigrationPreset` type
- Scanner/processor tokens (`DdbScanner`, `DdbProcessor`, `OsScanner`, `OsProcessor`)
- Context types (`BaseTransformContext`, `DdbTransformContext`, `OsTransformContext`)
- `Transformer` type
- Transformer factories (`createTransformer`, `createDdbTransformer`, `createOsTransformer`)
- Config builders, `loadEnv`

Users build pipelines exclusively through `runner.pipeline({...})` inside their `MigrationPreset.configure(runner)` callback.

## Files

**Modified:**
- `src/features/PipelineRunner/abstractions/PipelineRunner.ts` — `pipeline()` accepts Implementation classes (not just Abstractions) with strict generic inference; `register(...pipelines)` becomes variadic; duplicate-name guard added.
- `src/features/PipelineRunner/PipelineRunner.ts` — implements the new signatures; uses `Metadata.getAbstraction(impl)` to resolve the abstraction token internally.
- `src/domain/pipeline/PipelineBuilder.ts` — `.filter()` allows multiple calls (collects into a list); current "filter already called" guard removed.
- `src/index.ts` — drop `createPipeline` / `createDdbPipeline` / `createOsPipeline` / `PipelineDefinition` exports.

**Deleted:**
- `src/domain/pipeline/createPipeline.ts` (entire file).
- `src/domain/pipeline/createDdbPipeline.ts` (entire file).
- `src/domain/pipeline/createOsPipeline.ts` (entire file).
- `__tests__/domain/pipeline/createPipeline.*.test.ts` and friends.
- `src/presets/v5-to-v6/` (entire dir — 9 pipeline files).
- `src/presets/v5-to-v6-ddb.ts`, `src/presets/v5-to-v6-os.ts`.
- `__tests__/presets/v5-to-v6/` (entire dir).
- `__tests__/presets/*.test.ts` for the deleted presets.

**New:** none — all changes are modifications or deletions.

**Eventually-modified (cascading from the deletion above):**
- Any test that referenced the v5-to-v6 preset by name. The preset loader still resolves "v5-to-v6" / "v5-to-v6-os" by file path; deletion means those names won't resolve, which is fine because no test should depend on them after this refactor.
- `templates/presets/example.ts` — already uses the new API per the user's draft of `src/presets/example.ts`. Update the template to mirror.

## Testing strategy

- `__tests__/features/PipelineRunner/PipelineRunner.test.ts` — extend with cases for:
  - `runner.pipeline()` returns a builder with the correct inferred types (compile-time test via fixture file).
  - `runner.register(p1, p2)` registers both; duplicate name throws on second.
  - Variadic + chainable: `runner.register(p1).register(p2)` works.
- `__tests__/domain/pipeline/PipelineBuilder.test.ts` — extend with:
  - Multiple `.filter()` calls accumulate; AND-composition verified at execution.
  - `.use()` order preserved.
  - `.build()` returns a frozen `Pipeline`.
- New: `__tests__/domain/pipeline/PipelineBuilder.types.test-d.ts` (vitest type-test file) — verifies that mismatched scanner/processor pairs fail to compile, that `.use()` rejects wrong-context transformers, and that `.filter()` rejects wrong-record filters.

## Non-goals

- No changes to `Scanner`, `Processor`, `Transformer`, `Hook`, `Filter`, `Pipeline` core abstractions.
- No changes to executor split (just landed).
- No changes to the merge-group execution model.
- No new built-in transformers, presets, or pipelines.
- The "DdbProcessor handles file transfers" naming concern is **deferred** to a separate discussion.
- No CLI / config-builder changes.
- No changes to `runner.run()` or worker integration.

## Risk / open questions

- The `__abstraction` marker on the Implementation constructor is internal to `@webiny/di`. If `@webiny/di` ever changes the marker name, our type machinery breaks. **Mitigation**: a single `ScannerImpl<>` / `ProcessorImpl<>` type alias in `PipelineRunner.ts` localizes the dependency.
- Variadic-spread on `runner.register` could mask which pipeline failed if the duplicate-name check throws halfway through — error message must include both the offending name and the full list of args' names.
- Compile-time type-test files (`*.test-d.ts`) are vitest-specific; ensure they're picked up by the existing test config.
