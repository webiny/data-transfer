# PipelineBuilderFactory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pull `runner.pipeline({...})` off the runner into a dedicated `PipelineBuilderFactory`. Change `MigrationPreset.configure` signature to an object arg bag `{ runner, pipelineBuilderFactory, container }`.

**Architecture:** The factory is a stateless DI singleton with a `create({ name, scanner, processors }): PipelineBuilder` method. All type machinery (NonEmptyArray, DisjointKeys, MergeSlices, EffectiveContext, ScannerImpl, ProcessorImpl, SliceOf) moves from `PipelineRunner.abstractions` to `PipelineBuilderFactory.abstractions`. `runner.register(...)` stays on the runner. Hard break — no backward-compat.

**Precedent pattern:** `BaseTransformContextFactory` (in `src/features/TransformContext/`) — same shape: `.create()` method, stateless singleton, feature-registered in bootstrap.

---

## Task 1: Create PipelineBuilderFactory feature (additive)

Factory lives alongside the current `runner.pipeline()` — both work in parallel. Suite stays green.

**Files to create:**
- `src/features/PipelineBuilderFactory/abstractions/PipelineBuilderFactory.ts` — abstraction + namespace types. MOVES all the type machinery (NonEmptyArray, DisjointKeys, MergeSlices, EffectiveContext, ScannerImpl, ProcessorImpl, SliceOf, HasDuplicateSliceKeys, MergedTailKeys, UnionToIntersection, PipelineFactoryInput) here. Declare interface:
  ```typescript
  interface IPipelineBuilderFactory {
      create<TRecord, TShard, TProcessors extends ...>(
          input: PipelineFactoryInput<ScannerImpl<TRecord, TShard>, DisjointKeys<TProcessors>>
      ): PipelineBuilder<TRecord, EffectiveContext<TRecord, TProcessors>, TShard>;
  }
  ```
- `src/features/PipelineBuilderFactory/abstractions/index.ts` — re-export.
- `src/features/PipelineBuilderFactory/PipelineBuilderFactory.ts` — impl. `create()` body is identical to current `PipelineRunner.pipeline()` impl (Metadata.getAbstraction on scanner + processors, construct PipelineBuilder). No dependencies.
- `src/features/PipelineBuilderFactory/feature.ts` — `createFeature({ name: "Core/PipelineBuilderFactoryFeature", register(container) { container.register(PipelineBuilderFactory).inSingletonScope(); } })`.
- `src/features/PipelineBuilderFactory/index.ts` — re-export abstraction + feature.
- `__tests__/features/PipelineBuilderFactory/PipelineBuilderFactory.test.ts` — one test: resolve from container + create a builder + assert `.build()` works. Mirror the existing `PipelineBuilder.slices.test.ts` type-test file structure for the factory's `create()` call site.

**Files to modify:**
- `src/bootstrap.ts` — register `PipelineBuilderFactoryFeature` in BOTH DDB and OS mode containers.
- `__tests__/containers/ddb.ts` + `__tests__/containers/os.ts` — same.
- `src/features/PipelineRunner/abstractions/PipelineRunner.ts` — re-import the moved types from the factory abstraction file (or keep duplicates TEMPORARILY — cleaned up in Task 3).

**Verification:**
```
yarn format:fix && yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

**Commit:**
```
feat(pipeline-builder-factory): introduce DI-managed factory

Stateless singleton with .create({name, scanner, processors}) —
identical to runner.pipeline() but lives in its own feature.
Registered in both DDB and OS bootstrap containers.

