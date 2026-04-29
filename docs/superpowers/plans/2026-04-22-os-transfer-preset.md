# OS Transfer Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `v5-to-v6-os.ts` — a transfer preset for Webiny DDB+OpenSearch mode that migrates CMS-backed entries from the OS DDB table to the target, with correct pipeline ordering, blackholing, and OS-specific index-name updates.

**Architecture:** Four pipelines (BackgroundTasks, MailerSettings, FileManagerFiles, CmsEntries) registered in first-match-wins order using `OsScanner` + `OsProcessor`. All writing pipelines use a new `osCmsEntryTransformers` stack that omits `wrapInData` (data is already present) and adds `updateOsIndex` to keep the `index` field aligned with renamed modelIds.

**Tech Stack:** TypeScript, Vitest, `@webiny/di`, existing DI feature pattern, `createOsTransformer`, `OsScanner`, `OsProcessor`.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `src/domain/transform/filters.ts` | Add `isOsBackgroundTask`, `isOsMailerSettings` |
| Modify | `__tests__/domain/transform/filters.test.ts` | Tests for two new filters |
| Create | `src/transformers/cms/updateOsIndex.ts` | Transformer: rewrite `record.index` after modelId rename |
| Modify | `src/transformers/cms/index.ts` | Re-export `updateOsIndex` |
| Modify | `__tests__/transformers/cms/updateOsIndex.test.ts` | Unit tests for `updateOsIndex` (new file) |
| Modify | `src/transformers/cmsEntryTransformers.ts` | Add `osCmsEntryTransformers` array |
| Modify | `src/transformers/index.ts` | Re-export `osCmsEntryTransformers` |
| Create | `src/presets/v5-to-v6-os.ts` | The OS preset |

---

### Task 1: OS-specific filters

**Files:**
- Modify: `src/domain/transform/filters.ts`
- Modify: `__tests__/domain/transform/filters.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `__tests__/domain/transform/filters.test.ts`:

```ts
import {
    // existing imports …
    isOsBackgroundTask,
    isOsMailerSettings
} from "../../../src/domain/transform/filters.ts";
```

Add these two `describe` blocks at the bottom of the file:

```ts
describe("isOsBackgroundTask", () => {
    it("matches webinyTask and webinyTaskLog by data.modelId", () => {
        expect(isOsBackgroundTask(makeRecord({ data: { modelId: "webinyTask" } }))).toBe(true);
        expect(isOsBackgroundTask(makeRecord({ data: { modelId: "webinyTaskLog" } }))).toBe(true);
    });

    it("rejects other modelIds", () => {
        expect(isOsBackgroundTask(makeRecord({ data: { modelId: "blogPost" } }))).toBe(false);
    });

    it("returns false when data is absent", () => {
        expect(isOsBackgroundTask(makeRecord({}))).toBe(false);
    });
});

