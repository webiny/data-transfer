# Transformer Library + Pipeline Factories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all 19 existing transformers to plain functions via named factories, add pipeline factories that produce registerable `PipelineDefinition` objects, and expose the whole surface from the package's public API so users can consume built-in transformers + write their own.

**Architecture:** Six tiny factories (3 transformer + 3 pipeline) — each context-specific one is a thin wrapper over its generic. Transformers become plain functions that flow straight into `pipeline.use(...)`. Sub-pipelines become `PipelineDefinition` consts (one file per pipeline) built with `createDdbPipeline`. Public API from `src/index.ts` exposes factories, all built-in transformers, the three v5-to-v6 pipeline definitions, and the three context types (Base / Ddb / Os) so users can write their own.

**Tech Stack:** TypeScript strict, `@webiny/di`, vitest, `~/` path alias.

**Spec reference:** `docs/superpowers/specs/2026-04-18-transformer-library-design.md`

**Out of scope:** preset migration (Plan B), re-enabling excluded legacy tests. See spec § "Out of scope".

---

## File Structure

**New files:**

- `src/transformers/createTransformer.ts` — generic transformer factory.
- `src/transformers/createDdbTransformer.ts` — DDB-bound sugar.
- `src/transformers/createOsTransformer.ts` — OS-bound sugar.
- `src/transformers/index.ts` — barrel re-exporting factories + all transformer consts from subdir barrels.
- `src/transformers/{global,cms,file-manager,folders,mailer,security}/index.ts` — one barrel per subdir.
- `src/domain/pipeline/createPipeline.ts` — generic pipeline factory + `PipelineDefinition` type.
- `src/domain/pipeline/createDdbPipeline.ts` — DDB-bound sugar.
- `src/domain/pipeline/createOsPipeline.ts` — OS-bound sugar.
- `src/presets/v5-to-v6/pipelines/cms-entry.ts` — `cmsEntryPipeline` const.
- `src/presets/v5-to-v6/pipelines/cms-model.ts` — `cmsModelPipeline` const.
- `src/presets/v5-to-v6/pipelines/fm-file.ts` — `fmFilePipeline` const.
- `__tests__/transformers/fakeContext.ts` — shared fake-context helper for transformer unit tests.
- `__tests__/transformers/createTransformer.test.ts` — factory tests.
- `__tests__/domain/pipeline/createPipeline.test.ts` — pipeline factory tests.
- `__tests__/transformers/{global,cms,file-manager,folders,mailer,security}/*.test.ts` — one unit test per transformer.
- `__tests__/presets/v5-to-v6/pipelines/{cms-entry,cms-model,fm-file}.test.ts` — one test per pipeline definition.

**Renamed files (kebab-case → camelCase to match the export name):**

- `src/transformers/global/wrap-in-data.ts` → `wrapInData.ts`
- `src/transformers/global/add-gsi-tenant.ts` → `addGsiTenant.ts`
- `src/transformers/global/remove-locale.ts` → `removeLocale.ts`
- `src/transformers/global/remove-attributes.ts` → `removeAttributes.ts`
- `src/transformers/cms/fix-broken-storage-keys.ts` → `fixBrokenStorageKeys.ts`
- `src/transformers/cms/fix-cme-pk.ts` → `fixCmePk.ts`
- `src/transformers/cms/remove-folder-revision.ts` → `removeFolderRevision.ts`
- `src/transformers/cms/rename-field-attributes.ts` → `renameFieldAttributes.ts`
- `src/transformers/cms/transform-model-group.ts` → `transformModelGroup.ts`
- `src/transformers/cms/transform-rich-text.ts` → `transformRichText.ts`
- `src/transformers/cms/update-model-ids.ts` → `updateModelIds.ts`
- `src/transformers/file-manager/create-metadata.ts` → `createMetadata.ts`
- `src/transformers/file-manager/extract-image-metadata.ts` → `extractImageMetadata.ts`
- `src/transformers/file-manager/migrate-settings.ts` → `migrateFileManagerSettings.ts`
- `src/transformers/folders/update-flp-ids.ts` → `updateFlpIds.ts`
- `src/transformers/mailer/migrate-settings.ts` → `migrateMailerSettings.ts`
- `src/transformers/security/groups-to-roles.ts` → `groupsToRoles.ts`
- `src/transformers/security/remove-tenant.ts` → `removeTenant.ts`
- `src/transformers/security/transform-permissions.ts` → `transformPermissions.ts`

Use `git mv` so history follows the rename.

**Modified files:**

- `src/index.ts` — expand public API (factories + transformers + pipeline defs + context types).
- `src/domain/pipeline/index.ts` — re-export the three pipeline factories.

**Deleted files:**

- `src/domain/transform/Transformer.ts` — legacy `Transformer` interface with `.name + .transform`. No consumers outside the to-be-ported transformers and the stubbed handlers.
- `src/presets/v5-to-v6/CmsEntryPipeline.ts`, `CmsModelPipeline.ts`, `FmFilePipeline.ts` — replaced by the `cms-entry.ts` / `cms-model.ts` / `fm-file.ts` definitions.
- `src/domain/transform/Pipeline.ts`, `src/domain/transform/PipelineBuilder.ts` — legacy `TransformPipeline` + legacy `PipelineBuilder`. Only consumer today is `v5-to-v6-ddb.ts` + `v5-to-v6-os.ts` (both excluded from ts-check fallout list) and the excluded legacy tests. Safe to delete.

---

## Project conventions to follow

- Use `yarn` for all commands. Never `npm`.
- Always wrap `if`/`for`/`while` bodies in curly braces.
- All class members get explicit `public`/`private`/`protected` modifiers.
- Path alias: `~/*` maps to `src/*`. Use `~/transformers/...`, `~/domain/pipeline/...` in imports.
- Use `.ts` extensions on all relative imports in source files.
- Always declare named interfaces/types — no inline structural types in generics, params, or returns.
- Do NOT import `reflect-metadata` — `@webiny/di` loads it internally.
- After each task, run `yarn format:fix` + `yarn ts-check` + `yarn test` and commit only after green.
- Commit per task (each task is one logical section).
- Pre-existing `src/presets/example.ts` ts-check errors are unrelated user WIP — do not touch.
- Pre-existing fallout: legacy tests in `vitest.config.ts`'s exclude list stay excluded throughout this plan.

---

## Port pattern (reference for all transformer tasks)

Every ported transformer follows this template. **The body of the `transform` method is copied verbatim** — the only change is the wrapper.

### Before (legacy shape)

```typescript
import type { Transformer } from "~/domain/transform/Transformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export const wrapInData: Transformer = {
    name: "wrapInData",
    transform(ctx: BaseTransformContext.Interface) {
        // ... body ...
    }
};
```

### After (new shape)

```typescript
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export const wrapInData = createTransformer<BaseTransformContext.Interface>(
    "wrapInData",
    (ctx) => {
        // ... body UNCHANGED from legacy ...
    }
);
```

### Transformation rules

1. Drop the `import type { Transformer } from "~/domain/transform/Transformer.ts"`.
2. Add `import { createXTransformer } from "~/transformers/createXTransformer.ts"` matching the chosen factory.
3. Replace the `{ name: "...", transform(ctx: T) { ... } }` literal with `createXTransformer("...", (ctx) => { ... })`.
4. Keep the body of the `transform` method exactly as it was. Do NOT alter internals.
5. Keep file-level constants, helper functions, and other imports as-is.
6. Preserve async — if `transform` was `async transform(ctx) {...}`, the new body becomes `async (ctx) => {...}`.

### Factory choice per transformer

