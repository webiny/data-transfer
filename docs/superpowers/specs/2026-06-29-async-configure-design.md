# Async PipelineCustomizer.configure + config.ts register examples

## Part 1: Async configure

### Interface change

`PipelineCustomizer.Interface.configure()` return type widens from `void` to `void | Promise<void>`.

File: `src/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts`

### Build propagation

`PipelineBuilder.build()` becomes `async build()` returning `Promise<Pipeline<TRecord, TContext, TShard>>`.

The `for` loop at line ~125-133 that calls `customizer.configure(custBuilder)` adds `await`.

File: `src/domain/pipeline/PipelineBuilder.ts`

### Call sites (23 total)

Every `.build()` call in presets and tests gains `await`. These are all inside `preset.configure()` callbacks which already accept `void | Promise<void>` — no further propagation needed.

Files:
- `src/presets/copy-ddb.ts`
- `src/presets/copy-os.ts`
- `src/presets/copy-files.ts`
- `src/presets/v5-to-v6-ddb.ts`
- `src/presets/v5-to-v6-os.ts`
- `templates/presets/example.ts`
- Any test files that call `.build()`

### Backwards compatibility

Existing sync customizers continue to work — returning `void` satisfies `void | Promise<void>`. No breaking change.

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

The "How it works" section updates to describe the `register` hook instead of `setup.ts`. The `register` callback runs before preset loading — same timing guarantee.

### AGENTS.md

Update the user-side custom DI reference in section 1 ("Project at a glance") to mention `register` in config as the primary registration path. `setup.ts` remains supported but is the secondary option.

### Other doc files

Any extracted doc files from the restructure that mention `setup.ts` registration update to show `register` as primary.