Type machinery (NonEmptyArray, DisjointKeys, MergeSlices, etc.)
moved from PipelineRunner abstraction to the factory's abstraction.
PipelineRunner temporarily re-imports them — cleaned up in Task 3.
```

---

## Task 2: Change `MigrationPreset.configure` signature + wire CLI handlers

Hard break — every preset + every call site of `preset.configure(...)` updates together.

**Files to modify:**
- `src/domain/transform/Preset.ts` — change `MigrationPreset.configure` from `(runner) => void` to `(ctx: PresetConfigureContext) => void | Promise<void>`. Define:
  ```typescript
  interface PresetConfigureContext {
      runner: PipelineRunner.Interface;
      pipelineBuilderFactory: PipelineBuilderFactory.Interface;
      container: Container;
  }
  ```
  Allow Promise return so async presets work.
- `src/commands/run/handler.ts` — after setup.ts loads, resolve `pipelineBuilderFactory` + `container` + `runner` and pass all three to `preset.configure({ ... })`.
- `src/commands/processSegment/handler.ts` — same.
- `src/commands/processOsSegment/handler.ts` — same.
- `src/presets/example.ts` — rewrite configure signature to `{ runner, pipelineBuilderFactory, container }`. Use `pipelineBuilderFactory.create(...)` instead of `runner.pipeline(...)`.
- `templates/presets/example.ts` — same.
- `templates/README.md` — update the "Writing a preset" code block to show the new signature.

**Verification:** same as Task 1. Suite must still be green.

**Commit:**
```
refactor(preset): configure({runner, pipelineBuilderFactory, container})

Hard break: MigrationPreset.configure now takes an object arg bag.
Allows async returns. Extensible for future fields.

All preset.configure() call sites (run, processSegment,
processOsSegment handlers) pass the new arg bag. src/presets/example.ts
and templates/presets/example.ts updated to use pipelineBuilderFactory
.create(...). runner.pipeline() still works — removed in Task 3.
```

---

## Task 3: Remove `runner.pipeline()` + migrate remaining callers

**Files to modify:**
- `src/features/PipelineRunner/abstractions/PipelineRunner.ts` — drop `pipeline<...>(...)` method from `IPipelineRunner`. Keep `register`, `run`, `getProcessors`. Drop the type-machinery re-imports (now ONLY in `PipelineBuilderFactory.abstractions`).
- `src/features/PipelineRunner/PipelineRunner.ts` — drop the `pipeline()` impl body. Keep everything else.
- Every test that calls `runner.pipeline(...)` — switch to `container.resolve(PipelineBuilderFactory).create(...)` (or inject the factory via test helper). Grep: `grep -r "runner\.pipeline\b" __tests__ src`.

**Verification:**
```
grep -rn "runner\.pipeline\b" src __tests__   # 0 hits
yarn ts-check 2>&1 | grep -c "error TS"       # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

**Commit:**
```
refactor(runner): drop pipeline() method — factory owns construction

Runner's public API is now register(...) + run() + getProcessors().
pipeline construction lives on PipelineBuilderFactory, resolved from
the container. All tests updated to use the factory directly.
```

---

## Task 4: Update AGENTS.md + final verification

**Files to modify:**
- `AGENTS.md`:
  - Section 2: add `PipelineBuilderFactory` to "Public API surface"; update the "Pipeline construction" paragraph to describe the factory + new configure signature.
  - Section 3: add `PipelineBuilderFactory/` to the feature tree under `src/features/`.
  - Section 4: update the "Scanner / Processor / Executor" description — pipeline construction lives in the factory now.
  - Section 6: update the "Pipeline construction lives on the runner" decision → rename to "Pipeline construction lives in a dedicated factory". Mention the April-2026 refactor that moved it.
- Spec cross-reference: note the new location in `docs/superpowers/specs/2026-04-20-slice-merging-processors-design.md` if the factory is referenced there (quick grep).

**Final verification:**
```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
grep -rn "runner\.pipeline\b" src __tests__   # 0
grep -rn "pipelineBuilderFactory\.create" src __tests__   # ≥ 2 (example.ts + at least one test)
```

**Commit:**
```
docs(agents): reflect PipelineBuilderFactory split

Section 2 (Public API), 3 (project tree), 4 (architecture), 6
(hard-won decisions) all updated. Pipeline construction is now a
dedicated feature with DI-injected singleton; runner owns
registration + execution only.
```

No commit in final verify.