| File | Factory | Reason |
| --- | --- | --- |
| `global/wrapInData.ts` | `createTransformer<BaseTransformContext.Interface>` | Operates on `BaseTransformContext.Interface` — portable across DDB and OS. |
| `global/addGsiTenant.ts` | `createTransformer<BaseTransformContext.Interface>` | Same as above. |
| `global/removeLocale.ts` | `createTransformer<BaseTransformContext.Interface>` | Same. |
| `global/removeAttributes.ts` | `createTransformer<BaseTransformContext.Interface>` | Same. |
| `cms/fixCmePk.ts` | `createTransformer<BaseTransformContext.Interface>` | Pure record mutation, no DDB/OS-specific ctx methods. |
| `cms/fixBrokenStorageKeys.ts` | `createDdbTransformer` | If the existing `transform(ctx)` types ctx as `DdbTransformContext.Interface` → use the DDB factory. Otherwise `createTransformer<BaseTransformContext.Interface>`. **Implementer must check the existing ctx type annotation and keep it.** |
| `cms/removeFolderRevision.ts` | `createTransformer<BaseTransformContext.Interface>` | Default unless ctx type says otherwise. |
| `cms/renameFieldAttributes.ts` | `createTransformer<BaseTransformContext.Interface>` | Default. |
| `cms/transformModelGroup.ts` | `createTransformer<BaseTransformContext.Interface>` | Default. |
| `cms/transformRichText.ts` | `createTransformer<BaseTransformContext.Interface>` | Uses `ctx.modelProvider` which is on Base. |
| `cms/updateModelIds.ts` | `createTransformer<BaseTransformContext.Interface>` | Uses `ctx.modelProvider`. |
| `file-manager/createMetadata.ts` | `createDdbTransformer` if ctx is typed `DdbTransformContext.Interface`; otherwise generic. |
| `file-manager/extractImageMetadata.ts` | `createDdbTransformer` if the transformer uses `ctx.getFile` (DDB-specific); otherwise generic. |
| `file-manager/migrateFileManagerSettings.ts` | `createTransformer<BaseTransformContext.Interface>` | Default. |
| `folders/updateFlpIds.ts` | `createTransformer<BaseTransformContext.Interface>` | Default. |
| `mailer/migrateMailerSettings.ts` | `createTransformer<BaseTransformContext.Interface>` | Default. |
| `security/groupsToRoles.ts` | `createTransformer<BaseTransformContext.Interface>` | Default. |
| `security/removeTenant.ts` | `createTransformer<BaseTransformContext.Interface>` | Default. |
| `security/transformPermissions.ts` | `createTransformer<BaseTransformContext.Interface>` | Default. |

**Rule of thumb:** if the existing transformer's ctx parameter was typed `DdbTransformContext.Interface` or calls `ctx.copyFile` / `ctx.getFile` (DDB-only methods), use `createDdbTransformer`. Otherwise use the generic with `BaseTransformContext.Interface`. The implementer checks during the port — when in doubt, default to the generic and `BaseTransformContext.Interface`.

---

## Test pattern (reference for all transformer tasks)

### Shared fake context helper

Created in Task 1 at `__tests__/transformers/fakeContext.ts`:

```typescript
import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export interface FakeContextOverrides {
    modelProvider?: unknown;
    cache?: unknown;
}

export function makeFakeBaseContext<T extends Record<string, unknown>>(
    record: T,
    overrides: FakeContextOverrides = {}
): BaseTransformContext.Interface<T> {
    const commands = new Commands();
    const ctx = {
        record,
        original: { ...record } as Readonly<T>,
        commands,
        modelProvider: overrides.modelProvider as BaseTransformContext.Interface["modelProvider"],
        cache: overrides.cache as BaseTransformContext.Interface["cache"],
        replace(newRecord: unknown): void {
            (ctx as { record: unknown }).record = newRecord;
        },
        putRecord(rec: Record<string, unknown>): void {
            // no-op for tests that don't exercise putRecord
            void rec;
        },
        async queryRecord(
            _pk: string,
            _sk?: string
        ): Promise<Record<string, unknown> | null> {
            return null;
        },
        async executePipeline(): Promise<Commands> {
            return new Commands();
        }
    };
    return ctx as unknown as BaseTransformContext.Interface<T>;
}
```

Individual tests add `modelProvider` / `cache` stubs when their transformer needs them:

```typescript
const ctx = makeFakeBaseContext(record, {
    modelProvider: { getModel: async () => null, getSortedFields: () => [] }
});
```

### Per-transformer test shape

Each transformer test file (~30-50 lines) has 1-3 `it()` cases covering the main behavior. Example:

```typescript
// __tests__/transformers/global/wrapInData.test.ts
import { describe, it, expect } from "vitest";
import { wrapInData } from "~/transformers/global/wrapInData.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("wrapInData", () => {
    it("wraps non-reserved attributes into a data envelope", () => {
        const ctx = makeFakeBaseContext({
            PK: "tenant",
            SK: "record",
            TYPE: "foo",
            name: "Alice",
            age: 42
        });
        wrapInData(ctx);
        expect(ctx.record.PK).toBe("tenant");
        expect(ctx.record.data).toEqual({ name: "Alice", age: 42 });
        expect(ctx.record.name).toBeUndefined();
    });

    it("leaves records that already have a data envelope alone", () => {
        const ctx = makeFakeBaseContext({
            PK: "tenant",
            SK: "record",
            TYPE: "foo",
            data: { preserved: true }
        });
        wrapInData(ctx);
        expect(ctx.record.data).toEqual({ preserved: true });
    });
});
```

**Test case guidance:**
- 1 test per transformer minimum — the "happy path" (record goes in, expected shape comes out).
- Add a second test for any clear branch (e.g., "already-wrapped records are skipped", "null field is handled").
- Skip tests for defensive branches that don't exist in the code.
- Don't over-test: the legacy `__tests__/global-transformations.test.ts` etc. have deeper coverage and will be re-enabled in Plan B.

---

## Task 1: Transformer factories + shared fake context helper

**Files:**
- Create: `src/transformers/createTransformer.ts`
- Create: `src/transformers/createDdbTransformer.ts`
- Create: `src/transformers/createOsTransformer.ts`
- Create: `__tests__/transformers/fakeContext.ts`
- Test: `__tests__/transformers/createTransformer.test.ts`

- [ ] **Step 1: Write the failing factory tests**

Create `__tests__/transformers/createTransformer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createTransformer } from "~/transformers/createTransformer.ts";
import { createDdbTransformer } from "~/transformers/createDdbTransformer.ts";
import { createOsTransformer } from "~/transformers/createOsTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { OsTransformContext } from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import type { OsScanner } from "~/features/OsScanner/index.ts";

describe("createTransformer", () => {
    it("returns a function compatible with Transformer.Interface", () => {
        const t = createTransformer<BaseTransformContext.Interface>("example", () => {});
        expect(typeof t).toBe("function");
    });

    it("attaches the name as a non-enumerable property", () => {
        const t = createTransformer<BaseTransformContext.Interface>("named", () => {});
        expect((t as unknown as { transformerName: string }).transformerName).toBe("named");
        const keys = Object.keys(t);
        expect(keys).not.toContain("transformerName");
    });

    it("invokes the function with the provided context", async () => {
        let captured: unknown = null;
        const t = createTransformer<BaseTransformContext.Interface>("cap", (ctx) => {
            captured = ctx;
        });
        const fakeCtx = { sentinel: true } as unknown as BaseTransformContext.Interface;
        await t(fakeCtx);
        expect(captured).toBe(fakeCtx);
    });
});

describe("createDdbTransformer", () => {
    it("returns a function typed against DdbTransformContext", () => {
        const t = createDdbTransformer("ddb", (_ctx) => {});
        const assignable: (ctx: DdbTransformContext.Interface) => void | Promise<void> = t;
        expect(typeof assignable).toBe("function");
    });

    it("attaches the name", () => {
        const t = createDdbTransformer("ddb-named", () => {});
        expect((t as unknown as { transformerName: string }).transformerName).toBe("ddb-named");
    });
});

describe("createOsTransformer", () => {
    it("returns a function typed against OsTransformContext", () => {
        const t = createOsTransformer("os", (_ctx) => {});
        const assignable: (
            ctx: OsTransformContext.Interface<OsScanner.Record>
        ) => void | Promise<void> = t;
        expect(typeof assignable).toBe("function");
    });

    it("attaches the name", () => {
        const t = createOsTransformer("os-named", () => {});
        expect((t as unknown as { transformerName: string }).transformerName).toBe("os-named");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test __tests__/transformers/createTransformer.test.ts`
