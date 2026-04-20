# Runner-Centric Pipeline Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `createPipeline` / `createDdbPipeline` / `createOsPipeline` factory triad with a single typed entry point on the runner: `runner.pipeline({ name, scanner, processor })`. Make `.build()` an explicit type-enforced step and `runner.register(...)` variadic.

**Architecture:** `runner.pipeline()` accepts Scanner + Processor Implementation classes directly and infers `TRecord`/`TContext`/`TShard` from them via TypeScript conditional types over `__abstraction`-marked constructor types. The builder allows interleaved `.filter()` and `.use()` calls; `.build()` snapshots into an immutable `Pipeline`. `runner.register(...pipelines)` is variadic, chainable, throws on duplicate name.

**Tech Stack:** TypeScript, `@webiny/di` (Abstraction + Metadata), Vitest, oxfmt.

**Spec:** `docs/superpowers/specs/2026-04-20-runner-pipeline-builder-design.md`.

---

## File Structure

**Modify:**
- `src/features/PipelineRunner/abstractions/PipelineRunner.ts` — new generic signature accepting Implementation classes; variadic `register`.
- `src/features/PipelineRunner/PipelineRunner.ts` — new `pipeline()` extracts abstraction via `Metadata`; `register()` enforces unique names.
- `src/domain/pipeline/PipelineBuilder.ts` — drop single-call `.filter()` guard.
- `src/domain/pipeline/PipelineBuilderConfig` accepts the same fields (no public surface change there).
- `src/index.ts` — drop the four removed exports.
- `src/presets/example.ts` — finalize against the new API so it compiles.
- `templates/presets/example.ts` — mirror the new shape for users.
- `__tests__/domain/pipeline/PipelineBuilder.test.ts` — multi-filter cases; replace single-call guard test.
- `__tests__/features/PipelineRunner/PipelineRunner.test.ts` — variadic register; duplicate-name throw; Implementation-class inputs.
- `AGENTS.md` — Section 2 Public API, Section 3 (no v5-to-v6/), Section 6 add the decision.

**Delete:**
- `src/domain/pipeline/createPipeline.ts`
- `src/domain/pipeline/createDdbPipeline.ts`
- `src/domain/pipeline/createOsPipeline.ts`
- `__tests__/domain/pipeline/createPipeline.*.test.ts`
- `__tests__/domain/pipeline/createDdbPipeline.test.ts`
- `__tests__/domain/pipeline/createOsPipeline.test.ts`
- `src/presets/v5-to-v6/` (entire dir — 9 pipelines)
- `src/presets/v5-to-v6-ddb.ts`
- `src/presets/v5-to-v6-os.ts`
- `__tests__/presets/v5-to-v6/` (entire dir, if present)
- `__tests__/presets/v5-to-v6-ddb.test.ts`, `__tests__/presets/v5-to-v6-os.test.ts` (if present)

**New:**
- `__tests__/domain/pipeline/PipelineBuilder.types.test-d.ts` — compile-time type tests for inference + cross-record agreement.

---

## Task 1: Delete v5-to-v6 internal preset, pipelines, and their tests

**Files:**
- Delete: `src/presets/v5-to-v6/` (entire dir)
- Delete: `src/presets/v5-to-v6-ddb.ts`
- Delete: `src/presets/v5-to-v6-os.ts`
- Delete: `__tests__/presets/v5-to-v6/` (if present)
- Delete: any `__tests__/presets/v5-to-v6*` files

- [ ] **Step 1: Inventory what's about to be deleted**

Run (via Glob):
- `src/presets/v5-to-v6*`
- `__tests__/presets/v5-to-v6*`

Confirm the file list matches the description above. If something unexpected appears, surface before deleting.

- [ ] **Step 2: Verify there are no consumers outside the deletion scope**

Run (via Grep) for references to the names of pipeline constants and presets that are about to be removed: `cmsEntryPipeline`, `cmsModelPipeline`, `fmFilePipeline`, `cmsEntryOsPipeline`, `fmSettingsPipeline`, `mailerSettingsPipeline`, `securityGroupsPipeline`, `securityTeamsPipeline`, `folderPermissionsPipeline`, `v5ToV6Preset`, `v5ToV6OsPreset`.

Expected hits: only inside the soon-to-be-deleted files, plus historical `docs/superpowers/specs|plans/` (frozen artifacts — leave). Anywhere else is a real consumer; STOP and report.

