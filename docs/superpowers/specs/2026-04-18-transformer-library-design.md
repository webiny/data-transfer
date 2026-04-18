# Transformer Library Design

**Status:** Approved spec / pending implementation plan
**Date:** 2026-04-18
**Implements:** built-in transformer library + factories + pipeline helper functions, using the plain-function transformer model established on 2026-04-18 (`Transformer.Interface<TContext>` as a function type).

---

## Goal

Port the ~15 existing transformers (currently `{ name, transform }` object literals wrapped around the legacy `Transformer` interface) to plain functions that plug into `pipeline.use()` directly. Add factory helpers with context-specific variants so users (and we) get type inference without writing generics. Expose the framework's built-in context types publicly so users can consume them as-is, use our specific factories, or extend them for custom pipelines. Convert the three class-based sub-pipelines (`CmsEntryPipeline`, `CmsModelPipeline`, `FmFilePipeline`) into one-file-per-pipeline register functions.

After this lands, users of `@webiny/data-transfer` can:
- `import { wrapInData, addGsiTenant, ... }` and chain them into their own pipelines.
- `import { createDdbTransformer }` and write their own DDB-bound transformers with full type inference.
- `import { registerCmsEntryPipeline }` and inject it into their preset's `configure(runner)`.
- Or write their own context types that extend `BaseTransformContext.Interface` and use the generic `createTransformer<MyContext>` for full flexibility.

---

## Scope

### In scope

- **Factories:**
  - `createTransformer<TContext>(name, fn)` — generic, explicit TContext parameter.
  - `createDdbTransformer(name, fn)` — pre-bound to `DdbTransformContext.Interface`.
  - `createOsTransformer(name, fn)` — pre-bound to `OsTransformContext.Interface<OsScanner.Record>`.
  - All three attach the `name` as a non-enumerable property on the returned function for debug logging.
- **Port all ~15 existing transformers** to plain functions using the appropriate factory. Existing folder structure under `src/transformers/` preserved (`global/`, `cms/`, `file-manager/`, `folders/`, `mailer/`, `security/`).
- **Pipeline factories** (mirror the transformer factory pattern):
  - `createPipeline<TRecord, TContext, TShard>(name, configure)` — generic.
  - `createDdbPipeline(name, configure)` — pre-bound to `BaseRecord` + `DdbTransformContext.Interface<BaseRecord>` + `DdbScanner.Shard`.
  - `createOsPipeline(name, configure)` — pre-bound to `OsScanner.Record` + `OsTransformContext.Interface<OsScanner.Record>` + `OsScanner.Shard`.
  - Each returns a `PipelineDefinition` object with `.register(runner, scanner, processor)` to wire into a runner.
- **Convert 3 sub-pipeline classes** to `PipelineDefinition` consts at `src/presets/v5-to-v6/pipelines/` — `cms-entry.ts`, `cms-model.ts`, `fm-file.ts`. Each file exports one `PipelineDefinition` const built via the appropriate pipeline factory.
- **Expose context types publicly** from the main package index:
  - `BaseTransformContext` (namespace with `.Interface`).
  - `DdbTransformContext` (namespace with `.Interface`).
  - `OsTransformContext` (namespace with `.Interface`).
- **Public API surface** — `src/index.ts` re-exports factories, all transformers, context types, and helper register functions.
- **Per-transformer unit tests** — one small test per transformer at `__tests__/transformers/.../xxx.test.ts`. Tests call the function directly with a fake context, assert behavior. Do NOT exercise the runner; that's preset migration territory.
- **Delete the legacy `src/domain/transform/Transformer.ts` file** (old `Transformer` interface with `.name + .transform`). Its only consumers today are the to-be-ported transformers and the stubbed handlers. After the port, nothing references it.

### Out of scope

- **Preset migration** (`v5-to-v6-ddb.ts`, `v5-to-v6-os.ts`). Those still use the legacy `PipelineBuilder` + legacy `Transformer` shape and stay on the excluded list until Plan B. This plan does NOT touch them.
- **Re-enabling the 14 excluded legacy tests.** They test transformers via `TransformPipeline` + `MigrationRunner`. Re-enabling requires preset migration first. Plan B.
- **S3 transformers / factories.** Deferred until there's an actual S3-source use case.
- **Re-writing any transformer's internals.** This is a port, not a rewrite. Each transformer's body copy-pastes into the new shape; only the wrapper changes.
- **`Transformer.Interface` type changes.** Stays as `(ctx: TContext) => void | Promise<void>` from the 2026-04-18 refactor.

### Accepted state