Expected: FAIL — `createTransformer` is not exported from `~/transformers/createTransformer.ts` (module missing).

- [ ] **Step 3: Implement the generic factory**

Create `src/transformers/createTransformer.ts`:

```typescript
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";

export function createTransformer<TContext extends Processor.Context>(
    name: string,
    fn: Transformer.Interface<TContext>
): Transformer.Interface<TContext> {
    Object.defineProperty(fn, "transformerName", {
        value: name,
        enumerable: false,
        writable: false,
        configurable: false
    });
    return fn;
}
```

- [ ] **Step 4: Implement the DDB-specific factory**

Create `src/transformers/createDdbTransformer.ts`:

```typescript
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";
import { createTransformer } from "./createTransformer.ts";

export function createDdbTransformer(
    name: string,
    fn: Transformer.Interface<DdbTransformContext.Interface>
): Transformer.Interface<DdbTransformContext.Interface> {
    return createTransformer<DdbTransformContext.Interface>(name, fn);
}
```

- [ ] **Step 5: Implement the OS-specific factory**

Create `src/transformers/createOsTransformer.ts`:

```typescript
import type { OsTransformContext } from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import type { OsScanner } from "~/features/OsScanner/index.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";
import { createTransformer } from "./createTransformer.ts";

export function createOsTransformer(
    name: string,
    fn: Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>>
): Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>> {
    return createTransformer<OsTransformContext.Interface<OsScanner.Record>>(name, fn);
}
```

- [ ] **Step 6: Create the shared fake-context helper**

Create `__tests__/transformers/fakeContext.ts` (content as shown in "Test pattern" above — reproduced here verbatim so the file can be copy-pasted):

```typescript
import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export interface FakeContextOverrides {
    modelProvider?: unknown;
    cache?: unknown;
}

export function makeFakeBaseContext<T extends Record<string, unknown>>(
    record: T,
    overrides: FakeContextOverrides = {}
): BaseTransformContext.Interface<T> {
    const commands = new Commands();
    const ctx = {
        record,
        original: { ...record } as Readonly<T>,
        commands,
        modelProvider: overrides.modelProvider as BaseTransformContext.Interface["modelProvider"],
        cache: overrides.cache as BaseTransformContext.Interface["cache"],
        replace(newRecord: unknown): void {
            (ctx as { record: unknown }).record = newRecord;
        },
        putRecord(rec: Record<string, unknown>): void {
            void rec;
        },
        async queryRecord(
            _pk: string,
            _sk?: string
        ): Promise<Record<string, unknown> | null> {
            return null;
        },
        async executePipeline(): Promise<Commands> {
            return new Commands();
        }
    };
    return ctx as unknown as BaseTransformContext.Interface<T>;
}
```

- [ ] **Step 7: Run the factory tests**

Run: `yarn test __tests__/transformers/createTransformer.test.ts`
Expected: PASS (9 tests across 3 describe blocks).

- [ ] **Step 8: Format, type-check, commit**

```bash
yarn format:fix
yarn ts-check
git add src/transformers/createTransformer.ts \
        src/transformers/createDdbTransformer.ts \
        src/transformers/createOsTransformer.ts \
        __tests__/transformers/fakeContext.ts \
        __tests__/transformers/createTransformer.test.ts
git commit -m "feat: transformer factories (createTransformer + Ddb/Os variants)"
```

---

## Task 2: Pipeline factories

**Files:**
- Create: `src/domain/pipeline/createPipeline.ts`
- Create: `src/domain/pipeline/createDdbPipeline.ts`
- Create: `src/domain/pipeline/createOsPipeline.ts`
- Modify: `src/domain/pipeline/index.ts`
- Test: `__tests__/domain/pipeline/createPipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/domain/pipeline/createPipeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import { createDdbContainer } from "../../containers/index.ts";
import {
    createPipeline,
    createDdbPipeline,
    createOsPipeline,
    Scanner,
    Processor,
    createFilter
} from "~/domain/pipeline/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import type { FakeRecord, FakeContext, FakeShard } from "./fixtures/types.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";

describe("createPipeline", () => {
    it("returns a PipelineDefinition with a name", () => {
        const def = createPipeline<FakeRecord, FakeContext, FakeShard>("example", () => {});
        expect(def.name).toBe("example");
        expect(typeof def.register).toBe("function");
    });

    it("registers the pipeline with the runner when register() is called", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const def = createPipeline<FakeRecord, FakeContext, FakeShard>("p1", (b) => {
            b.filter(createFilter<FakeRecord>(() => true));
        });
        def.register(
            runner,
            Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
            Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
        );
        // Registering a second pipeline with the same name throws — proves first register worked.
        const def2 = createPipeline<FakeRecord, FakeContext, FakeShard>("p1", (b) => {
            b.filter(createFilter<FakeRecord>(() => true));
        });
        expect(() =>
            def2.register(
                runner,
                Scanner as Abstraction<Scanner.Interface<FakeRecord, FakeShard>>,
                Processor as Abstraction<Processor.Interface<FakeRecord, FakeContext>>
            )
        ).toThrow(/already registered/i);
    });
});

describe("createDdbPipeline", () => {
    it("registers against DdbScanner + DdbProcessor with zero generics at the call site", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        const def = createDdbPipeline("ddb-example", (b) => {
            b.filter(createFilter(() => true));
        });
        def.register(runner, DdbScanner, DdbProcessor);
        expect(def.name).toBe("ddb-example");
    });
});

describe("createOsPipeline", () => {
    it("returns a PipelineDefinition with a name (registration tested separately via the OS container)", () => {
        const def = createOsPipeline("os-example", (b) => {
            b.filter(createFilter(() => true));
        });
        expect(def.name).toBe("os-example");
        expect(typeof def.register).toBe("function");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test __tests__/domain/pipeline/createPipeline.test.ts`
Expected: FAIL — `createPipeline`, `createDdbPipeline`, `createOsPipeline` not exported from `~/domain/pipeline/index.ts`.

- [ ] **Step 3: Implement the generic pipeline factory**

Create `src/domain/pipeline/createPipeline.ts`:

```typescript
import type { Abstraction } from "@webiny/di";
import type { Scanner } from "./abstractions/Scanner.ts";
import type { Processor } from "./abstractions/Processor.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/index.ts";

export interface PipelineDefinition<TRecord, TContext extends Processor.Context, TShard> {
    readonly name: string;
    register(
        runner: PipelineRunner.Interface,
        scanner: Abstraction<Scanner.Interface<TRecord, TShard>>,
        processor: Abstraction<Processor.Interface<TRecord, TContext>>
    ): void;
}

export function createPipeline<TRecord, TContext extends Processor.Context, TShard>(
    name: string,
    configure: (builder: PipelineBuilder<TRecord, TContext, TShard>) => void
): PipelineDefinition<TRecord, TContext, TShard> {
    return {
        name,
        register(runner, scanner, processor) {
            const builder = runner.pipeline<TRecord, TContext, TShard>({
                name,
                scanner,
                processor
            });
            configure(builder);
            runner.register(builder.build());
        }
    };
}
```

- [ ] **Step 4: Implement the DDB-specific pipeline factory**

Create `src/domain/pipeline/createDdbPipeline.ts`:

```typescript
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { DdbScanner } from "~/features/DdbScanner/index.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import { createPipeline, type PipelineDefinition } from "./createPipeline.ts";

type DdbPipelineBuilder = PipelineBuilder<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>,
    DdbScanner.Shard
>;

type DdbPipelineDefinition = PipelineDefinition<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>,
    DdbScanner.Shard
>;

export function createDdbPipeline(
    name: string,
    configure: (builder: DdbPipelineBuilder) => void
): DdbPipelineDefinition {
    return createPipeline<
        BaseRecord,
        DdbTransformContext.Interface<BaseRecord>,
        DdbScanner.Shard
    >(name, configure);
}
```

- [ ] **Step 5: Implement the OS-specific pipeline factory**