- [ ] **Step 3: Delete the directories and files**

```bash
rm -rf src/presets/v5-to-v6
rm -f src/presets/v5-to-v6-ddb.ts
rm -f src/presets/v5-to-v6-os.ts
rm -rf __tests__/presets/v5-to-v6
rm -f __tests__/presets/v5-to-v6-ddb.test.ts __tests__/presets/v5-to-v6-os.test.ts
```

(Some of those test paths may not exist — that's fine; `rm -f` is silent.)

- [ ] **Step 4: Verify state**

```
yarn ts-check 2>&1 | grep "error TS" | head -10
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3
```

Expected: a handful of ts-check errors in `src/presets/example.ts` (still references the old-shape API) and possibly in tests that imported the deleted preset names. **These errors are expected**; later tasks fix them. Note them, don't fix here.

- [ ] **Step 5: Commit**

```bash
git add -A src/presets __tests__/presets
git commit -m "$(cat <<'EOF'
chore: delete v5-to-v6 internal preset + pipelines + their tests

Out of scope for the runner-centric pipeline builder refactor —
they remain user-land examples slated for a separate rewrite.
Scrubs ~10 source files and ~10 tests so the new API can land
without dragging legacy along.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Allow multiple `.filter()` calls on PipelineBuilder

**Files:**
- Modify: `src/domain/pipeline/PipelineBuilder.ts`
- Modify: `__tests__/domain/pipeline/PipelineBuilder.test.ts`

- [ ] **Step 1: Update the failing test (TDD — drop single-call guard, add multi-call assertions)**

In `__tests__/domain/pipeline/PipelineBuilder.test.ts`:

- DELETE the existing test that asserts the second `.filter()` throws (search for "filter() already called" or similar).
- ADD a test:
  ```typescript
  it("accumulates filters across multiple .filter() calls (AND-composed at build)", () => {
      const filterA = createFilter(byType("a"));
      const filterB = createFilter(byType("b"));
      const builder = new PipelineBuilder({ name: "p", scanner: SCANNER_TOKEN, processor: PROCESSOR_TOKEN });
      builder.filter(filterA).use(transformerStub).filter(filterB);
      const pipeline = builder.build();
      expect(pipeline.filters).toEqual([filterA, filterB]);
  });
  ```
  (Adapt the scanner/processor tokens + `transformerStub` to whatever fixtures the existing test file uses.)

- ADD a test that interleaved `.filter()` / `.use()` preserves transformer order:
  ```typescript
  it("preserves transformer insertion order regardless of where .filter() calls appear", () => {
      const builder = new PipelineBuilder({ name: "p", scanner: SCANNER_TOKEN, processor: PROCESSOR_TOKEN });
      builder.use(t1).filter(filterA).use(t2).filter(filterB).use(t3);
      const pipeline = builder.build();
      expect(pipeline.transformers).toEqual([t1, t2, t3]);
      expect(pipeline.filters).toEqual([filterA, filterB]);
  });
  ```

- [ ] **Step 2: Run tests to confirm failure**

```
yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts
```

Expected: both new tests fail because the current `.filter()` throws on second call.

- [ ] **Step 3: Update `src/domain/pipeline/PipelineBuilder.ts`**

Replace the existing `.filter()` method body with:

```typescript
public filter(filter: Filter<TRecord>): this {
    this.filters.push(filter);
    return this;
}
```

Drop the `filterCalled` field (no longer needed) and any related guards. Drop the array-input handling (no longer needed — one filter per call). Keep `private filters: Filter<TRecord>[] = [];`.

- [ ] **Step 4: Run tests to confirm pass**

```
yarn test __tests__/domain/pipeline/PipelineBuilder.test.ts
```

Expected: all green, including the two new tests.

- [ ] **Step 5: Format + ts-check**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"
```

ts-check error count: **same as after Task 1** (this task doesn't touch the runner or `example.ts`). Note the count.

- [ ] **Step 6: Commit**

```bash
git add src/domain/pipeline/PipelineBuilder.ts __tests__/domain/pipeline/PipelineBuilder.test.ts
git commit -m "$(cat <<'EOF'
refactor(pipeline-builder): allow multiple .filter() calls; AND-compose

Previously .filter() threw on the second call and required users to
pass an array for multi-filter pipelines. New API: one filter per
call, chained — all collected and AND-composed at build time
regardless of where they appear in the chain.

.use() insertion order remains the source of truth for transformer
execution order.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Refactor `runner.pipeline()` to accept Implementation classes with full type inference

**Files:**
- Modify: `src/features/PipelineRunner/abstractions/PipelineRunner.ts`
- Modify: `src/features/PipelineRunner/PipelineRunner.ts`
- Create: `__tests__/domain/pipeline/PipelineBuilder.types.test-d.ts`
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.test.ts`

- [ ] **Step 1: Update the abstraction (`src/features/PipelineRunner/abstractions/PipelineRunner.ts`)**

Replace the existing `PipelineRunnerFactoryInput` and `IPipelineRunner.pipeline` signature with:

```typescript
import type { Abstraction, Constructor } from "@webiny/di";

type ScannerImpl<TRecord, TShard> = Constructor<Scanner.Interface<TRecord, TShard>> & {
    __abstraction: Abstraction<unknown>;
};

type ProcessorImpl<TRecord, TContext extends Processor.Context> = Constructor<
    Processor.Interface<TRecord, TContext>
> & {
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

Drop the old `PipelineRunnerFactoryInput` namespace alias (or keep its name as `PipelineFactoryInput` for clarity). Re-export the `FactoryInput` namespace alias.

- [ ] **Step 2: Update the implementation (`src/features/PipelineRunner/PipelineRunner.ts`)**

In `runner.pipeline()`:

```typescript
import { Metadata } from "@webiny/di";

public pipeline<TRecord, TContext extends Processor.Context, TShard>(
    input: PipelineFactoryInput<TRecord, TContext, TShard>
): PipelineBuilder<TRecord, TContext, TShard> {
    const scannerAbstraction = new Metadata(input.scanner).getAbstraction() as Abstraction<
        Scanner.Interface<TRecord, TShard>
    >;
    const processorAbstraction = new Metadata(input.processor).getAbstraction() as Abstraction<
        Processor.Interface<TRecord, TContext>
    >;
    return new PipelineBuilder<TRecord, TContext, TShard>({
        name: input.name,
        scanner: scannerAbstraction,
        processor: processorAbstraction
    });
}
```

`PipelineBuilder`'s internal config still expects `Abstraction<...>` — leave that as-is. The new entry point handles the Impl-to-Abstraction conversion.

- [ ] **Step 3: Add the type-level test fixture**

Create `__tests__/domain/pipeline/PipelineBuilder.types.test-d.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expectTypeOf, it } from "vitest";
import { Container } from "@webiny/di";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";

describe("runner.pipeline() type inference", () => {
    it("infers TRecord and TContext from a DDB scanner+processor pair", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline({ name: "test", scanner: DdbScanner, processor: DdbProcessor });
        expectTypeOf(builder).toExtend<{ filter: (f: { match(r: BaseRecord): boolean; name: string }) => unknown }>();
        expectTypeOf<Parameters<typeof builder.use>[0]>().toExtend<
            (ctx: DdbTransformContext.Interface<BaseRecord>) => Promise<void> | void
        >();
    });

    it("rejects mismatched scanner+processor pairs", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        // @ts-expect-error — DdbScanner produces BaseRecord but OsProcessor wants OsRecord.
        runner.pipeline({ name: "x", scanner: DdbScanner, processor: OsProcessor });
        // @ts-expect-error — symmetric
        runner.pipeline({ name: "y", scanner: OsScanner, processor: DdbProcessor });
    });
});
```

(Adjust `expectTypeOf` assertions based on the exact `Filter<TRecord>` and `Transformer.Interface<TContext>` shapes — what matters is the cross-pair rejection and the inferred record/context flowing into `.filter()` / `.use()`.)

If vitest doesn't auto-pick up `.test-d.ts` files, name it `PipelineBuilder.types.test.ts` and use `expectTypeOf` from vitest's type utilities.

- [ ] **Step 4: Run tests + ts-check**

```
yarn test __tests__/domain/pipeline/PipelineBuilder.types.test-d.ts
yarn ts-check 2>&1 | grep "error TS" | head -20
```

Expected: type tests pass; ts-check error count drops compared to Task 2 (because most of the runner-side errors get cleared by the new `pipeline()` accepting Impl classes). Some errors remain in `src/presets/example.ts` and `src/domain/pipeline/createDdbPipeline.ts` etc. — expected; cleared in Tasks 5/6.

- [ ] **Step 5: Format**

```
yarn format:fix
```

- [ ] **Step 6: Commit**

```bash
git add src/features/PipelineRunner __tests__/domain/pipeline/PipelineBuilder.types.test-d.ts __tests__/features/PipelineRunner
git commit -m "$(cat <<'EOF'
refactor(runner): pipeline() accepts Impl classes; infers TRecord/TContext/TShard

