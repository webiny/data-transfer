# Async PipelineCustomizer.configure + config.ts register examples

## Part 1: Async configure

### Interface change

`PipelineCustomizer.Interface.configure()` return type widens from `void` to `void | Promise<void>`.

File: `src/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts`

### Build propagation

`PipelineBuilder.build()` becomes `async build()` returning `Promise<Pipeline<TRecord, TContext, TShard>>`.

The `for` loop at lines 125-133 that calls `customizer.configure(custBuilder)` adds `await`.

File: `src/domain/pipeline/PipelineBuilder.ts`

### Preset configure functions must become async

Every preset's `configure()` currently returns `void`. Since `.build()` is now async and must be awaited inside `configure()`, each preset's `configure()` must become `async configure(...)`. The `MigrationPreset.configure` type already accepts `void | Promise<void>`, so no type-level change is needed — but the implementation signatures in each preset file change from `: void` to `async ... : Promise<void>`.

### Call site rewrite pattern

`.build()` now returns `Promise<Pipeline<...>>`. The common pattern `runner.register(builder.build())` must be split into two statements:

```typescript
// Before:
runner.register(builder.build());

// After:
const pipeline = await builder.build();
runner.register(pipeline);
```

Alternatively: `runner.register(await builder.build())`. Either form works. When multiple pipelines are built and registered together, each `.build()` must be awaited before passing to `runner.register()`.

**Sync `.toThrow()` assertions break silently.** Any test using `expect(() => runner.register(builder.build())).toThrow(...)` must be rewritten — the sync arrow receives a Promise, not a thrown error, so the assertion passes vacuously. Rewrite to:

```typescript
await expect(async () => runner.register(await builder.build())).rejects.toThrow(...);
```

Known site: `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` line 100.

### Source files

- `src/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts` — interface return type
- `src/domain/pipeline/PipelineBuilder.ts` — `build()` becomes async
- `src/presets/copy-ddb.ts` — async configure + await build
- `src/presets/copy-os.ts` — async configure + await build
- `src/presets/copy-files.ts` — async configure + await build
- `src/presets/v5-to-v6-ddb.ts` — async configure + await build (multiple pipelines)
- `src/presets/v5-to-v6-os.ts` — async configure + await build (multiple pipelines)
- `templates/presets/example.ts` — async configure + await build
### Test files

Test files that call `.build()` must also be updated. This includes making `it()` callbacks async and making any helper functions that call `.build()` async (with their callers awaiting them).

Exhaustive list:
- `__tests__/domain/pipeline/PipelineBuilder.test.ts` — many call sites; non-async `it()` blocks become async
- `__tests__/features/PipelineRunner/PipelineRunner.test.ts` — multiple call sites + helper functions that return `.build()` must become async
- `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`
- `__tests__/features/PipelineRunner/PipelineRunner.droppedLog.test.ts`
- `__tests__/features/PipelineRunner/PipelineRunner.shard.test.ts`
- `__tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts`
- `__tests__/features/PipelineBuilderFactory/PipelineBuilderFactory.test.ts`
- `__tests__/features/PipelineBuilderFactory/PipelineBuilderFactoryCustomizer.test.ts` — 6 call sites
- `__tests__/integration/pipeline.dataTransfer.test.ts`
- `__tests__/integration/pipeline.snapshot.test.ts`
- `__tests__/integration/pipeline.bulkAndRetry.test.ts`
- `__tests__/integration/pipeline.realData.test.ts`

### Backwards compatibility

Existing sync customizers continue to work — returning `void` satisfies `void | Promise<void>`. No breaking change for customizer authors. Preset authors who call `.build()` must add `await`.

## Part 2: Doc examples use config.ts register hook

### Pipeline customizer guide

`docs/guides/pipeline-customizer.md`: all examples switch from `setup.ts` + `initDataTransfer` pattern to `config.ts` + `register` hook pattern:

```typescript
export default createConfig({
  // ...source, target, pipeline...
  register: async (container) => {
    container.register(SkipUnwantedModelsCustomizer);
  }
});
```

The "How it works" section updates to describe the `register` hook instead of `setup.ts`. The `register` callback runs before preset loading — same timing guarantee. `setup.ts` remains supported but is the secondary option.

### Doc files that reference setup.ts as primary

All of these must update to show `register` in `config.ts` as the primary registration path, with `setup.ts` as the secondary/alternative:

- `docs/guides/pipeline-customizer.md` — quick start example + "How it works" section
- `docs/public-api.md` — `initDataTransfer` / `setup.ts` references (lines 24-25, 31)
- `docs/hard-won-decisions.md` — "User-side custom DI via `setup.ts`" entry + PipelineCustomizer entry
- `docs/project-structure.md` — `PipelineCustomizer.Interface in setup.ts` reference
- `AGENTS.md` — section 1 user-side custom DI reference

### Source code comments that reference setup.ts

- `src/domain/transform/Preset.ts` — line 12 JSDoc: "custom services registered via `setup.ts`" → update to mention `register` in config as primary
- `templates/presets/example.ts` — line 20 comment: "registered via a sibling `setup.ts`" → update to mention `register` in config as primary
- `templates/projects/example/setup.ts` — template file scaffolded into user projects; update to mention `register` in config as the primary path

### Note on config.register

`config.register` exists in the codebase (`registerSchema` in `src/features/MigrationConfig/schemas/shared.schema.ts`, called in `handler.ts` lines 95-97) but currently has no user-facing documentation. The pipeline-customizer guide update is the primary place to document it. `docs/public-api.md` should also add `register` to the config builder description.