Create `src/domain/pipeline/createOsPipeline.ts`:

```typescript
import type { OsScanner } from "~/features/OsScanner/index.ts";
import type { OsTransformContext } from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import { createPipeline, type PipelineDefinition } from "./createPipeline.ts";

type OsPipelineBuilder = PipelineBuilder<
    OsScanner.Record,
    OsTransformContext.Interface<OsScanner.Record>,
    OsScanner.Shard
>;

type OsPipelineDefinition = PipelineDefinition<
    OsScanner.Record,
    OsTransformContext.Interface<OsScanner.Record>,
    OsScanner.Shard
>;

export function createOsPipeline(
    name: string,
    configure: (builder: OsPipelineBuilder) => void
): OsPipelineDefinition {
    return createPipeline<
        OsScanner.Record,
        OsTransformContext.Interface<OsScanner.Record>,
        OsScanner.Shard
    >(name, configure);
}
```

- [ ] **Step 6: Re-export from the pipeline barrel**

Modify `src/domain/pipeline/index.ts`. Add at the end:

```typescript
export { createPipeline, type PipelineDefinition } from "./createPipeline.ts";
export { createDdbPipeline } from "./createDdbPipeline.ts";
export { createOsPipeline } from "./createOsPipeline.ts";
```

- [ ] **Step 7: Run the tests**

Run: `yarn test __tests__/domain/pipeline/createPipeline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Run the full suite to catch regressions**

Run: `yarn test 2>&1 | grep -E "Test Files|Tests "`
Expected: same counts as before + 4 new tests. No regressions.

- [ ] **Step 9: Format, type-check, commit**

```bash
yarn format:fix
yarn ts-check
git add src/domain/pipeline/createPipeline.ts \
        src/domain/pipeline/createDdbPipeline.ts \
        src/domain/pipeline/createOsPipeline.ts \
        src/domain/pipeline/index.ts \
        __tests__/domain/pipeline/createPipeline.test.ts
git commit -m "feat: pipeline factories (createPipeline + Ddb/Os variants)"
```

---

## Task 3: Port `global/` transformers

**Files (rename + rewrite 4 files):**
- Rename + rewrite: `src/transformers/global/wrap-in-data.ts` → `src/transformers/global/wrapInData.ts`
- Rename + rewrite: `src/transformers/global/add-gsi-tenant.ts` → `src/transformers/global/addGsiTenant.ts`
- Rename + rewrite: `src/transformers/global/remove-locale.ts` → `src/transformers/global/removeLocale.ts`
- Rename + rewrite: `src/transformers/global/remove-attributes.ts` → `src/transformers/global/removeAttributes.ts`
- Create: `src/transformers/global/index.ts` (barrel)
- Test: `__tests__/transformers/global/wrapInData.test.ts`
- Test: `__tests__/transformers/global/addGsiTenant.test.ts`
- Test: `__tests__/transformers/global/removeLocale.test.ts`
- Test: `__tests__/transformers/global/removeAttributes.test.ts`

All 4 transformers in this subdir use `createTransformer<BaseTransformContext.Interface>`.

- [ ] **Step 1: Rename all four files with `git mv`**

```bash
git mv src/transformers/global/wrap-in-data.ts src/transformers/global/wrapInData.ts
git mv src/transformers/global/add-gsi-tenant.ts src/transformers/global/addGsiTenant.ts
git mv src/transformers/global/remove-locale.ts src/transformers/global/removeLocale.ts
git mv src/transformers/global/remove-attributes.ts src/transformers/global/removeAttributes.ts
```

- [ ] **Step 2: Rewrite each file to use the new factory**

For each of the four files, apply the port pattern (see "Port pattern" above). The transformation is mechanical: swap the import + wrapper, keep the body.

For `wrapInData.ts`, the final shape is:

```typescript
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

const RESERVED_ATTRIBUTES = new Set([
    "PK",
    "SK",
    "GSI_TENANT",
    "GSI1_PK",
    "GSI1_SK",
    "GSI2_PK",
    "GSI2_SK",
    "TYPE",
    "data",
    "expiresAt",
    "_ct",
    "_et",
    "_md"
]);

/**
 * Wraps all non-reserved attributes in a `data` envelope
 */