- Pre-existing ts-check fallout list expected to shrink: once `src/transformers/**.ts` ports over, the transformer files drop out of the error list. The remaining errors (in `src/presets/v5-to-v6-*.ts` and excluded legacy test files) stay until Plan B.

---

## Architecture

### Module layout

```
src/
├── domain/pipeline/
│   ├── createPipeline.ts              # Generic pipeline factory
│   ├── createDdbPipeline.ts           # DDB-specific pipeline factory (wraps generic)
│   ├── createOsPipeline.ts            # OS-specific pipeline factory (wraps generic)
│   └── index.ts                       # Re-exports all three
├── transformers/
│   ├── createTransformer.ts           # Generic transformer factory
│   ├── createDdbTransformer.ts        # DDB-specific factory (wraps generic)
│   ├── createOsTransformer.ts         # OS-specific factory (wraps generic)
│   ├── index.ts                       # Barrel — re-exports all factories + all transformers
│   ├── global/
│   │   ├── wrapInData.ts
│   │   ├── addGsiTenant.ts
│   │   ├── removeLocale.ts
│   │   ├── removeAttributes.ts
│   │   └── index.ts                   # Barrel for global/
│   ├── cms/
│   │   ├── fixCmePk.ts
│   │   ├── fixBrokenStorageKeys.ts
│   │   ├── transformRichText.ts
│   │   ├── updateModelIds.ts
│   │   ├── removeFolderRevision.ts
│   │   └── index.ts
│   ├── file-manager/
│   │   ├── migrateFileManagerSettings.ts
│   │   └── index.ts
│   ├── folders/
│   │   ├── updateFlpIds.ts
│   │   └── index.ts
│   ├── mailer/
│   │   ├── migrateMailerSettings.ts
│   │   └── index.ts
│   └── security/
│       ├── groupsToRoles.ts
│       ├── transformPermissions.ts
│       └── index.ts
│
└── presets/v5-to-v6/pipelines/
    ├── cms-entry.ts                   # registerCmsEntryPipeline
    ├── cms-model.ts                   # registerCmsModelPipeline
    └── fm-file.ts                     # registerFmFilePipeline
```

The existing `src/transformers/` tree stays put. Each file's content changes from object-literal to plain function via the appropriate factory. One transformer per file — matching the existing naming — so kebab-case filenames map to camelCase exports (e.g., `wrap-in-data.ts` renamed to `wrapInData.ts` to match the export name). Both are valid; we standardize to match the export name since it's the name users type.

### Factories

**Generic factory** at `src/transformers/createTransformer.ts`:

```typescript
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";

/**
 * Generic transformer factory. Returns the function as-is (type-preserving)
 * and attaches the `name` as a non-enumerable property for debug logging.
 *
 * Use when your transformer's context type doesn't match one of the
 * pre-bound factories, or when you've defined your own context type
 * that extends `BaseTransformContext.Interface`.
 */
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

**DDB-specific factory** at `src/transformers/createDdbTransformer.ts`:

```typescript
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";
import { createTransformer } from "./createTransformer.ts";

export function createDdbTransformer(
    name: string,
    fn: Transformer.Interface<DdbTransformContext.Interface>
): Transformer.Interface<DdbTransformContext.Interface> {
    return createTransformer(name, fn);
}
```

**OS-specific factory** at `src/transformers/createOsTransformer.ts`:

```typescript
import type { OsTransformContext } from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import type { OsScanner } from "~/features/OsScanner/index.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";
import { createTransformer } from "./createTransformer.ts";

export function createOsTransformer(
    name: string,
    fn: Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>>
): Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>> {
    return createTransformer(name, fn);
}
```

Both pre-bound factories are thin wrappers over the generic one. Their value is type inference: callers don't write the context generic, TypeScript figures out `ctx` from the factory.

### Transformer file pattern

Each transformer is one file, exporting one const. Example (before/after):

**Before** (`src/transformers/global/wrap-in-data.ts`):

```typescript
import type { Transformer } from "~/domain/transform/Transformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

const RESERVED_ATTRIBUTES = new Set([/* ... */]);

export const wrapInData: Transformer = {
    name: "wrapInData",
    transform(ctx: BaseTransformContext.Interface) {
        // body
    }
};
```

**After** (`src/transformers/global/wrapInData.ts`):

```typescript
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

const RESERVED_ATTRIBUTES = new Set([/* ... */]);