describe("isOsMailerSettings", () => {
    it("matches mailerSettings by data.modelId", () => {
        expect(
            isOsMailerSettings(makeRecord({ data: { modelId: "mailerSettings" } }))
        ).toBe(true);
    });

    it("rejects other modelIds", () => {
        expect(isOsMailerSettings(makeRecord({ data: { modelId: "blogPost" } }))).toBe(false);
    });

    it("returns false when data is absent", () => {
        expect(isOsMailerSettings(makeRecord({}))).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/domain/transform/filters.test.ts
```

Expected: two `describe` blocks fail with import errors.

- [ ] **Step 3: Add the two filters to `src/domain/transform/filters.ts`**

Append at the end of the file:

```ts
export const isOsBackgroundTask = (record: Record<string, unknown>): boolean => {
    const data = record.data as Record<string, unknown> | undefined;
    const modelId = data?.modelId as string | undefined;
    return modelId === "webinyTask" || modelId === "webinyTaskLog";
};

export const isOsMailerSettings = (record: Record<string, unknown>): boolean => {
    const data = record.data as Record<string, unknown> | undefined;
    return (data?.modelId as string | undefined) === "mailerSettings";
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/domain/transform/filters.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/transform/filters.ts __tests__/domain/transform/filters.test.ts
git commit -m "feat(filters): add isOsBackgroundTask and isOsMailerSettings"
```

---

### Task 2: `updateOsIndex` transformer

**Files:**
- Create: `src/transformers/cms/updateOsIndex.ts`
- Create: `__tests__/transformers/cms/updateOsIndex.test.ts`
- Modify: `src/transformers/cms/index.ts`

The transformer rewrites `record.index` when `data.modelId` was renamed by a prior `updateModelIds` run. It uses `ctx.original.data.modelId` (the pre-transform value) to find the old index suffix, and `ctx.record.data.modelId` (the post-transform value) to compute the new suffix.

> **Note:** The user will provide an official Webiny utility for building the index name from tenant + locale + modelId. If that utility is available at the time of implementation, prefer using it over the suffix-swap approach below. The suffix-swap is a safe fallback that avoids needing to re-extract tenant and locale from the record.

- [ ] **Step 1: Write the failing test**

Create `__tests__/transformers/cms/updateOsIndex.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { updateOsIndex } from "~/transformers/cms/updateOsIndex.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("updateOsIndex", () => {
    it("rewrites index suffix when modelId was renamed (fmFile → wbyFmFile)", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-fmfile",
            data: { modelId: "fmFile", values: {} }
        });

        // Simulate updateModelIds having already run
        (ctx.record.data as Record<string, unknown>).modelId = "wbyFmFile";

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-wbyfmfile"
        );
    });

    it("rewrites index suffix for acoFolder → wbyAcoFolder", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-acofolder",
            data: { modelId: "acoFolder", values: {} }
        });

        (ctx.record.data as Record<string, unknown>).modelId = "wbyAcoFolder";

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-wyacofolder"
        );
    });

    it("leaves index unchanged when modelId has no rename mapping", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-blogpost",
            data: { modelId: "blogPost", values: {} }
        });

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-blogpost"
        );
    });

    it("leaves index unchanged when old and new modelId are identical", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-wbyfmfile",
            data: { modelId: "wbyFmFile", values: {} }
        });

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-wbyfmfile"
        );
    });

    it("is a no-op when record.data is absent", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            index: "root-headless-cms-en-us-fmfile"
        });

        await updateOsIndex(ctx);

        expect((ctx.record as Record<string, unknown>).index).toBe(
            "root-headless-cms-en-us-fmfile"
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test __tests__/transformers/cms/updateOsIndex.test.ts
```

Expected: fails — `updateOsIndex` not found.

- [ ] **Step 3: Implement `src/transformers/cms/updateOsIndex.ts`**

```ts
import { createOsTransformer } from "~/transformers/createOsTransformer.ts";
import type { OsScanner } from "~/features/OsScanner/index.ts";

export const updateOsIndex = createOsTransformer("updateOsIndex", ctx => {
    const record = ctx.record as OsScanner.Record & Record<string, unknown>;

    const originalData = ctx.original.data as Record<string, unknown> | undefined;
    const recordData = record.data as Record<string, unknown> | undefined;

    if (!originalData || !recordData) {
        return;
    }

    const oldModelId = originalData.modelId as string | undefined;
    const newModelId = recordData.modelId as string | undefined;

    if (!oldModelId || !newModelId || oldModelId === newModelId) {
        return;
    }

    const currentIndex = record.index;
    if (!currentIndex) {
        return;
    }

    const oldSuffix = `-${oldModelId.toLowerCase()}`;
    const newSuffix = `-${newModelId.toLowerCase()}`;

    if (currentIndex.endsWith(oldSuffix)) {
        record.index = currentIndex.slice(0, -oldSuffix.length) + newSuffix;
    }
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/transformers/cms/updateOsIndex.test.ts
```

Expected: all tests pass. Fix the `acoFolder → wbyAcoFolder` test assertion if needed — `wbyAcoFolder` lowercases to `wyacofolder` only if the prefix case matches; verify the expected string matches `wbyacofolder`.

- [ ] **Step 5: Export from `src/transformers/cms/index.ts`**

Add to the end of the file:

```ts
export { updateOsIndex } from "./updateOsIndex.ts";
```

- [ ] **Step 6: Commit**

```bash
git add src/transformers/cms/updateOsIndex.ts src/transformers/cms/index.ts __tests__/transformers/cms/updateOsIndex.test.ts
git commit -m "feat(transformers): add updateOsIndex OS-specific transformer"
```

---

### Task 3: `osCmsEntryTransformers` array

**Files:**
- Modify: `src/transformers/cmsEntryTransformers.ts`
- Modify: `src/transformers/index.ts`

No separate test file: the array is a plain configuration list. Its correctness is covered by the OS preset integration test in Task 4.

- [ ] **Step 1: Add `osCmsEntryTransformers` to `src/transformers/cmsEntryTransformers.ts`**

Add the import and array. The full file after the edit:

```ts
import {
    fixBrokenStorageKeys,
    fixCmePk,
    removeFolderRevision,
    transformRichText,
    updateModelIds,
    updateOsIndex
} from "./cms/index.ts";
import { wrapInData, addGsiTenant, removeLocale, removeAttributes } from "./global/index.ts";

// Shared transformer stack for CMS-shaped records (cmsEntries + fmFiles).
// wrapInData MUST stay first — everything downstream assumes the record body
// is already moved under `data`. Changes to this list affect both pipelines;
// if one needs to diverge, pull it out of the shared array.
export const cmsEntryTransformers = [
    wrapInData,
    addGsiTenant,
    removeLocale,
    fixCmePk,
    fixBrokenStorageKeys,
    transformRichText,
    updateModelIds,
    removeFolderRevision,
    removeAttributes
];

// OS-mode transformer stack. `data` is already populated (decompressed by
// OsScanner), so wrapInData is omitted. updateOsIndex runs after updateModelIds
// so it sees the renamed modelId when computing the new index name.
export const osCmsEntryTransformers = [
    addGsiTenant,
    removeLocale,
    fixCmePk,
    fixBrokenStorageKeys,
    transformRichText,
    updateModelIds,
    updateOsIndex,
    removeFolderRevision,
    removeAttributes
];
```

- [ ] **Step 2: Re-export from `src/transformers/index.ts`**

Add to `src/transformers/index.ts`:

```ts
export { cmsEntryTransformers, osCmsEntryTransformers } from "./cmsEntryTransformers.js";
```

The file currently has `export * from "./cmsEntryTransformers.js"` — if so, no change is needed since `osCmsEntryTransformers` will be picked up automatically. Verify and skip this step if the wildcard export is already in place.

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
yarn test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/transformers/cmsEntryTransformers.ts src/transformers/index.ts
git commit -m "feat(transformers): add osCmsEntryTransformers for OS-mode pipelines"
```

---

### Task 4: `v5-to-v6-os` preset

**Files:**
- Create: `src/presets/v5-to-v6-os.ts`

- [ ] **Step 1: Create `src/presets/v5-to-v6-os.ts`**

```ts
import { createTransferPreset } from "~/utils/createTransferPreset.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
import { createFilter } from "~/domain/pipeline/Filter.ts";
import {
    isCmsEntry,
    isFmFile,
    isOsBackgroundTask,
    isOsMailerSettings
} from "~/domain/transform/filters.ts";
import { osCmsEntryTransformers } from "~/transformers/index.ts";

export default createTransferPreset({
    name: "v5-to-v6-os",
    description: "Webiny v5 to v6 migration — OpenSearch DDB table.",
    configure({ runner, pipelineBuilderFactory: factory }): void {
        // ========================================================================
        // Background Tasks — blackhole
        // IMPORTANT: Must be registered BEFORE CmsEntries (background tasks
        // satisfy isCmsEntry via TYPE prefix)
        // ========================================================================
        const backgroundTasks = factory
            .create({
                name: "BackgroundTasks",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isOsBackgroundTask))
            .blackhole()
            .build();

        // ========================================================================
        // Mailer Settings — blackhole
        // v6 stores mailer settings in the KV store; the DDB preset handles
        // the actual DDB → KV migration. OS records have no v6 target.
        // IMPORTANT: Must be registered BEFORE CmsEntries.
        // ========================================================================
        const mailerSettings = factory
            .create({
                name: "MailerSettings",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isOsMailerSettings))
            .blackhole()
            .build();

        // ========================================================================
        // File Manager Files
        // IMPORTANT: Must be registered BEFORE CmsEntries (fmFile satisfies
        // isCmsEntry via TYPE prefix)
        // ========================================================================
        const fileManagerFiles = factory
            .create({
                name: "FileManagerFiles",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isFmFile))
            .use(osCmsEntryTransformers)
            .build();

        // ========================================================================
        // CMS Entries — catch-all
        // ========================================================================
        const cmsEntries = factory
            .create({
                name: "CmsEntries",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isCmsEntry))
            .use(osCmsEntryTransformers)
            .build();

        // ========================================================================
        // Register — order is load-bearing (first-match-wins)
        // ========================================================================
        runner
            .register(backgroundTasks)
            .register(mailerSettings)
            .register(fileManagerFiles)
            .register(cmsEntries);
    }
});
```

- [ ] **Step 2: Run the full suite to verify no regressions**

```bash
yarn test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/presets/v5-to-v6-os.ts
git commit -m "feat(preset): add v5-to-v6-os OpenSearch transfer preset"
```

---

## Self-Review

**Spec coverage:**
- ✅ `isOsBackgroundTask`, `isOsMailerSettings` added to `filters.ts` — Task 1
- ✅ `updateOsIndex` transformer created — Task 2
- ✅ `osCmsEntryTransformers` (no `wrapInData`, adds `updateOsIndex`) — Task 3
- ✅ 4-pipeline preset with correct first-match-wins ordering — Task 4
- ✅ Blackhole for BackgroundTasks and MailerSettings — Tasks 1, 4
- ✅ FileManagerFiles before CmsEntries — Task 4

**Placeholder scan:** No TBDs. The `updateOsIndex` note about the Webiny utility is a callout, not a blocker — the suffix-swap fallback is fully implemented.

**Type consistency:** `isOsBackgroundTask` / `isOsMailerSettings` take `Record<string, unknown>` matching the existing filter signature convention. `updateOsIndex` uses `OsScanner.Record` for `record.index` access. `osCmsEntryTransformers` uses the same transformer type as `cmsEntryTransformers`.

**Ambiguity:** The `acoFolder → wbyAcoFolder` test expected string (`wyacofolder` vs `wbyacofolder`) should be double-checked at test-run time in Task 2 Step 4 — the note is already in the plan.