export const wrapInData = createTransformer<BaseTransformContext.Interface>(
    "wrapInData",
    (ctx) => {
        const { record } = ctx;
        if (record.data) {
            return;
        }

        const dataEnvelope: Record<string, unknown> = {};
        const newRecord: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(record)) {
            if (RESERVED_ATTRIBUTES.has(key)) {
                newRecord[key] = value;
            } else {
                dataEnvelope[key] = value;
            }
        }

        newRecord.data = dataEnvelope;
        ctx.replace(newRecord);
    }
);
```

For the other three (`addGsiTenant`, `removeLocale`, `removeAttributes`), apply the same transformation: keep the existing body, wrap in `createTransformer<BaseTransformContext.Interface>("<name>", (ctx) => { ... })`. Preserve all JSDoc comments and file-level constants.

- [ ] **Step 3: Create the subdir barrel**

Create `src/transformers/global/index.ts`:

```typescript
export { wrapInData } from "./wrapInData.ts";
export { addGsiTenant } from "./addGsiTenant.ts";
export { removeLocale } from "./removeLocale.ts";
export { removeAttributes } from "./removeAttributes.ts";
```

- [ ] **Step 4: Write unit tests (all four)**

Create `__tests__/transformers/global/wrapInData.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { wrapInData } from "~/transformers/global/wrapInData.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("wrapInData", () => {
    it("wraps non-reserved attributes into a data envelope", () => {
        const ctx = makeFakeBaseContext({
            PK: "tenant",
            SK: "record",
            TYPE: "foo",
            name: "Alice",
            age: 42
        });
        wrapInData(ctx);
        expect((ctx.record as { PK: string }).PK).toBe("tenant");
        expect((ctx.record as { data: unknown }).data).toEqual({ name: "Alice", age: 42 });
        expect((ctx.record as { name?: unknown }).name).toBeUndefined();
    });

    it("leaves records that already have a data envelope alone", () => {
        const ctx = makeFakeBaseContext({
            PK: "tenant",
            SK: "record",
            TYPE: "foo",
            data: { preserved: true }
        });
        wrapInData(ctx);
        expect((ctx.record as { data: unknown }).data).toEqual({ preserved: true });
    });
});
```

Create `__tests__/transformers/global/addGsiTenant.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { addGsiTenant } from "~/transformers/global/addGsiTenant.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("addGsiTenant", () => {
    it("extracts the tenant ID from the PK and sets GSI_TENANT", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "REV#0001",
            TYPE: "cms.entry"
        });
        addGsiTenant(ctx);
        expect((ctx.record as { GSI_TENANT: string }).GSI_TENANT).toBe("root");
    });

    it("leaves the record unchanged when PK doesn't match the tenant pattern", () => {
        const ctx = makeFakeBaseContext({
            PK: "unusual-pk",
            SK: "x",
            TYPE: "other"
        });
        addGsiTenant(ctx);
        expect((ctx.record as { GSI_TENANT?: string }).GSI_TENANT).toBeUndefined();
    });
});
```

Create `__tests__/transformers/global/removeLocale.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { removeLocale } from "~/transformers/global/removeLocale.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("removeLocale", () => {
    it("strips locale segment from PK", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#L#en-US#CMS#CME#abc",
            SK: "REV#0001",
            TYPE: "cms.entry"
        });
        removeLocale(ctx);
        expect((ctx.record as { PK: string }).PK).toBe("T#root#CMS#CME#abc");
    });

    it("leaves PK unchanged when no locale segment is present", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "x",
            TYPE: "y"
        });
        removeLocale(ctx);
        expect((ctx.record as { PK: string }).PK).toBe("T#root#CMS#CME#abc");
    });
});
```

Create `__tests__/transformers/global/removeAttributes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { removeAttributes } from "~/transformers/global/removeAttributes.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("removeAttributes", () => {
    it("removes webinyVersion and locale top-level fields from the record", () => {
        const ctx = makeFakeBaseContext({
            PK: "p",
            SK: "s",
            TYPE: "t",
            webinyVersion: "5.43.0",
            locale: "en-US",
            data: { other: "field" }
        });
        removeAttributes(ctx);
        expect((ctx.record as { webinyVersion?: string }).webinyVersion).toBeUndefined();
        expect((ctx.record as { locale?: string }).locale).toBeUndefined();
        expect((ctx.record as { data: unknown }).data).toEqual({ other: "field" });
    });
});
```

> **Note:** The exact assertions in each test must match what the legacy transformer body actually does. The test cases above are illustrative based on the transformer names; when writing the test, the implementer should inspect the actual body (after porting) and assert behavior accordingly. If the legacy body removes different attributes than `webinyVersion`/`locale`, the test must match. Do NOT invent behavior that doesn't exist.

- [ ] **Step 5: Find and fix any remaining consumers of old kebab-case paths**

```bash
grep -rn 'transformers/global/wrap-in-data\|transformers/global/add-gsi-tenant\|transformers/global/remove-locale\|transformers/global/remove-attributes' src/ __tests__/ 2>/dev/null
```

Any matches — update to the new camelCase paths. Expected: matches in `src/presets/v5-to-v6-ddb.ts` and `src/presets/v5-to-v6-os.ts` (both excluded from the fallout list). Leave those alone — Plan B rewrites them.

If the grep returns hits OUTSIDE the excluded preset files, fix those imports. Otherwise proceed.

- [ ] **Step 6: Run the suite**

Run: `yarn test 2>&1 | grep -E "Test Files|Tests "`
Expected: +4 test files, +8-10 tests (actual count depends on assertions). No regressions.

Run: `yarn ts-check 2>&1 | grep "error TS" | grep -v "src/presets/example\|src/presets/v5-to-v6-\|src/commands/process\|__tests__/security-\|__tests__/cms-\|__tests__/global-\|__tests__/file-manager\|__tests__/folder-records\|__tests__/full-table\|__tests__/integration\|__tests__/mailer\|__tests__/os-table\|__tests__/preset-system\|__tests__/record-filtering\|__tests__/batch-processing"`
Expected: empty (no new errors outside the fallout list).

- [ ] **Step 7: Commit**

```bash
yarn format:fix
git add src/transformers/global/ __tests__/transformers/global/
git commit -m "feat: port global/ transformers to createTransformer factory"
```

---

## Task 4: Port `cms/` transformers (part 1 — 4 small ones)

**Files (rename + rewrite 4 files):**
- `src/transformers/cms/fix-cme-pk.ts` → `fixCmePk.ts`
- `src/transformers/cms/remove-folder-revision.ts` → `removeFolderRevision.ts`
- `src/transformers/cms/rename-field-attributes.ts` → `renameFieldAttributes.ts`
- `src/transformers/cms/transform-model-group.ts` → `transformModelGroup.ts`

All 4 use `createTransformer<BaseTransformContext.Interface>` unless the existing ctx parameter is typed `DdbTransformContext.Interface`. If the implementer finds a transformer typed against `DdbTransformContext.Interface`, switch to `createDdbTransformer` instead.

- [ ] **Step 1: Rename files with `git mv`**

```bash
git mv src/transformers/cms/fix-cme-pk.ts src/transformers/cms/fixCmePk.ts
git mv src/transformers/cms/remove-folder-revision.ts src/transformers/cms/removeFolderRevision.ts
git mv src/transformers/cms/rename-field-attributes.ts src/transformers/cms/renameFieldAttributes.ts
git mv src/transformers/cms/transform-model-group.ts src/transformers/cms/transformModelGroup.ts
```

- [ ] **Step 2: Rewrite each file using the port pattern**

Same mechanical transformation as Task 3 (see "Port pattern" above). For each file: drop `import type { Transformer }`, add the factory import, replace the `{ name, transform }` wrapper. Keep the body verbatim.

- [ ] **Step 3: Write one unit test per transformer**

Follow the test pattern from Task 3. One file per transformer at `__tests__/transformers/cms/<name>.test.ts`. Each has 1-2 `it()` cases covering the main behavior. Use `makeFakeBaseContext` from `../fakeContext.ts`.

Example skeleton for `__tests__/transformers/cms/fixCmePk.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { fixCmePk } from "~/transformers/cms/fixCmePk.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("fixCmePk", () => {
    it("removes duplicate #CME# segment from PK", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#L#en-US#CMS#CME#CME#abc123",
            SK: "REV#0001",
            TYPE: "cms.entry"
        });
        fixCmePk(ctx);
        expect((ctx.record as { PK: string }).PK).toBe("T#root#L#en-US#CMS#CME#abc123");
    });

    it("leaves PKs without duplicate #CME# unchanged", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "x",
            TYPE: "cms.entry"
        });
        fixCmePk(ctx);
        expect((ctx.record as { PK: string }).PK).toBe("T#root#CMS#CME#abc");
    });
});
```

For the other three, write one happy-path test matching each transformer's documented behavior (inspect the file's JSDoc comment for the intent, then assert that intent).

- [ ] **Step 4: Run the tests**

Run: `yarn test __tests__/transformers/cms/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/transformers/cms/fixCmePk.ts \
        src/transformers/cms/removeFolderRevision.ts \
        src/transformers/cms/renameFieldAttributes.ts \
        src/transformers/cms/transformModelGroup.ts \
        __tests__/transformers/cms/fixCmePk.test.ts \
        __tests__/transformers/cms/removeFolderRevision.test.ts \
        __tests__/transformers/cms/renameFieldAttributes.test.ts \
        __tests__/transformers/cms/transformModelGroup.test.ts
git commit -m "feat: port cms/ transformers (part 1: 4 small ones)"
```

---

## Task 5: Port `cms/` transformers (part 2 — 3 larger ones)

**Files:**
- `src/transformers/cms/fix-broken-storage-keys.ts` → `fixBrokenStorageKeys.ts`
- `src/transformers/cms/transform-rich-text.ts` → `transformRichText.ts`
- `src/transformers/cms/update-model-ids.ts` → `updateModelIds.ts`

These three are larger (95, 116, 49 lines). They use `ctx.modelProvider` (which is on `BaseTransformContext.Interface`), so factory choice is `createTransformer<BaseTransformContext.Interface>` unless the legacy ctx type says otherwise.

- [ ] **Step 1: Rename files**

```bash
git mv src/transformers/cms/fix-broken-storage-keys.ts src/transformers/cms/fixBrokenStorageKeys.ts
git mv src/transformers/cms/transform-rich-text.ts src/transformers/cms/transformRichText.ts
git mv src/transformers/cms/update-model-ids.ts src/transformers/cms/updateModelIds.ts
```

- [ ] **Step 2: Rewrite each file using the port pattern**

Same mechanical transformation. Preserve `async` on the `transformRichText` transform body (it's an async function). The new shape becomes:

```typescript
export const transformRichText = createTransformer<BaseTransformContext.Interface>(
    "transformRichText",
    async (ctx) => {
        // body unchanged, still async
    }
);
```

- [ ] **Step 3: Update `src/transformers/cms/index.ts`**

Create `src/transformers/cms/index.ts` (new file — doesn't exist today):

```typescript
export { fixCmePk } from "./fixCmePk.ts";
export { removeFolderRevision } from "./removeFolderRevision.ts";
export { renameFieldAttributes } from "./renameFieldAttributes.ts";
export { transformModelGroup } from "./transformModelGroup.ts";
export { fixBrokenStorageKeys } from "./fixBrokenStorageKeys.ts";
export { transformRichText } from "./transformRichText.ts";
export { updateModelIds } from "./updateModelIds.ts";
```

- [ ] **Step 4: Write unit tests**

One test file per transformer. For `transformRichText` and `updateModelIds`, the fake context needs a `modelProvider` stub:

```typescript
// __tests__/transformers/cms/updateModelIds.test.ts
import { describe, it, expect } from "vitest";
import { updateModelIds } from "~/transformers/cms/updateModelIds.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("updateModelIds", () => {
    it("replaces old model IDs with new ones via the model provider", async () => {
        const modelProvider = {
            async getModel(_tenant: string, _modelId: string) {
                return { modelId: "newModelId", fields: [] };
            },
            getSortedFields: () => []
        };
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "REV#0001",
                TYPE: "cms.entry",
                modelId: "oldModelId",
                data: {}
            },
            { modelProvider }
        );
        await updateModelIds(ctx);
        // Assertion depends on what updateModelIds actually does — check the body,
        // then assert. If it replaces modelId in record, assert:
        // expect((ctx.record as { modelId: string }).modelId).toBe("newModelId");
    });
});
```

> **Note:** The actual assertions depend on what each transformer does. Read the body after porting, understand what it mutates, and assert ONE clear behavior per test. Do not invent behavior. If a transformer's behavior is hard to test with a minimal fake context (e.g., transformRichText's Lexical → HTML conversion requires a real Lexical payload), the test may be a minimal "does not throw" smoke test — acceptable for this plan since the legacy excluded tests cover the full matrix.

Minimum: one `it()` case per transformer confirming the transformer produces the documented side effect.

- [ ] **Step 5: Run the suite**

Run: `yarn test __tests__/transformers/cms/`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/transformers/cms/ __tests__/transformers/cms/
git commit -m "feat: port cms/ transformers (part 2: 3 larger ones) + cms barrel"
```