export const wrapInData = createTransformer<BaseTransformContext.Interface>("wrapInData", (ctx) => {
    // body — unchanged
});
```

Note: `wrapInData` uses the generic factory (not DDB-specific) because it operates on the broader `BaseTransformContext.Interface`. DDB-specific transformers (e.g., `fixCmePk` that relies on DDB-only ctx methods) use `createDdbTransformer`. OS-specific transformers (future) use `createOsTransformer`. The generic factory is for transformers that work across contexts.

### Determining which factory each transformer uses

For each existing transformer, determine factory choice by its actual ctx usage:

| Transformer | Current ctx type | Factory |
| --- | --- | --- |
| `wrapInData` | `BaseTransformContext.Interface` | `createTransformer<BaseTransformContext.Interface>` |
| `addGsiTenant` | `BaseTransformContext.Interface` | `createTransformer<BaseTransformContext.Interface>` |
| `removeLocale` | `BaseTransformContext.Interface` | `createTransformer<BaseTransformContext.Interface>` |
| `removeAttributes` | `BaseTransformContext.Interface` | `createTransformer<BaseTransformContext.Interface>` |
| `migrateFileManagerSettings` | `BaseTransformContext.Interface` (inspection needed) | `createTransformer<BaseTransformContext.Interface>` or `createDdbTransformer` |
| `updateFlpIds` | inspection needed | likely `createTransformer` |
| `migrateMailerSettings` | inspection needed | likely `createTransformer` |
| `groupsToRoles` | inspection needed | likely `createTransformer` |
| `transformPermissions` | inspection needed | likely `createTransformer` |
| `fixCmePk` | needs DDB-specific features? | `createDdbTransformer` if uses `copyFile` / `getFile`; else `createTransformer` |
| `fixBrokenStorageKeys` | inspection needed | `createDdbTransformer` probably |
| `transformRichText` | uses `modelProvider` | `createTransformer<BaseTransformContext.Interface>` (modelProvider is on Base) |
| `updateModelIds` | uses `modelProvider` | `createTransformer<BaseTransformContext.Interface>` |
| `removeFolderRevision` | inspection needed | likely `createTransformer` |

The implementation plan (separate doc) lists the exact factory per file after inspecting each. The rule: use the narrowest factory whose context type covers the transformer's actual usage. Generic is the default; pre-bound is only when the transformer uses DDB- or OS-specific ctx methods.

### Pipeline factories

**Generic factory** at `src/domain/pipeline/createPipeline.ts`:

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

**DDB-specific factory** at `src/domain/pipeline/createDdbPipeline.ts`:

```typescript
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { DdbScanner } from "~/features/DdbScanner/index.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import { createPipeline, type PipelineDefinition } from "./createPipeline.ts";

type DdbBuilder = PipelineBuilder<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>,
    DdbScanner.Shard
>;

export function createDdbPipeline(
    name: string,
    configure: (builder: DdbBuilder) => void
): PipelineDefinition<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>,
    DdbScanner.Shard
> {
    return createPipeline<
        BaseRecord,
        DdbTransformContext.Interface<BaseRecord>,
        DdbScanner.Shard
    >(name, configure);
}
```

**OS-specific factory** at `src/domain/pipeline/createOsPipeline.ts`:

```typescript
import type { OsScanner } from "~/features/OsScanner/index.ts";
import type { OsTransformContext } from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import { createPipeline, type PipelineDefinition } from "./createPipeline.ts";

type OsBuilder = PipelineBuilder<
    OsScanner.Record,
    OsTransformContext.Interface<OsScanner.Record>,
    OsScanner.Shard
>;

export function createOsPipeline(
    name: string,
    configure: (builder: OsBuilder) => void
): PipelineDefinition<
    OsScanner.Record,
    OsTransformContext.Interface<OsScanner.Record>,
    OsScanner.Shard
> {
    return createPipeline<
        OsScanner.Record,
        OsTransformContext.Interface<OsScanner.Record>,
        OsScanner.Shard
    >(name, configure);
}
```

All three factories follow the same pattern as the transformer factories: pre-bound DDB/OS variants are thin wrappers over the generic one and exist purely for DX (no context generics to spell out at the call site).

### Sub-pipeline file pattern

Each of the three sub-pipelines becomes a single-file `PipelineDefinition` const using `createDdbPipeline`:

```typescript
// src/presets/v5-to-v6/pipelines/cms-entry.ts
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

The const is a plain `PipelineDefinition` — no class, no per-site `runner.pipeline(...)` boilerplate, no register-function indirection.

Caller pattern (future preset migration):