runner.pipeline({ name, scanner, processor }) now takes Implementation
classes (DdbScanner, DdbProcessor) directly. TRecord, TContext, TShard
are inferred from the constructor instance types, so .filter() and
.use() see the right record / context — no manual generics.

Mismatched pairs (e.g. DdbScanner + OsProcessor) fail at compile time.

Internal abstraction extraction uses Metadata.getAbstraction(impl) —
same machinery the deprecated createPipeline factory used.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Variadic + chainable `runner.register()`; throw on duplicate name

**Files:**
- Modify: `src/features/PipelineRunner/abstractions/PipelineRunner.ts` (signature already updated in Task 3 — this task just confirms)
- Modify: `src/features/PipelineRunner/PipelineRunner.ts` (impl logic)
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.test.ts`

- [ ] **Step 1: Add tests first (TDD)**

In `__tests__/features/PipelineRunner/PipelineRunner.test.ts`, add:

```typescript
describe("runner.register variadic + duplicate-name guard", () => {
    it("registers multiple pipelines in one call", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const p1 = runner.pipeline({ name: "a", scanner: DdbScanner, processor: DdbProcessor }).build();
        const p2 = runner.pipeline({ name: "b", scanner: DdbScanner, processor: DdbProcessor }).build();
        expect(() => runner.register(p1, p2)).not.toThrow();
        // (Optionally inspect runner internals via getProcessors() length, etc.)
    });

    it("returns this for chaining", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const p1 = runner.pipeline({ name: "c", scanner: DdbScanner, processor: DdbProcessor }).build();
        expect(runner.register(p1)).toBe(runner);
    });

    it("throws on duplicate pipeline name", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const p1 = runner.pipeline({ name: "dup", scanner: DdbScanner, processor: DdbProcessor }).build();
        const p2 = runner.pipeline({ name: "dup", scanner: DdbScanner, processor: DdbProcessor }).build();
        runner.register(p1);
        expect(() => runner.register(p2)).toThrow(/already registered/);
    });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```
yarn test __tests__/features/PipelineRunner/PipelineRunner.test.ts
```