---

## Task 6: Port `file-manager/`, `folders/`, `mailer/` transformers

**Files:**
- `src/transformers/file-manager/create-metadata.ts` → `createMetadata.ts`
- `src/transformers/file-manager/extract-image-metadata.ts` → `extractImageMetadata.ts`
- `src/transformers/file-manager/migrate-settings.ts` → `migrateFileManagerSettings.ts`
- `src/transformers/folders/update-flp-ids.ts` → `updateFlpIds.ts`
- `src/transformers/mailer/migrate-settings.ts` → `migrateMailerSettings.ts`

For each: same mechanical port. Inspect the ctx type during port to pick `createTransformer<BaseTransformContext.Interface>` vs `createDdbTransformer`. `extractImageMetadata` likely uses `ctx.getFile` (DDB-specific) → `createDdbTransformer`. Others default to generic.

- [ ] **Step 1: Rename files**

```bash
git mv src/transformers/file-manager/create-metadata.ts src/transformers/file-manager/createMetadata.ts
git mv src/transformers/file-manager/extract-image-metadata.ts src/transformers/file-manager/extractImageMetadata.ts
git mv src/transformers/file-manager/migrate-settings.ts src/transformers/file-manager/migrateFileManagerSettings.ts
git mv src/transformers/folders/update-flp-ids.ts src/transformers/folders/updateFlpIds.ts
git mv src/transformers/mailer/migrate-settings.ts src/transformers/mailer/migrateMailerSettings.ts
```

- [ ] **Step 2: Rewrite each file using the port pattern**

Same transformation. Check each ctx type during port to pick the right factory.

- [ ] **Step 3: Create subdir barrels**

`src/transformers/file-manager/index.ts`:

```typescript
export { createMetadata } from "./createMetadata.ts";
export { extractImageMetadata } from "./extractImageMetadata.ts";
export { migrateFileManagerSettings } from "./migrateFileManagerSettings.ts";
```

`src/transformers/folders/index.ts`:

```typescript
export { updateFlpIds } from "./updateFlpIds.ts";
```

`src/transformers/mailer/index.ts`:

```typescript
export { migrateMailerSettings } from "./migrateMailerSettings.ts";
```

- [ ] **Step 4: Write unit tests (5 files)**

One test per transformer. For `extractImageMetadata`, the fake context may need a `getFile` stub if the transformer uses it — in that case, use `createDdbTransformer`-typed context (extend the fake helper if needed, or assert minimal behavior with `as any`-typed stubs).

Example for `updateFlpIds`:

```typescript
// __tests__/transformers/folders/updateFlpIds.test.ts
import { describe, it, expect } from "vitest";
import { updateFlpIds } from "~/transformers/folders/updateFlpIds.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("updateFlpIds", () => {
    it("strips #0001 revision suffix from data.id and data.parentId", () => {
        const ctx = makeFakeBaseContext({
            PK: "p",
            SK: "s",
            TYPE: "flp",
            data: {
                id: "abc123#0001",
                parentId: "def456#0001"
            }
        });
        updateFlpIds(ctx);
        expect((ctx.record as { data: { id: string } }).data.id).toBe("abc123");
        expect((ctx.record as { data: { parentId: string } }).data.parentId).toBe("def456");
    });
});
```

- [ ] **Step 5: Run the suite**

Run: `yarn test __tests__/transformers/`
Expected: all tests pass. Check ts-check for new errors outside the fallout list.

- [ ] **Step 6: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/transformers/file-manager/ src/transformers/folders/ src/transformers/mailer/ \
        __tests__/transformers/file-manager/ __tests__/transformers/folders/ __tests__/transformers/mailer/
git commit -m "feat: port file-manager/, folders/, mailer/ transformers + subdir barrels"
```

---

## Task 7: Port `security/` transformers

**Files:**
- `src/transformers/security/groups-to-roles.ts` → `groupsToRoles.ts`
- `src/transformers/security/remove-tenant.ts` → `removeTenant.ts`
- `src/transformers/security/transform-permissions.ts` → `transformPermissions.ts`

All three default to `createTransformer<BaseTransformContext.Interface>`.

- [ ] **Step 1: Rename files**

```bash
git mv src/transformers/security/groups-to-roles.ts src/transformers/security/groupsToRoles.ts
git mv src/transformers/security/remove-tenant.ts src/transformers/security/removeTenant.ts
git mv src/transformers/security/transform-permissions.ts src/transformers/security/transformPermissions.ts
```

- [ ] **Step 2: Rewrite using the port pattern**

Same mechanical change.

- [ ] **Step 3: Create subdir barrel**

`src/transformers/security/index.ts`:

```typescript
export { groupsToRoles } from "./groupsToRoles.ts";
export { removeTenant } from "./removeTenant.ts";
export { transformPermissions } from "./transformPermissions.ts";
```

- [ ] **Step 4: Write unit tests (3 files)**

Follow the test pattern. Check each transformer body for what it actually does. Assert that one clear behavior.

Example skeleton for `groupsToRoles`:

```typescript
// __tests__/transformers/security/groupsToRoles.test.ts
import { describe, it, expect } from "vitest";
import { groupsToRoles } from "~/transformers/security/groupsToRoles.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("groupsToRoles", () => {
    it("transforms security.group record into a role-shaped record", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#GROUP#admin",
            SK: "GROUP",
            TYPE: "security.group",
            data: { name: "Administrators" }
        });
        groupsToRoles(ctx);
        // Assert whatever the transformer does — check the body.
        // e.g., expect((ctx.record as { TYPE: string }).TYPE).toBe("security.role");
    });
});
```

- [ ] **Step 5: Commit**

```bash
yarn format:fix
yarn ts-check
git add src/transformers/security/ __tests__/transformers/security/
git commit -m "feat: port security/ transformers + subdir barrel"
```

---

## Task 8: Top-level `src/transformers/index.ts` barrel

**Files:**
- Create: `src/transformers/index.ts`

- [ ] **Step 1: Create the top-level barrel**

Create `src/transformers/index.ts`:

```typescript
// Factories
export { createTransformer } from "./createTransformer.ts";
export { createDdbTransformer } from "./createDdbTransformer.ts";
export { createOsTransformer } from "./createOsTransformer.ts";