```typescript
// v5-to-v6-ddb.ts (after Plan B migration)
import { cmsEntryPipeline } from "./pipelines/cms-entry.ts";
import { cmsModelPipeline } from "./pipelines/cms-model.ts";
import { fmFilePipeline } from "./pipelines/fm-file.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";

export const v5ToV6Preset: MigrationPreset = {
    name: "v5-to-v6",
    configure(runner) {
        cmsEntryPipeline.register(runner, DdbScanner, DdbProcessor);
        cmsModelPipeline.register(runner, DdbScanner, DdbProcessor);
        fmFilePipeline.register(runner, DdbScanner, DdbProcessor);
        // ... other pipelines inline or also via `createDdbPipeline`
    }
};
```

Each pipeline file is self-contained: its filter, its transformer chain. Scanner/processor tokens are supplied at register time so the same pipeline definition could, hypothetically, be re-registered against different token pairs (e.g., a mock scanner+processor pair in integration tests).

### Public API surface

Add to `src/index.ts` (the package's public entry point):

```typescript
// Transformer factories
export { createTransformer } from "./transformers/createTransformer.ts";
export { createDdbTransformer } from "./transformers/createDdbTransformer.ts";
export { createOsTransformer } from "./transformers/createOsTransformer.ts";

// Pipeline factories
export { createPipeline, type PipelineDefinition } from "./domain/pipeline/createPipeline.ts";
export { createDdbPipeline } from "./domain/pipeline/createDdbPipeline.ts";
export { createOsPipeline } from "./domain/pipeline/createOsPipeline.ts";

// All built-in transformers (via namespace-less re-exports)
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
    removeFolderRevision
} from "./transformers/cms/index.ts";
export { migrateFileManagerSettings } from "./transformers/file-manager/index.ts";
export { updateFlpIds } from "./transformers/folders/index.ts";
export { migrateMailerSettings } from "./transformers/mailer/index.ts";
export { groupsToRoles, transformPermissions } from "./transformers/security/index.ts";

// v5-to-v6 built-in pipeline definitions
export { cmsEntryPipeline } from "./presets/v5-to-v6/pipelines/cms-entry.ts";
export { cmsModelPipeline } from "./presets/v5-to-v6/pipelines/cms-model.ts";
export { fmFilePipeline } from "./presets/v5-to-v6/pipelines/fm-file.ts";

// Context types for user-written transformers
export type { BaseTransformContext } from "./features/TransformContext/abstractions/BaseTransformContext.ts";
export type { DdbTransformContext } from "./features/TransformContext/abstractions/DdbTransformContext.ts";
export type { OsTransformContext } from "./features/TransformContext/abstractions/OsTransformContext.ts";

// Type shape for custom transformers
export type { Transformer } from "./domain/pipeline/abstractions/Transformer.ts";
```

### User-authored transformer pattern

**Pattern 1: Use a pre-bound factory (recommended for DDB/OS):**

```typescript
import { createDdbTransformer } from "@webiny/data-transfer";

export const addCustomField = createDdbTransformer("addCustomField", (ctx) => {
    // ctx typed as DdbTransformContext.Interface automatically
    ctx.record.customField = "value";
});
```

**Pattern 2: Use the generic factory with a shared context type:**

```typescript
import { createTransformer, type BaseTransformContext } from "@webiny/data-transfer";

export const addTimestamp = createTransformer<BaseTransformContext.Interface>(
    "addTimestamp",
    (ctx) => {
        ctx.record.timestamp = new Date().toISOString();
    }
);
```

**Pattern 3: Define a custom context and use the generic factory:**

```typescript
import {
    createTransformer,
    type BaseTransformContext,
    type Transformer
} from "@webiny/data-transfer";

// User declares their own context type extending the base
interface MyContext extends BaseTransformContext.Interface {
    someExtraService: MyService;
}

// User implements their own processor that produces this context (beyond this plan)
// Then their transformers:
export const usesExtraService = createTransformer<MyContext>("usesExtraService", (ctx) => {
    ctx.someExtraService.doThing(ctx.record);
});
```

Pattern 3 is documented in the public README / a new `docs/user-transformers.md` (plan decides).

---

## Testing

### Per-transformer unit tests

For each of the ~15 transformers, one test file at `__tests__/transformers/<subdir>/<name>.test.ts`. Each test:

- Constructs a fake context (in-memory, no container — the context factory's real output is heavier than needed).
- Calls the transformer with the fake ctx.
- Asserts the record was transformed correctly.

Example:

```typescript
// __tests__/transformers/global/wrapInData.test.ts
import { describe, it, expect } from "vitest";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { wrapInData } from "~/transformers/global/wrapInData.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

function makeFakeCtx(record: Record<string, unknown>): BaseTransformContext.Interface {
    return {
        record,
        original: { ...record },
        commands: new Commands(),
        modelProvider: {} as any,
        cache: {} as any,
        replace(newRecord) { Object.assign(this, { record: newRecord }); },
        putRecord() { /* noop */ },
        queryRecord: async () => null,
        executePipeline: async () => new Commands()
    };
}

describe("wrapInData", () => {
    it("wraps non-reserved attributes into a data envelope", () => {
        const ctx = makeFakeCtx({
            PK: "tenant",
            SK: "record",
            TYPE: "foo",
            name: "Alice",
            age: 42
        });
        wrapInData(ctx);
        expect(ctx.record.PK).toBe("tenant");
        expect(ctx.record.SK).toBe("record");
        expect(ctx.record.TYPE).toBe("foo");
        expect(ctx.record.data).toEqual({ name: "Alice", age: 42 });
        expect(ctx.record.name).toBeUndefined();
        expect(ctx.record.age).toBeUndefined();
    });

    // ... other cases matching the legacy tests that covered this behavior
});
```

The fake context is a utility function — each test file has one (or a shared `__tests__/transformers/fakeContext.ts`). For transformers that need `modelProvider` or `cache`, the fake uses minimal `as any`-typed stubs sufficient for the specific behavior being tested.

### Factory tests

`__tests__/transformers/createTransformer.test.ts`:

- `createTransformer(name, fn)` returns the same function reference (identity).
- The returned function's `transformerName` property equals `name`.
- `createDdbTransformer` / `createOsTransformer` behave identically, just with a pre-bound context type.
- TypeScript-level: a transformer returned from `createDdbTransformer` is assignable to `Transformer.Interface<DdbTransformContext.Interface>` — tested via type-level assertion (`satisfies` or direct assignment in test code).

### Pipeline factory tests

`__tests__/domain/pipeline/createPipeline.test.ts`:

- `createPipeline(name, configure)` returns a `PipelineDefinition` whose `.name` matches.
- Calling `.register(runner, scanner, processor)` registers the pipeline with the runner (verify via resolved runner's state — e.g., registering twice throws the uniqueness error).
- `createDdbPipeline` / `createOsPipeline` behave identically but with the context generics pre-bound.

### Sub-pipeline definition tests

One test file per pipeline at `__tests__/presets/v5-to-v6/pipelines/cms-entry.test.ts` etc. Each test:

- Creates a DDB container.
- Resolves the runner.
- Calls `cmsEntryPipeline.register(runner, DdbScanner, DdbProcessor)`.
- Asserts a pipeline named `"cms-entries"` is now registered — for example, calling `.register(...)` a second time with the same runner throws `/already registered/`.
- Does NOT run the pipeline end-to-end (that's Plan B's integration test).

### Excluded legacy tests stay excluded

The 14 excluded tests in `vitest.config.ts` stay excluded. This plan does not re-enable them. They'll be re-enabled task-by-task during Plan B (preset migration) when the legacy presets get ported and start exercising the new runner.

---

## Implementation order (preview)

The implementation plan will sequence the work roughly as:

1. Create the three transformer factories (`createTransformer`, `createDdbTransformer`, `createOsTransformer`) + barrel + factory tests.
2. Create the three pipeline factories (`createPipeline`, `createDdbPipeline`, `createOsPipeline`) + factory tests. `src/domain/pipeline/index.ts` re-exports them.
3. Port the 4 "global" transformers (`wrapInData`, `addGsiTenant`, `removeLocale`, `removeAttributes`) + unit tests.
4. Port the 5 "cms" transformers + unit tests.
5. Port the "file-manager", "folders", "mailer" transformers + unit tests.
6. Port the 2 "security" transformers + unit tests.
7. Create the 3 sub-pipeline definitions (`cmsEntryPipeline`, `cmsModelPipeline`, `fmFilePipeline`) + basic tests.
8. Wire public API — update `src/index.ts` with factory exports + transformer re-exports + pipeline-definition re-exports + context type exports.
9. Delete the legacy `src/domain/transform/Transformer.ts` file (after verifying no consumers outside presets/handlers remain).
10. Final verification: format, ts-check baseline unchanged-or-better, test suite green.

Each step commits separately per the project convention.

---

## What this enables

- **Plan B (preset migration)** becomes a drop-in rewrite: swap the old builder for `runner.pipeline(...)`, swap object-literal transformers for the already-ported function transformers, replace sub-pipeline-class calls with register-function calls. Most of Plan B's work is eliminated by this plan.
- **User-written transformers** gain documented patterns + shipped factories. Custom presets can reuse the framework's built-in transformers or mix in their own without writing wrapper classes or DI ceremony.
- **Legacy `src/domain/transform/Transformer.ts`** becomes removable — one step closer to fully retiring the legacy domain.