Expected: the new tests fail because the existing `register` is single-arg and doesn't dedup names.

- [ ] **Step 3: Update `src/features/PipelineRunner/PipelineRunner.ts`**

Change the `register` method to:

```typescript
private readonly registeredNames: Set<string> = new Set();

public register(...pipelines: Pipeline<unknown, Processor.Context, unknown>[]): this {
    for (const pipeline of pipelines) {
        if (this.registeredNames.has(pipeline.name)) {
            throw new Error(
                `PipelineRunner: pipeline name "${pipeline.name}" is already registered. ` +
                    `Names must be unique within a runner.`
            );
        }
        this.registeredNames.add(pipeline.name);
        // ... existing per-pipeline registration logic (push to merge group, etc.) ...
    }
    return this;
}
```

(Read the existing single-arg `register` body; wrap its logic in the `for` loop.)

- [ ] **Step 4: Run tests to confirm pass**

```
yarn test __tests__/features/PipelineRunner/PipelineRunner.test.ts
```

Expected: green.

- [ ] **Step 5: Update any single-arg `runner.register(p)` call sites in tests**

Variadic register accepts a single arg too — most existing tests should keep working. Run the FULL suite to confirm:

```
yarn test 2>&1 | grep -E "Test Files|^\s+Tests |FAIL" | tail -20
```

Address any breakage. If a test asserts the OLD throw behavior on duplicate name from a different code path, update it.

- [ ] **Step 6: Format + ts-check**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"
```

ts-check error count should be no higher than after Task 3.

- [ ] **Step 7: Commit**

```bash
git add src/features/PipelineRunner __tests__/features/PipelineRunner
git commit -m "$(cat <<'EOF'
refactor(runner): register(...) is variadic, chainable, throws on duplicate name

runner.register(p1, p2, ...) accepts any number of pipelines, returns
this for chaining. Throws on the first duplicate name encountered with
a clear error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Delete the legacy factory functions and update `src/index.ts`