// Built-in transformers grouped by domain
export * from "./global/index.ts";
export * from "./cms/index.ts";
export * from "./file-manager/index.ts";
export * from "./folders/index.ts";
export * from "./mailer/index.ts";
export * from "./security/index.ts";
```

- [ ] **Step 2: Verify no export name collisions**

Run: `yarn ts-check 2>&1 | grep "error TS" | grep -v "src/presets/example\|src/presets/v5-to-v6-\|src/commands/process\|__tests__/security-\|__tests__/cms-\|__tests__/global-\|__tests__/file-manager\|__tests__/folder-records\|__tests__/full-table\|__tests__/integration\|__tests__/mailer\|__tests__/os-table\|__tests__/preset-system\|__tests__/record-filtering\|__tests__/batch-processing"`
Expected: empty. If there's a collision between, say, `migrate-settings` coming from both `file-manager/` and `mailer/` subdirs, it'll surface here. The rename step already renamed them to `migrateFileManagerSettings` + `migrateMailerSettings` so no collision should exist.

- [ ] **Step 3: Commit**

```bash
yarn format:fix
git add src/transformers/index.ts
git commit -m "feat: top-level transformers/ barrel"
```

---

## Task 9: Sub-pipeline definitions (`cms-entry`, `cms-model`, `fm-file`)

**Files:**
- Create: `src/presets/v5-to-v6/pipelines/cms-entry.ts`
- Create: `src/presets/v5-to-v6/pipelines/cms-model.ts`
- Create: `src/presets/v5-to-v6/pipelines/fm-file.ts`
- Test: `__tests__/presets/v5-to-v6/pipelines/cms-entry.test.ts`
- Test: `__tests__/presets/v5-to-v6/pipelines/cms-model.test.ts`
- Test: `__tests__/presets/v5-to-v6/pipelines/fm-file.test.ts`

These replace the legacy class-based `CmsEntryPipeline.ts`, `CmsModelPipeline.ts`, `FmFilePipeline.ts` at `src/presets/v5-to-v6/`. Inspect each legacy class to see which filter + transformer chain it composed; replicate that chain via `createDdbPipeline`.

- [ ] **Step 1: Read the legacy sub-pipeline classes to extract filter + transformer chain**

```bash
cat src/presets/v5-to-v6/CmsEntryPipeline.ts
cat src/presets/v5-to-v6/CmsModelPipeline.ts
cat src/presets/v5-to-v6/FmFilePipeline.ts
```

Record the filter predicate + transformer list for each. Example (from `CmsEntryPipeline`): filter is `isCmsEntry`, transformers are `wrapInData, addGsiTenant, removeLocale, fixCmePk, fixBrokenStorageKeys, transformRichText, updateModelIds, removeFolderRevision, removeAttributes`. The exact chain varies per class — use what the legacy code says.

- [ ] **Step 2: Create `cms-entry.ts`**

Create `src/presets/v5-to-v6/pipelines/cms-entry.ts`:

```typescript
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isCmsEntry } from "~/domain/transform/filters.ts";
import {
    wrapInData,
    addGsiTenant,
    removeLocale,
    removeAttributes
} from "~/transformers/global/index.ts";
import {
    fixCmePk,
    fixBrokenStorageKeys,
    transformRichText,
    updateModelIds,
    removeFolderRevision
} from "~/transformers/cms/index.ts";

export const cmsEntryPipeline = createDdbPipeline("cms-entries", (builder) => {
    builder
        .filter(createFilter(isCmsEntry))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeLocale)
        .use(fixCmePk)
        .use(fixBrokenStorageKeys)
        .use(transformRichText)
        .use(updateModelIds)
        .use(removeFolderRevision)
        .use(removeAttributes);
});
```

Adjust the transformer list to match the LEGACY `CmsEntryPipeline.ts` chain exactly. If the legacy class included an extra transformer or skipped one, preserve that.

- [ ] **Step 3: Create `cms-model.ts`**

Same pattern. Use whatever filter + transformers the legacy `CmsModelPipeline.ts` composed:

```typescript
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isCmsModel } from "~/domain/transform/filters.ts";
import {
    wrapInData,
    addGsiTenant,
    removeLocale,
    removeAttributes
} from "~/transformers/global/index.ts";
import { renameFieldAttributes, transformModelGroup } from "~/transformers/cms/index.ts";

export const cmsModelPipeline = createDdbPipeline("cms-models", (builder) => {
    builder
        .filter(createFilter(isCmsModel))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeLocale)
        .use(renameFieldAttributes)
        .use(transformModelGroup)
        .use(removeAttributes);
});
```

Adjust to match the legacy chain.

- [ ] **Step 4: Create `fm-file.ts`**

Same pattern. Use whatever filter + transformers the legacy `FmFilePipeline.ts` composed:

```typescript
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isFmFile } from "~/domain/transform/filters.ts";
import {
    wrapInData,
    addGsiTenant,
    removeLocale,
    removeAttributes
} from "~/transformers/global/index.ts";
import {
    createMetadata,
    extractImageMetadata
} from "~/transformers/file-manager/index.ts";

export const fmFilePipeline = createDdbPipeline("fm-files", (builder) => {
    builder
        .filter(createFilter(isFmFile))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeLocale)
        .use(createMetadata)
        .use(extractImageMetadata)
        .use(removeAttributes);
});
```

Adjust to match the legacy chain. If `isFmFile` filter doesn't exist in `~/domain/transform/filters.ts`, check the legacy class for the filter function it used (it might define its own inline predicate — use `createFilter((r) => /* predicate */)` inline).

- [ ] **Step 5: Write definition tests**

Create `__tests__/presets/v5-to-v6/pipelines/cms-entry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { cmsEntryPipeline } from "~/presets/v5-to-v6/pipelines/cms-entry.ts";

