# Async PipelineCustomizer.configure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `PipelineCustomizer.configure()` accept async returns, propagate through `PipelineBuilder.build()`, and update docs to show `config.ts` `register` hook as the primary DI registration path.

**Architecture:** Widen `configure()` return type to `void | Promise<void>`, make `build()` async, add `await` at every `.build()` call site (presets + tests), update doc examples from `setup.ts`/`initDataTransfer` to `config.ts`/`register`.

**Tech Stack:** TypeScript, vitest, Markdown

## Global Constraints

- `public`/`private`/`protected` on every class member.
- Braces always — no single-line `if`/`for`/`while`.
- `~/*` path alias in `src/`; relative paths in `__tests__/`.
- `yarn format:fix` (oxfmt), `yarn ts-check`, `yarn test:coverage`, `yarn lint`, `yarn check:imports` — all must pass.
- `void | Promise<void>` is the project convention for optional-async return types (matches existing `MigrationPreset.configure`).
- Commit after each task.

---

### Task 1: Widen interface + make build() async

**Files:**
- Modify: `src/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts:7`
- Modify: `src/domain/pipeline/PipelineBuilder.ts:121-146`

**Interfaces:**
- Consumes: nothing
- Produces: `PipelineCustomizer.Interface.configure()` returns `void | Promise<void>`; `PipelineBuilder.build()` returns `Promise<Pipeline<TRecord, TContext, TShard>>`

- [ ] **Step 1: Widen the configure return type**

In `src/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts`, change line 7:

```typescript
// Before:
configure(builder: PipelineCustomizerBuilder): void;

// After:
configure(builder: PipelineCustomizerBuilder): void | Promise<void>;
```

- [ ] **Step 2: Make build() async and await configure()**

In `src/domain/pipeline/PipelineBuilder.ts`, change the `build()` method (lines 121-146):

```typescript
// Before:
public build(): Pipeline<TRecord, TContext, TShard> {

// After:
public async build(): Promise<Pipeline<TRecord, TContext, TShard>> {
```

And in the loop at line 130:

```typescript
// Before:
customizer.configure(custBuilder);

// After:
await customizer.configure(custBuilder);
```

- [ ] **Step 3: Run ts-check**

```bash
yarn ts-check
```

Expected: errors in all preset files and test files that call `.build()` without `await`. This confirms the type change propagated correctly.

- [ ] **Step 4: Commit**

```bash
git add src/features/PipelineCustomizer/abstractions/PipelineCustomizer.ts src/domain/pipeline/PipelineBuilder.ts
git commit -m "feat: make PipelineCustomizer.configure() accept async returns"
```

---

### Task 2: Update all preset files to async configure + await build

**Files:**
- Modify: `src/presets/copy-ddb.ts`
- Modify: `src/presets/copy-os.ts`
- Modify: `src/presets/copy-files.ts`
- Modify: `src/presets/v5-to-v6-ddb.ts`
- Modify: `src/presets/v5-to-v6-os.ts`
- Modify: `templates/presets/example.ts`

**Interfaces:**
- Consumes: `PipelineBuilder.build()` now returns `Promise<Pipeline<...>>` (Task 1)
- Produces: all presets compile with async configure

Every preset needs two changes:
1. `configure(...)` signature becomes `async configure(...)` (drop explicit `: void` if present — the async keyword already returns `Promise<void>`)
2. Every `.build()` call gains `await`

- [ ] **Step 1: Update copy-ddb.ts**

```typescript
// Before (line 8):
configure({ runner, pipelineBuilderFactory: factory }): void {

// After:
async configure({ runner, pipelineBuilderFactory: factory }) {
```

```typescript
// Before (line 15):
            .build();

// After:
            .build();
// (already assigned to `const everything`, just add await before factory):
```

Full rewrite of the configure body:

```typescript
async configure({ runner, pipelineBuilderFactory: factory }) {
    const everything = await factory
        .create({
            name: "Regular DynamoDB Table Data",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        })
        .build();

    runner.register(everything);
}
```

- [ ] **Step 2: Update copy-os.ts**

Same pattern — `async configure(...)` + `await ...build()`.

- [ ] **Step 3: Update copy-files.ts**

Same pattern.

- [ ] **Step 4: Update v5-to-v6-ddb.ts**

This file has 15 `.build()` calls. Each pipeline variable assignment needs `await` before the factory chain. The `configure` signature becomes `async configure(...)`.

Pattern for each pipeline:

```typescript
// Before:
const migrationRecords = factory
    .create({ name: "MigrationRecords", ... })
    .filter(...)
    .blackhole()
    .build();

// After:
const migrationRecords = await factory
    .create({ name: "MigrationRecords", ... })
    .filter(...)
    .blackhole()
    .build();
```

Apply `await` before every `factory.create(...)...build()` chain. There are 15 pipelines — each gets `await`.

- [ ] **Step 5: Update v5-to-v6-os.ts**

This file has 5 `.build()` calls. Same pattern as step 4.

- [ ] **Step 6: Update templates/presets/example.ts**

```typescript
// Before (line 25):
configure({ runner, pipelineBuilderFactory }) {

// After:
async configure({ runner, pipelineBuilderFactory }) {
```

```typescript
// Before (lines 26-29):
const stampAll = pipelineBuilderFactory
    .create({ name: "stamp-all", scanner: DdbScanner, processors: [DdbProcessor] })
    .use(stampMigratedAt)
    .build();

// After:
const stampAll = await pipelineBuilderFactory
    .create({ name: "stamp-all", scanner: DdbScanner, processors: [DdbProcessor] })
    .use(stampMigratedAt)
    .build();
```

- [ ] **Step 7: Run ts-check on presets**

```bash
yarn ts-check
```

Expected: preset errors gone. Test file errors remain (those are Task 3).

- [ ] **Step 8: Commit**

```bash
git add src/presets/ templates/presets/example.ts
git commit -m "feat: make all preset configure() async and await build()"
```

---

### Task 3: Update all test files to await build()

**Files:**
- Modify: `__tests__/domain/pipeline/PipelineBuilder.test.ts` (13 `.build()` sites)
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.test.ts` (16 `.build()` sites + helper function)
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` (7 sites + 1 `.toThrow()` rewrite)
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.droppedLog.test.ts` (3 sites)
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.shard.test.ts` (2 sites)
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts` (3 sites)
- Modify: `__tests__/features/PipelineBuilderFactory/PipelineBuilderFactory.test.ts` (1 site)
- Modify: `__tests__/features/PipelineBuilderFactory/PipelineBuilderFactoryCustomizer.test.ts` (6 sites)
- Modify: `__tests__/integration/pipeline.dataTransfer.test.ts` (1 site)
- Modify: `__tests__/integration/pipeline.snapshot.test.ts` (2 sites)
- Modify: `__tests__/integration/pipeline.bulkAndRetry.test.ts` (2 sites)
- Modify: `__tests__/integration/pipeline.realData.test.ts` (1 site)

**Interfaces:**
- Consumes: `PipelineBuilder.build()` returns `Promise<Pipeline<...>>` (Task 1)
- Produces: all tests compile and pass

Three mechanical patterns to apply across all files:

**Pattern A — `runner.register(builder.build())` one-liner:**

```typescript
// Before:
runner.register(builder.build());

// After:
const pipeline = await builder.build();
runner.register(pipeline);
```

Or for chained registers like `runner.register(a.build()).register(b.build())`:

```typescript
// Before:
runner.register(builderA.build()).register(builderB.build());

// After:
const pipelineA = await builderA.build();
const pipelineB = await builderB.build();
runner.register(pipelineA).register(pipelineB);
```

**Pattern B — `const x = builder...build()` assignment:**

```typescript
// Before:
const pipeline = makeBuilder("basic").filter(matchAll).build();

// After:
const pipeline = await makeBuilder("basic").filter(matchAll).build();
```

**Pattern C — sync `.toThrow()` assertion (known site: PipelineRunner.integration.test.ts line 100):**

```typescript
// Before:
expect(() => runner.register(builderB.build())).toThrow(/already registered/i);

// After:
await expect(async () => {
    const p = await builderB.build();
    runner.register(p);
}).rejects.toThrow(/already registered/i);
```

**Helper function rewrite (PipelineRunner.test.ts line 170):**

```typescript
// Before:
return builder.build() as unknown as Pipeline<FakeRecord, FakeContext, FakeShard>;