**Files:**
- Delete: `src/domain/pipeline/createPipeline.ts`
- Delete: `src/domain/pipeline/createDdbPipeline.ts`
- Delete: `src/domain/pipeline/createOsPipeline.ts`
- Delete: `__tests__/domain/pipeline/createPipeline*.test.ts`
- Delete: `__tests__/domain/pipeline/createDdbPipeline.test.ts`
- Delete: `__tests__/domain/pipeline/createOsPipeline.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Inventory the test files**

Glob for: `__tests__/domain/pipeline/createPipeline*.test.ts`, `__tests__/domain/pipeline/createDdbPipeline*.test.ts`, `__tests__/domain/pipeline/createOsPipeline*.test.ts`. Note exact paths.

- [ ] **Step 2: Verify no in-source consumers remain**

Grep `src` for `createDdbPipeline`, `createOsPipeline`, `createPipeline`, `PipelineDefinition`. Expected hits: only in the soon-to-be-deleted source files. (Tests get deleted along with the source.)

If `src/presets/example.ts` still references these, that's expected — Task 6 fixes it. Leave it for now.

If anything ELSE uses them, STOP and report.

- [ ] **Step 3: Update `src/index.ts`**

Remove the four exports:

```typescript
// DELETE these lines from src/index.ts:
export { createPipeline, type PipelineDefinition } from "./domain/pipeline/createPipeline.ts";
export { createDdbPipeline } from "./domain/pipeline/createDdbPipeline.ts";
export { createOsPipeline } from "./domain/pipeline/createOsPipeline.ts";
```

Keep everything else intact (config builders, transformer factories, scanner/processor tokens, `MigrationPreset`, context types, `Transformer`, `createFilter`, `Filter`).

- [ ] **Step 4: Delete the source + test files**

```bash
rm -f src/domain/pipeline/createPipeline.ts src/domain/pipeline/createDdbPipeline.ts src/domain/pipeline/createOsPipeline.ts
rm -f __tests__/domain/pipeline/createPipeline*.test.ts __tests__/domain/pipeline/createDdbPipeline*.test.ts __tests__/domain/pipeline/createOsPipeline*.test.ts
```

(Some test paths may not exist — `rm -f` is silent.)

- [ ] **Step 5: Verify**

```
yarn ts-check 2>&1 | grep "error TS" | head -10
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3
```

Expected: ts-check still flags `src/presets/example.ts` (Task 6 fixes); tests should be all green except for any test that imported one of the deleted names from `@webiny/data-transfer` or `~/domain/pipeline/createPipeline.ts`. Address those by deleting or rewriting them — they're testing dead code.

- [ ] **Step 6: Commit**

```bash
git add -A src/domain/pipeline src/index.ts __tests__/domain/pipeline
git commit -m "$(cat <<'EOF'
chore: delete createPipeline/createDdbPipeline/createOsPipeline + drop public exports

Replaced by runner.pipeline({ name, scanner, processor }). The three
legacy factories and the PipelineDefinition type are gone from the
public surface; tests for the deleted code dropped along with them.

Users construct pipelines exclusively through runner.pipeline(...) +
.build() + runner.register(...) inside their preset's configure(runner).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Finalize `src/presets/example.ts` against the new API

**Files:**
- Modify: `src/presets/example.ts`

- [ ] **Step 1: Read the current `src/presets/example.ts`**

The user's draft already targets the new API. Update it to compile cleanly:
- Replace `from "@/src/index.js"` and `from "~/transformers/index.js"` paths with the correct `~/...ts` equivalents.
- If `oneMoreFilterWhichIsApplied` doesn't exist (the user added it as illustration), pick an existing filter or define a tiny inline one for the example (e.g. `const trueFilter = { name: "always", match: () => true }` — but prefer reusing an existing filter from `src/domain/transform/filters.ts`).
- Verify all transformer imports resolve.
- Confirm scanner + processor inputs are `DdbScanner` and `DdbProcessor`.

The file should compile without error and read clearly as the canonical "how to write a preset" example.

- [ ] **Step 2: Verify**

```
yarn format:fix
yarn ts-check 2>&1 | grep "error TS" | head -10
```

Expected: 0 ts-check errors.

```
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3
```

All green.

- [ ] **Step 3: Commit**