describe("cmsEntryPipeline", () => {
    it("has the expected name", () => {
        expect(cmsEntryPipeline.name).toBe("cms-entries");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        cmsEntryPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => cmsEntryPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});
```

Same pattern for `cms-model.test.ts` and `fm-file.test.ts` (change the imported const name + expected `.name` value).

- [ ] **Step 6: Delete the legacy sub-pipeline classes**

```bash
git rm src/presets/v5-to-v6/CmsEntryPipeline.ts \
       src/presets/v5-to-v6/CmsModelPipeline.ts \
       src/presets/v5-to-v6/FmFilePipeline.ts
```

The legacy v5-to-v6 presets (`src/presets/v5-to-v6-ddb.ts`, `src/presets/v5-to-v6-os.ts`) still import these classes. That's expected — those presets are already in the ts-check fallout list and stay broken until Plan B.

- [ ] **Step 7: Run tests**

Run: `yarn test __tests__/presets/v5-to-v6/pipelines/`
Expected: 6 tests pass (2 per file).

Run: `yarn ts-check 2>&1 | grep "error TS" | grep -v "src/presets/example\|src/presets/v5-to-v6-\|src/commands/process\|__tests__/security-\|__tests__/cms-\|__tests__/global-\|__tests__/file-manager\|__tests__/folder-records\|__tests__/full-table\|__tests__/integration\|__tests__/mailer\|__tests__/os-table\|__tests__/preset-system\|__tests__/record-filtering\|__tests__/batch-processing"`
Expected: empty. The legacy presets may have more errors now (because `CmsEntryPipeline` etc. are deleted), but those are already in the fallout list and filtered out.

- [ ] **Step 8: Commit**

```bash
yarn format:fix
git add src/presets/v5-to-v6/pipelines/ __tests__/presets/v5-to-v6/pipelines/
git commit -m "feat: v5-to-v6 pipeline definitions (cmsEntry, cmsModel, fmFile)"
```

---

## Task 10: Public API — expand `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read the current `src/index.ts`**

Current public exports: `createDdbTransfer`, `createOsTransfer`, `loadEnv`. This task adds the transformer library surface without disrupting them.

- [ ] **Step 2: Expand exports**

Modify `src/index.ts`. Add at the end (preserve existing exports at the top):

```typescript
// Transformer factories
export { createTransformer } from "./transformers/createTransformer.ts";
export { createDdbTransformer } from "./transformers/createDdbTransformer.ts";
export { createOsTransformer } from "./transformers/createOsTransformer.ts";

// Built-in transformers (grouped exports)
export {
    wrapInData,
    addGsiTenant,
    removeLocale,
    removeAttributes
} from "./transformers/global/index.ts";
export {
    fixCmePk,
    fixBrokenStorageKeys,
    transformRichText,
    updateModelIds,
    removeFolderRevision,
    renameFieldAttributes,
    transformModelGroup
} from "./transformers/cms/index.ts";
export {
    createMetadata,
    extractImageMetadata,
    migrateFileManagerSettings
} from "./transformers/file-manager/index.ts";
export { updateFlpIds } from "./transformers/folders/index.ts";
export { migrateMailerSettings } from "./transformers/mailer/index.ts";
export {
    groupsToRoles,
    removeTenant,
    transformPermissions
} from "./transformers/security/index.ts";

// Pipeline factories
export { createPipeline, type PipelineDefinition } from "./domain/pipeline/createPipeline.ts";
export { createDdbPipeline } from "./domain/pipeline/createDdbPipeline.ts";
export { createOsPipeline } from "./domain/pipeline/createOsPipeline.ts";

// v5-to-v6 built-in pipeline definitions
export { cmsEntryPipeline } from "./presets/v5-to-v6/pipelines/cms-entry.ts";
export { cmsModelPipeline } from "./presets/v5-to-v6/pipelines/cms-model.ts";
export { fmFilePipeline } from "./presets/v5-to-v6/pipelines/fm-file.ts";

// Context types for user-written transformers
export type { BaseTransformContext } from "./features/TransformContext/abstractions/BaseTransformContext.ts";
export type { DdbTransformContext } from "./features/TransformContext/abstractions/DdbTransformContext.ts";
export type { OsTransformContext } from "./features/TransformContext/abstractions/OsTransformContext.ts";

// Transformer type shape for custom transformers
export type { Transformer } from "./domain/pipeline/abstractions/Transformer.ts";
```

- [ ] **Step 3: Run type-check + tests**

Run: `yarn ts-check 2>&1 | grep "error TS" | grep -v "src/presets/example\|src/presets/v5-to-v6-\|src/commands/process\|__tests__/security-\|__tests__/cms-\|__tests__/global-\|__tests__/file-manager\|__tests__/folder-records\|__tests__/full-table\|__tests__/integration\|__tests__/mailer\|__tests__/os-table\|__tests__/preset-system\|__tests__/record-filtering\|__tests__/batch-processing"`
Expected: empty.

Run: `yarn test 2>&1 | grep -E "Test Files|Tests "`
Expected: no regressions.

- [ ] **Step 4: Commit**

```bash
yarn format:fix
git add src/index.ts
git commit -m "feat: expose transformer library + pipeline factories from public API"
```

---

## Task 11: Delete legacy `Transformer.ts` + verify + final

**Files:**
- Delete: `src/domain/transform/Transformer.ts`

The legacy `src/domain/transform/Transformer.ts` exports the `Transformer` interface (`{ name, transform }` shape) + related types. After all ports, nothing outside the excluded legacy presets (`v5-to-v6-ddb.ts`, `v5-to-v6-os.ts`) and the excluded legacy test files references it.

- [ ] **Step 1: Grep for remaining consumers**

```bash
grep -rn 'from ".*domain/transform/Transformer"' src/ __tests__/ --include="*.ts" 2>/dev/null | \
    grep -v 'src/presets/v5-to-v6-\|src/commands/process\|__tests__/security-\|__tests__/cms-\|__tests__/global-\|__tests__/file-manager\|__tests__/folder-records\|__tests__/full-table\|__tests__/integration\|__tests__/mailer\|__tests__/os-table\|__tests__/preset-system\|__tests__/record-filtering\|__tests__/batch-processing\|__tests__/nested-pipeline\|__tests__/preset-pipelines'
```

Expected: empty. If there are unexpected consumers, stop and investigate — they may be real code that needs updating.

- [ ] **Step 2: Delete the file**

```bash
git rm src/domain/transform/Transformer.ts
```

- [ ] **Step 3: Run type-check + tests**

Run: `yarn ts-check 2>&1 | grep "error TS" | grep -v "src/presets/example\|src/presets/v5-to-v6-\|src/commands/process\|__tests__/security-\|__tests__/cms-\|__tests__/global-\|__tests__/file-manager\|__tests__/folder-records\|__tests__/full-table\|__tests__/integration\|__tests__/mailer\|__tests__/os-table\|__tests__/preset-system\|__tests__/record-filtering\|__tests__/batch-processing\|__tests__/nested-pipeline\|__tests__/preset-pipelines"`
Expected: empty (the excluded v5-to-v6 presets + legacy tests will have more errors, but they're filtered out).

Run: `yarn test 2>&1 | grep -E "Test Files|Tests "`
Expected: test counts stable or slightly higher (new unit tests across this plan).

- [ ] **Step 4: Commit**

```bash
yarn format:fix
git add -A
git commit -m "chore: delete legacy Transformer interface, now fully replaced by plain functions"
```

---

## Task 12: Final verification + summary

**Files:** none modified.

- [ ] **Step 1: Format check**

Run: `yarn format:fix`
Expected: no-op (or minor whitespace tweaks).

- [ ] **Step 2: Type-check**

Run: `yarn ts-check 2>&1 | grep "error TS" | wc -l` — note the count.

Run: `yarn ts-check 2>&1 | grep "error TS" | grep -v "src/presets/example\|src/presets/v5-to-v6-\|src/commands/process\|__tests__/security-\|__tests__/cms-\|__tests__/global-\|__tests__/file-manager\|__tests__/folder-records\|__tests__/full-table\|__tests__/integration\|__tests__/mailer\|__tests__/os-table\|__tests__/preset-system\|__tests__/record-filtering\|__tests__/batch-processing\|__tests__/nested-pipeline\|__tests__/preset-pipelines"`
Expected: empty.

- [ ] **Step 3: Test suite**

Run: `yarn test 2>&1 | grep -E "Test Files|Tests "`
Expected: all pass. Count is baseline (352) + ~30 new tests (19 transformer tests + 4 factory tests + 6 pipeline-def tests + 4 pipeline-factory tests) ≈ 380-ish. Record the actual number.

- [ ] **Step 4: Commit log review**

Run: `git log --oneline -14`
Expected: 11 task commits + this plan's spec + plan commits at the top.

- [ ] **Step 5: Public API inventory**

Read `src/index.ts`. Confirm exports:
- Transformer factories: `createTransformer`, `createDdbTransformer`, `createOsTransformer`.
- All 19 built-in transformers (named exports).
- Pipeline factories: `createPipeline`, `PipelineDefinition`, `createDdbPipeline`, `createOsPipeline`.
- 3 pipeline definitions: `cmsEntryPipeline`, `cmsModelPipeline`, `fmFilePipeline`.
- Context types: `BaseTransformContext`, `DdbTransformContext`, `OsTransformContext`.
- `Transformer` namespace (for type import).

- [ ] **Step 6: Report**

Final summary to the user (the controller reporting to the human):

- Number of commits added by this plan (~11).
- Final test count.
- Public API surface added.
- What this enables: **Plan B (preset migration)** becomes a drop-in rewrite. The legacy `v5-to-v6-ddb.ts` and `v5-to-v6-os.ts` presets get replaced by a new preset that uses `cmsEntryPipeline.register(runner, DdbScanner, DdbProcessor)` etc. + optionally inline pipelines via `createDdbPipeline(...)`. Legacy `src/domain/transform/Pipeline.ts` and `PipelineBuilder.ts` can be deleted during Plan B.

No commit in this task.

---

## What this enables

After this plan lands:

- **Users** can import `{ wrapInData, addGsiTenant, ..., createDdbTransformer, cmsEntryPipeline, type BaseTransformContext }` from `@webiny/data-transfer` and build their own presets + custom transformers.
- **Plan B (preset migration)** becomes a drop-in rewrite — the v5-to-v6-* presets get replaced with compositions of the built-in pipeline definitions + inline `createDdbPipeline`/`createOsPipeline` calls.
- **Legacy `src/domain/transform/Transformer.ts`** is gone; `Pipeline.ts` and `PipelineBuilder.ts` can be deleted as part of Plan B once the v5-to-v6 presets stop using them.