// After — function must become async, callers must await:
return (await builder.build()) as unknown as Pipeline<FakeRecord, FakeContext, FakeShard>;
```

And the function signature changes from sync to async (returns `Promise<Pipeline<...>>`).

**`it()` blocks:** any `it("...", () => {` that now contains `await` must become `it("...", async () => {`.

- [ ] **Step 1: Update PipelineBuilder.test.ts**

Apply Pattern B to all 13 `.build()` sites. Make affected `it()` callbacks `async`.

- [ ] **Step 2: Update PipelineRunner.test.ts**

Apply Patterns A and B to all 16 sites. Make the helper function at line 170 async. Make affected `it()` callbacks `async`.

- [ ] **Step 3: Update PipelineRunner.integration.test.ts**

Apply Pattern A to 6 sites. Apply Pattern C to the `.toThrow()` at line 100. Make affected `it()` callbacks `async`.

- [ ] **Step 4: Update PipelineRunner.droppedLog.test.ts**

Apply Pattern A to 3 sites. Make affected `it()` callbacks `async`.

- [ ] **Step 5: Update PipelineRunner.shard.test.ts**

Apply Pattern A to 2 sites. Make affected `it()` callbacks `async`.

- [ ] **Step 6: Update PipelineRunner.getProcessors.test.ts**

Apply Patterns A to 3 sites (including the chained register at line 56). Make affected `it()` callbacks `async`.

- [ ] **Step 7: Update PipelineBuilderFactory.test.ts**

Apply Pattern B to 1 site (line 42). Make the `it()` callback `async`.

- [ ] **Step 8: Update PipelineBuilderFactoryCustomizer.test.ts**

Apply Pattern B to 6 sites. Make affected `it()` callbacks `async`.

- [ ] **Step 9: Update integration test files**

Apply Pattern A to:
- `pipeline.dataTransfer.test.ts` (1 site, line 109)
- `pipeline.snapshot.test.ts` (2 sites, lines 123, 172)
- `pipeline.bulkAndRetry.test.ts` (2 sites, lines 183, 248)
- `pipeline.realData.test.ts` (1 site, line 122)

Make affected `it()` / `beforeEach()` callbacks `async`.

- [ ] **Step 10: Run full test suite**

```bash
yarn ts-check
yarn test:coverage
```

Expected: 0 type errors, all tests green.

- [ ] **Step 11: Commit**

```bash
git add __tests__/
git commit -m "feat: update all test files to await async build()"
```

---

### Task 4: Update docs to use config.ts register hook

**Files:**
- Modify: `docs/guides/pipeline-customizer.md`
- Modify: `docs/public-api.md`
- Modify: `docs/hard-won-decisions.md`
- Modify: `docs/project-structure.md`
- Modify: `AGENTS.md`
- Modify: `src/domain/transform/Preset.ts`
- Modify: `templates/presets/example.ts`
- Modify: `templates/projects/example/setup.ts`

**Interfaces:**
- Consumes: `configure()` now accepts `void | Promise<void>` (Task 1)
- Produces: all docs show `register` in `config.ts` as primary DI path

- [ ] **Step 1: Rewrite pipeline-customizer.md quick start**

Replace the quick start example (lines 10-43). The new example uses `config.ts` + `register`:

```markdown
## Quick start

Create a class that implements `PipelineCustomizer.Interface`, wire it
with `createImplementation`, and register it via the `register` hook in
your `config.ts`.

\`\`\`typescript
// projects/my-project/config.ts
import {
    loadEnv,
    createConfig,
    fromAwsProfile,
    fromEnv,
    numberFromEnv,
    PipelineCustomizer,
    createFilter
} from "@webiny/data-transfer";

loadEnv(import.meta.url);

class SkipUnwantedModels implements PipelineCustomizer.Interface {
    public readonly name = "SkipUnwantedModels";

    public canUse(pipelineName: string): boolean {
        return pipelineName === "CmsEntries";
    }

    public configure(builder: PipelineCustomizer.Builder): void {
        builder.filter(
            createFilter(record => record.modelId !== "unwantedModel")
        );
    }
}

const SkipUnwantedModelsCustomizer = PipelineCustomizer.createImplementation({
    implementation: SkipUnwantedModels,
    dependencies: []
});

export default createConfig({
    source: { /* ... */ },
    target: { /* ... */ },
    pipeline: { /* ... */ },
    register: async (container) => {
        container.register(SkipUnwantedModelsCustomizer);
    }
});
\`\`\`
```

- [ ] **Step 2: Rewrite pipeline-customizer.md "How it works" section**

Replace lines 49-59:

```markdown
## How it works

The `register` callback in your `config.ts` runs **before** the preset
loads — so the preset can `container.resolve(...)` anything you registered.

`container` is a `@webiny/di` container with all core data-transfer features
already wired (scanners, processors, executors, etc.).

Alternatively, you can use `setup.ts` (next to your config file) with the
`initDataTransfer` helper — both paths run before preset loading. `register`
in the config is the simpler option for most cases.
```

- [ ] **Step 3: Update docs/public-api.md**

Line 24 — change:
```
- **Setup helper:** `initDataTransfer` + `InitDataTransferContext` (user-side custom DI wiring — see "setup.ts" below)
```
to:
```
- **Setup helper:** `initDataTransfer` + `InitDataTransferContext` (user-side custom DI wiring via `setup.ts` — alternative to `register` in config)
```

Line 25 — change `register in \`setup.ts\`` to `register via \`config.register\` or \`setup.ts\``.

Line 31 — change:
```
**User-side custom DI — `setup.ts`:** CLI looks for `setup.ts` next to the user's config file. If present, dynamic-imports its default export and awaits `fn({ container })` BEFORE `preset.configure({...})` runs. Use the `initDataTransfer` typed helper to export it. Optional — pure-config users skip the file entirely.
```
to:
```
**User-side custom DI:** Two registration paths, both run BEFORE `preset.configure({...})`: (1) `register` callback in `createConfig({ ..., register: async (container) => { ... } })` — the primary path; (2) `setup.ts` next to the config file using the `initDataTransfer` helper — the alternative for larger setups. Both are optional.
```

Add `register` to the config builder description near line 4:
```
- **Config builder:** `createConfig` — single unified builder. Accepts optional `register: (container) => void | Promise<void>` callback for custom DI wiring (runs before preset loading).
```

- [ ] **Step 4: Update docs/hard-won-decisions.md**

Line 21 — append to the existing entry:
```
`container` exposed so users can resolve custom services registered via `config.register` (primary) or `setup.ts`.
```

Line 22 — update to mention both paths:
```
- **User-side custom DI** — two registration paths: `register` callback in `createConfig()` (primary, inline) and `setup.ts` next to the config file (alternative, uses `initDataTransfer` helper). Both run BEFORE `preset.configure({...})`. Optional — pure-config users skip both.
```

Line 29 — change `in \`setup.ts\`` to `via \`config.register\` or \`setup.ts\``.

- [ ] **Step 5: Update docs/project-structure.md**

Line 73 — change:
```
│   │                                # PipelineCustomizer.Interface in setup.ts to extend
```
to:
```
│   │                                # PipelineCustomizer.Interface via config.register or setup.ts
```

- [ ] **Step 6: Update AGENTS.md**

Find the `setup.ts` reference in section 1 ("Project at a glance"). Update to mention `register` as primary:

The line about `setup.ts` in section 1 should read:
```
**User-side custom DI:** `register` callback in `createConfig()` is the primary path (runs before preset loading). `setup.ts` next to the config file is the alternative for larger setups. Both are optional.
```

- [ ] **Step 7: Update src/domain/transform/Preset.ts JSDoc**

Line 12 — change:
```typescript
 *   resolve custom services registered via `setup.ts`.
```
to:
```typescript
 *   resolve custom services registered via `config.register` or `setup.ts`.
```

- [ ] **Step 8: Update templates/presets/example.ts comment**

Line 19-20 — change:
```typescript
 * `container` is available if you need to `container.resolve(...)` any
 * custom service registered via a sibling `setup.ts`.
```
to:
```typescript
 * `container` is available if you need to `container.resolve(...)` any
 * custom service registered via `config.register` or `setup.ts`.
```

- [ ] **Step 9: Update templates/projects/example/setup.ts comment**

Update the file's header comment to note that `register` in config is the primary path:

```typescript
/**
 * Optional custom DI wiring for this project.
 *
 * The simpler option is `register` in your config.ts:
 *
 *   export default createConfig({
 *     ...,
 *     register: async (container) => {
 *       container.register(MyCustomProcessor);
 *     }
 *   });
 *
 * This `setup.ts` file is the alternative for larger setups. The CLI
 * looks for it next to your transfer config; if present, it runs this
 * callback BEFORE loading your preset.
 *
 * This file is OPTIONAL — delete it if you don't need custom DI wiring.
 */
```

- [ ] **Step 10: Run all checks and commit**

```bash
yarn format:fix
yarn ts-check
yarn test:coverage
yarn lint
yarn check:imports
```

All should pass.

```bash
git add docs/ AGENTS.md src/domain/transform/Preset.ts templates/
git commit -m "docs: update examples to use config.ts register hook as primary DI path"
```