```bash
git add src/presets/example.ts
git commit -m "$(cat <<'EOF'
chore(presets): finalize example.ts against runner.pipeline() API

Demonstrates: runner.pipeline({...}), interleaved .filter()/.use(),
.build(), variadic runner.register(...). Acts as the canonical
"how to write a preset" reference.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `templates/presets/example.ts` to mirror the new API

**Files:**
- Modify: `templates/presets/example.ts`

- [ ] **Step 1: Update the template**

Open `templates/presets/example.ts`. Rewrite the preset's `configure(runner)` to use:

```typescript
import type { MigrationPreset } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor, createFilter } from "@webiny/data-transfer";
import { byType } from "../path/to/your/filter.ts";  // adapt if applicable
import { stampMigratedAt } from "../transformers/stampMigratedAt.ts";

const examplePreset: MigrationPreset = {
    name: "example",
    description: "Add migratedAt timestamp to every CMS entry.",
    configure(runner) {
        const pipeline = runner
            .pipeline({ name: "Example", scanner: DdbScanner, processor: DdbProcessor })
            .filter(createFilter(byType("cms.entry")))
            .use(stampMigratedAt)
            .build();

        runner.register(pipeline);
    }
};

export default examplePreset;
```

(Adjust paths and imports to match the actual template scaffolding.)

- [ ] **Step 2: Update `templates/README.md`** — find any code-block snippet showing `createDdbPipeline` and replace it with the `runner.pipeline()` shape.

- [ ] **Step 3: Verify (no test impact — templates aren't tested)**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"
```

ts-check is unchanged by template files (they're outside `src/` and `__tests__/`).

- [ ] **Step 4: Commit**

```bash
git add templates
git commit -m "$(cat <<'EOF'
chore(templates): update preset template to runner.pipeline() API

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Section 2 (Public API)**

Drop the four removed items from the bullet list:
- `createPipeline`, `PipelineDefinition`, `createDdbPipeline`, `createOsPipeline`.

Add a one-liner about the new entry point:

> - **Pipeline construction:** users call `runner.pipeline({ name, scanner, processor })` inside `MigrationPreset.configure(runner)` to get a typed `PipelineBuilder`. Chain `.filter()` / `.use()` / `.beforeExecuteCommands()` / `.afterExecuteCommands()`, then `.build()` for an immutable `Pipeline`. Pass to `runner.register(...)`.

- [ ] **Step 2: Section 3 (project structure)**

In the `src/presets/` block, drop the line about `v5-to-v6/pipelines/`. The new block should look like:

```
├── presets/                  # Internal example preset (src/presets/example.ts)
│                             # — the v5-to-v6 internal preset was deleted
```

In `src/domain/pipeline/`, drop references to `createPipeline.ts`, `createDdbPipeline.ts`, `createOsPipeline.ts` if any.

- [ ] **Step 3: Section 6 (hard-won decisions)**

Add:

> - **Pipeline construction lives on the runner** — `runner.pipeline({ name, scanner, processor })` is the only entry point. The deleted factory triad (`createPipeline` / `createDdbPipeline` / `createOsPipeline`) drove users through three near-identical functions and split type inference across config + register time. The runner-centric API infers `TRecord` / `TContext` / `TShard` from the Impl class pair at construction. `.build()` is explicit and type-enforced (returns immutable `Pipeline`); `runner.register(...)` is variadic and throws on duplicate names. Don't reintroduce a standalone factory.

- [ ] **Step 4: Format + final verify**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "$(cat <<'EOF'
docs(agents): reflect runner-centric pipeline builder API

- Section 2: drop the four deleted exports; add runner.pipeline() bullet.
- Section 3: drop v5-to-v6/ subtree (deleted); update presets/.
- Section 6: add the "pipeline construction lives on the runner" decision.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: `yarn format:fix`** — expect no pending changes after prior commits.

- [ ] **Step 2: `yarn ts-check 2>&1 | grep -c "error TS"`** — expect `0`.

- [ ] **Step 3: `yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3`** — full suite green.

- [ ] **Step 4: Smoke greps**

```
Grep "createPipeline"    in src __tests__   # 0 hits
Grep "createDdbPipeline" in src __tests__   # 0 hits
Grep "createOsPipeline"  in src __tests__   # 0 hits
Grep "PipelineDefinition" in src __tests__  # 0 hits
Grep "v5ToV6Preset"      in src __tests__   # 0 hits (allow plenty of hits in docs/)
Grep "runner.pipeline("  in src/presets     # at least 1 hit (in example.ts)
```

- [ ] **Step 5: `git log --oneline -10`** — expect the 8 task commits + the spec + this plan, in order.

No commit in this task.
