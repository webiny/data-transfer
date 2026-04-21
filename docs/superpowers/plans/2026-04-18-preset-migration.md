# Preset Migration (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `v5-to-v6-ddb.ts` + `v5-to-v6-os.ts` using the new pipeline factories, delete legacy `src/domain/transform/{Pipeline,PipelineBuilder,Transformer}.ts` + their tests, and port all 16 vitest-excluded tests + `nested-pipeline.test.ts` to the new `PipelineRunner` API.

**Architecture:** Each preset becomes a thin registrar that calls `<pipelineDefinition>.register(runner, Scanner, Processor)` for 8 DDB pipelines (DDB preset) or 1 OS pipeline (OS preset). Every pipeline lives in one camelCase file under `src/presets/v5-to-v6/pipelines/`. After the rewrite, the legacy `src/domain/transform/` files lose their last consumers and can be deleted. Then 16 excluded integration tests are ported to the new API in batches.

**Tech Stack:** TypeScript strict, `@webiny/di`, vitest, oxfmt. Uses `createDdbPipeline` / `createOsPipeline` from Plan A + `PipelineRunner.register` + `runner.run()`.

---

## Reference: Common Patterns

**New pipeline definition file template** (`src/presets/v5-to-v6/pipelines/<name>.ts`):

```typescript
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { <filter> } from "~/domain/transform/filters.ts";
import { <transformers> } from "~/transformers/<subdir>/index.ts";

export const <pipelineName>Pipeline = createDdbPipeline("<pipeline-name>", (builder) => {
    builder
        .filter(createFilter(<filterExpr>))
        .use(<transformer1>)
        .use(<transformer2>);
});
```

**Pipeline-definition test template** (`__tests__/presets/v5-to-v6/pipelines/<name>.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { <pipelineName>Pipeline } from "~/presets/v5-to-v6/pipelines/<name>.ts";

describe("<pipelineName>Pipeline", () => {
    it("has the expected name", () => {
        expect(<pipelineName>Pipeline.name).toBe("<pipeline-name>");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        <pipelineName>Pipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => <pipelineName>Pipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});
```

For OS pipelines, swap `createDdbContainer` → `createOsContainer`, `DdbScanner` → `OsScanner`, `DdbProcessor` → `OsProcessor`, `createDdbPipeline` → `createOsPipeline`, `createFilter` stays, but the filter lambda's record parameter is `OsScanner.Record` (which structurally is `BaseRecord` too for our filters).

---

### Task 1: Rename existing 3 pipeline files to camelCase

**Files:**
- Rename: `src/presets/v5-to-v6/pipelines/cms-entry.ts` → `src/presets/v5-to-v6/pipelines/cmsEntry.ts`
- Rename: `src/presets/v5-to-v6/pipelines/cms-model.ts` → `src/presets/v5-to-v6/pipelines/cmsModel.ts`
- Rename: `src/presets/v5-to-v6/pipelines/fm-file.ts` → `src/presets/v5-to-v6/pipelines/fmFile.ts`
- Rename: `__tests__/presets/v5-to-v6/pipelines/cms-entry.test.ts` → `__tests__/presets/v5-to-v6/pipelines/cmsEntry.test.ts`
- Rename: `__tests__/presets/v5-to-v6/pipelines/cms-model.test.ts` → `__tests__/presets/v5-to-v6/pipelines/cmsModel.test.ts`
- Rename: `__tests__/presets/v5-to-v6/pipelines/fm-file.test.ts` → `__tests__/presets/v5-to-v6/pipelines/fmFile.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: git-mv source + test files**

```bash
git mv src/presets/v5-to-v6/pipelines/cms-entry.ts src/presets/v5-to-v6/pipelines/cmsEntry.ts
git mv src/presets/v5-to-v6/pipelines/cms-model.ts src/presets/v5-to-v6/pipelines/cmsModel.ts
git mv src/presets/v5-to-v6/pipelines/fm-file.ts   src/presets/v5-to-v6/pipelines/fmFile.ts
git mv __tests__/presets/v5-to-v6/pipelines/cms-entry.test.ts __tests__/presets/v5-to-v6/pipelines/cmsEntry.test.ts
git mv __tests__/presets/v5-to-v6/pipelines/cms-model.test.ts __tests__/presets/v5-to-v6/pipelines/cmsModel.test.ts
git mv __tests__/presets/v5-to-v6/pipelines/fm-file.test.ts   __tests__/presets/v5-to-v6/pipelines/fmFile.test.ts
```

- [ ] **Step 2: Update import paths in test files**

Each of the 3 test files imports its pipeline from the old kebab-case path. Update the import at the top of each test file to the new camelCase path.

In `__tests__/presets/v5-to-v6/pipelines/cmsEntry.test.ts`:
```typescript
import { cmsEntryPipeline } from "~/presets/v5-to-v6/pipelines/cmsEntry.ts";
```

In `__tests__/presets/v5-to-v6/pipelines/cmsModel.test.ts`:
```typescript
import { cmsModelPipeline } from "~/presets/v5-to-v6/pipelines/cmsModel.ts";
```

In `__tests__/presets/v5-to-v6/pipelines/fmFile.test.ts`:
```typescript
import { fmFilePipeline } from "~/presets/v5-to-v6/pipelines/fmFile.ts";
```

- [ ] **Step 3: Update `src/index.ts` re-exports**

Modify lines 54-56 of `src/index.ts` to use camelCase paths:

```typescript
export { cmsEntryPipeline } from "./presets/v5-to-v6/pipelines/cmsEntry.ts";
export { cmsModelPipeline } from "./presets/v5-to-v6/pipelines/cmsModel.ts";
export { fmFilePipeline } from "./presets/v5-to-v6/pipelines/fmFile.ts";
```

- [ ] **Step 4: Run tests + ts-check**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/
yarn ts-check 2>&1 | grep "error TS" | wc -l
```

Expected: 6 tests passing; ts-check count unchanged (82, matching prior baseline).

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
# Revert any unrelated reformatting in src/presets/example.ts
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6/pipelines/ __tests__/presets/v5-to-v6/pipelines/ src/index.ts
git commit -m "refactor: rename pipeline files to camelCase"
```

---

### Task 2: Auto-put transformed record in `PipelineRunner.runShard`

**Why this exists:** The legacy `TransformPipeline.run()` ended with `ctx.putRecord(ctx.record)` — an implicit PutRecord emission of the transformed record. The new `PipelineRunner.runShard` doesn't do this, and none of the 19 built-in transformers emit writes on their own (they only mutate `ctx.record`). Without this fix, Task 9's round-trip test and all ported integration tests (Tasks 12-16) will show zero writes. Matches legacy behavior one-for-one.

**Files:**
- Modify: `src/features/PipelineRunner/PipelineRunner.ts:runShard` (~line 146)
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` (drop manual `ctx.commands.add(PutRecord.create(...))` from `passthroughTransformer` since auto-put handles it)

- [ ] **Step 1: Write a failing test**

Add a new `it(...)` block to `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`:

```typescript
it("auto-puts the transformed record after the transformer chain (no manual ctx.putRecord needed)", async () => {
    const sourceRecords = [
        makeRecord("tenant-1", "team-1", "security.team")
    ];
    const container = createDdbContainer({
        sourceRecords: { "source-table": sourceRecords }
    });
    const runner = container.resolve(PipelineRunner);

    const builder = runner.pipeline<
        BaseRecord,
        DdbTransformContext.Interface<BaseRecord>,
        DdbScanner.Shard
    >({
        name: "mutation-only",
        scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
        processor: Processor as Abstraction<
            Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
        >
    });
    // Transformer that only MUTATES ctx.record — no explicit PutRecord.
    const tagTransformer = (ctx: DdbTransformContext.Interface<BaseRecord>): void => {
        (ctx.record as BaseRecord & { tagged?: boolean }).tagged = true;
    };
    builder.filter(createFilter<BaseRecord>(r => r.TYPE === "security.team")).use(tagTransformer);
    runner.register(builder.build() as unknown as AnyPipeline);

    await runner.run();

    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    expect(targetDb.batchPutRecords).toHaveLength(1);
    expect((targetDb.batchPutRecords[0] as BaseRecord & { tagged?: boolean }).tagged).toBe(true);
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/features/PipelineRunner/PipelineRunner.integration.test.ts
```

Expected: the new test FAILS — `targetDb.batchPutRecords` is empty because the tag transformer only mutates.

- [ ] **Step 3: Add auto-put to `runShard`**

In `src/features/PipelineRunner/PipelineRunner.ts`, locate the `runShard` method. Inside the `for await (const record of scanner.scan(shard))` loop, after the `for (const transformer of pipeline.transformerFns)` loop but BEFORE the `for (const cmd of ctx.commands.all())` copy loop, add:

```typescript
// Auto-put: emit a PutRecord for the final ctx.record. Matches the legacy
// TransformPipeline contract where the pipeline ended with an implicit
// ctx.putRecord(ctx.record). Transformers that want to emit ADDITIONAL
// commands (e.g., createMetadata's secondary PutRecord) still can.
ctx.putRecord(ctx.record as Record<string, unknown>);
```

- [ ] **Step 4: Update the existing `passthroughTransformer`**

In the same integration test file, remove the manual `ctx.commands.add(PutRecord.create(...))` call from `passthroughTransformer` — auto-put now handles it. The `passthroughTransformer` becomes a no-op mutator. This avoids double-writing the same record (once auto, once manually).

Specifically change:
```typescript
const passthroughTransformer = (ctx: DdbTransformContext.Interface<BaseRecord>): void => {
    ctx.commands.add(PutRecord.create({ table: "target-table", record: { ...ctx.record } }));
};
```
to:
```typescript
const passthroughTransformer = (_ctx: DdbTransformContext.Interface<BaseRecord>): void => {
    // no-op: the runner auto-emits a PutRecord for the final ctx.record
};
```

- [ ] **Step 5: Verify all tests in the file pass**

```bash
yarn test __tests__/features/PipelineRunner/PipelineRunner.integration.test.ts
```

Expected: the new auto-put test passes; the two existing tests still pass (no double-writes).

- [ ] **Step 6: Run full suite**

```bash
yarn test
```

Expected: no regressions. Test count grows by 1 (the new auto-put test).

- [ ] **Step 7: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/features/PipelineRunner/PipelineRunner.ts __tests__/features/PipelineRunner/PipelineRunner.integration.test.ts
git commit -m "fix(runner): auto-put transformed record after transformer chain"
```

---

### Task 3: Add `fmSettingsPipeline`

**Files:**
- Create: `src/presets/v5-to-v6/pipelines/fmSettings.ts`
- Create: `__tests__/presets/v5-to-v6/pipelines/fmSettings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/presets/v5-to-v6/pipelines/fmSettings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { fmSettingsPipeline } from "~/presets/v5-to-v6/pipelines/fmSettings.ts";

describe("fmSettingsPipeline", () => {
    it("has the expected name", () => {
        expect(fmSettingsPipeline.name).toBe("fm-settings");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        fmSettingsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => fmSettingsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/fmSettings.test.ts
```

Expected: FAIL — "Cannot find module '~/presets/v5-to-v6/pipelines/fmSettings.ts'".

- [ ] **Step 3: Write the pipeline definition**

Create `src/presets/v5-to-v6/pipelines/fmSettings.ts`:

```typescript
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { byType } from "~/domain/transform/filters.ts";
import { wrapInData, removeAttributes } from "~/transformers/global/index.ts";
import { migrateFileManagerSettings } from "~/transformers/file-manager/index.ts";

export const fmSettingsPipeline = createDdbPipeline("fm-settings", (builder) => {
    builder
        .filter(createFilter(byType("fm.settings")))
        .use(wrapInData)
        .use(migrateFileManagerSettings)
        .use(removeAttributes);
});
```

- [ ] **Step 4: Verify test passes**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/fmSettings.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6/pipelines/fmSettings.ts __tests__/presets/v5-to-v6/pipelines/fmSettings.test.ts
git commit -m "feat: fmSettingsPipeline definition"
```

---

### Task 4: Add `mailerSettingsPipeline`

**Files:**
- Create: `src/presets/v5-to-v6/pipelines/mailerSettings.ts`
- Create: `__tests__/presets/v5-to-v6/pipelines/mailerSettings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/presets/v5-to-v6/pipelines/mailerSettings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { mailerSettingsPipeline } from "~/presets/v5-to-v6/pipelines/mailerSettings.ts";

describe("mailerSettingsPipeline", () => {
    it("has the expected name", () => {
        expect(mailerSettingsPipeline.name).toBe("mailer-settings");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        mailerSettingsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => mailerSettingsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/mailerSettings.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write the pipeline definition**

Create `src/presets/v5-to-v6/pipelines/mailerSettings.ts`:

```typescript
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { wrapInData, removeAttributes } from "~/transformers/global/index.ts";
import { migrateMailerSettings } from "~/transformers/mailer/index.ts";

const isMailerSettings = (record: BaseRecord): boolean => {
    return record.SK === "L" && (record as BaseRecord & { modelId?: string }).modelId === "mailerSettings";
};

export const mailerSettingsPipeline = createDdbPipeline("mailer-settings", (builder) => {
    builder
        .filter(createFilter<BaseRecord>(isMailerSettings))
        .use(wrapInData)
        .use(migrateMailerSettings)
        .use(removeAttributes);
});
```

- [ ] **Step 4: Verify test passes**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/mailerSettings.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6/pipelines/mailerSettings.ts __tests__/presets/v5-to-v6/pipelines/mailerSettings.test.ts
git commit -m "feat: mailerSettingsPipeline definition"
```

---

### Task 5: Add `securityGroupsPipeline`

**Files:**
- Create: `src/presets/v5-to-v6/pipelines/securityGroups.ts`
- Create: `__tests__/presets/v5-to-v6/pipelines/securityGroups.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/presets/v5-to-v6/pipelines/securityGroups.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { securityGroupsPipeline } from "~/presets/v5-to-v6/pipelines/securityGroups.ts";

describe("securityGroupsPipeline", () => {
    it("has the expected name", () => {
        expect(securityGroupsPipeline.name).toBe("security-groups");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        securityGroupsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => securityGroupsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/securityGroups.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write the pipeline definition**

Create `src/presets/v5-to-v6/pipelines/securityGroups.ts`:

```typescript
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isBuiltInSecurityRole } from "~/domain/transform/filters.ts";
import { wrapInData, addGsiTenant, removeAttributes } from "~/transformers/global/index.ts";
import { groupsToRoles, transformPermissions } from "~/transformers/security/index.ts";

const isMigratableSecurityGroup = (record: BaseRecord): boolean => {
    return record.TYPE === "security.group" && !isBuiltInSecurityRole(record);
};

export const securityGroupsPipeline = createDdbPipeline("security-groups", (builder) => {
    builder
        .filter(createFilter<BaseRecord>(isMigratableSecurityGroup))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(groupsToRoles)
        .use(transformPermissions)
        .use(removeAttributes);
});
```

- [ ] **Step 4: Verify test passes**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/securityGroups.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6/pipelines/securityGroups.ts __tests__/presets/v5-to-v6/pipelines/securityGroups.test.ts
git commit -m "feat: securityGroupsPipeline definition"
```

---

### Task 6: Add `securityTeamsPipeline`

**Files:**
- Create: `src/presets/v5-to-v6/pipelines/securityTeams.ts`
- Create: `__tests__/presets/v5-to-v6/pipelines/securityTeams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/presets/v5-to-v6/pipelines/securityTeams.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { securityTeamsPipeline } from "~/presets/v5-to-v6/pipelines/securityTeams.ts";

describe("securityTeamsPipeline", () => {
    it("has the expected name", () => {
        expect(securityTeamsPipeline.name).toBe("security-teams");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        securityTeamsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => securityTeamsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/securityTeams.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write the pipeline definition**

Create `src/presets/v5-to-v6/pipelines/securityTeams.ts`:

```typescript
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isSecurityTeam } from "~/domain/transform/filters.ts";
import { wrapInData, addGsiTenant, removeAttributes } from "~/transformers/global/index.ts";

export const securityTeamsPipeline = createDdbPipeline("security-teams", (builder) => {
    builder
        .filter(createFilter(isSecurityTeam))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeAttributes);
});
```

- [ ] **Step 4: Verify test passes**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/securityTeams.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6/pipelines/securityTeams.ts __tests__/presets/v5-to-v6/pipelines/securityTeams.test.ts
git commit -m "feat: securityTeamsPipeline definition"
```

---

### Task 7: Add `folderPermissionsPipeline`

**Files:**
- Create: `src/presets/v5-to-v6/pipelines/folderPermissions.ts`
- Create: `__tests__/presets/v5-to-v6/pipelines/folderPermissions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/presets/v5-to-v6/pipelines/folderPermissions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { folderPermissionsPipeline } from "~/presets/v5-to-v6/pipelines/folderPermissions.ts";

describe("folderPermissionsPipeline", () => {
    it("has the expected name", () => {
        expect(folderPermissionsPipeline.name).toBe("folder-permissions");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        folderPermissionsPipeline.register(runner, DdbScanner, DdbProcessor);
        expect(() => folderPermissionsPipeline.register(runner, DdbScanner, DdbProcessor)).toThrow(
            /already registered/i
        );
    });
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/folderPermissions.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write the pipeline definition**

Create `src/presets/v5-to-v6/pipelines/folderPermissions.ts`:

```typescript
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isFlpRecord } from "~/domain/transform/filters.ts";
import {
    wrapInData,
    addGsiTenant,
    removeLocale,
    removeAttributes
} from "~/transformers/global/index.ts";
import { updateFlpIds } from "~/transformers/folders/index.ts";

export const folderPermissionsPipeline = createDdbPipeline("folder-permissions", (builder) => {
    builder
        .filter(createFilter(isFlpRecord))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeLocale)
        .use(removeAttributes)
        .use(updateFlpIds);
});
```

- [ ] **Step 4: Verify test passes**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/folderPermissions.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6/pipelines/folderPermissions.ts __tests__/presets/v5-to-v6/pipelines/folderPermissions.test.ts
git commit -m "feat: folderPermissionsPipeline definition"
```

---

### Task 8: Add `cmsEntryOsPipeline` (OS variant)

**Files:**
- Create: `src/presets/v5-to-v6/pipelines/cmsEntryOs.ts`
- Create: `__tests__/presets/v5-to-v6/pipelines/cmsEntryOs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/presets/v5-to-v6/pipelines/cmsEntryOs.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createOsContainer } from "../../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
import { cmsEntryOsPipeline } from "~/presets/v5-to-v6/pipelines/cmsEntryOs.ts";

describe("cmsEntryOsPipeline", () => {
    it("has the expected name", () => {
        expect(cmsEntryOsPipeline.name).toBe("cms-entries-os");
    });

    it("registers with the runner (proven by duplicate-registration throw)", () => {
        const container = createOsContainer();
        const runner = container.resolve(PipelineRunner);
        cmsEntryOsPipeline.register(runner, OsScanner, OsProcessor);
        expect(() => cmsEntryOsPipeline.register(runner, OsScanner, OsProcessor)).toThrow(
            /already registered/i
        );
    });
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/cmsEntryOs.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write the pipeline definition**

Create `src/presets/v5-to-v6/pipelines/cmsEntryOs.ts`:

```typescript
import { createOsPipeline, createFilter } from "~/domain/pipeline/index.ts";
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

export const cmsEntryOsPipeline = createOsPipeline("cms-entries-os", (builder) => {
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

- [ ] **Step 4: Verify test passes**

```bash
yarn test __tests__/presets/v5-to-v6/pipelines/cmsEntryOs.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6/pipelines/cmsEntryOs.ts __tests__/presets/v5-to-v6/pipelines/cmsEntryOs.test.ts
git commit -m "feat: cmsEntryOsPipeline definition"
```

---

### Task 9: Rewrite `v5-to-v6-ddb.ts` preset

**Files:**
- Modify: `src/presets/v5-to-v6-ddb.ts` (full rewrite)
- Create: `__tests__/presets/v5-to-v6-ddb.test.ts`

- [ ] **Step 1: Write the failing round-trip test**

Create `__tests__/presets/v5-to-v6-ddb.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "../services/DynamoDbClient/MockDynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";

interface Fixture {
    record: BaseRecord;
    expectsWrite: boolean;
}

const fixtures: Fixture[] = [
    {
        record: {
            PK: "T#root#FM#S",
            SK: "L",
            TYPE: "fm.settings",
            _et: "FmSettings",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#L#en-US#CMS#CME#file-1",
            SK: "REV#0001",
            TYPE: "cms.entry",
            modelId: "fmFile",
            _et: "CmsEntries",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#MAILER#S",
            SK: "L",
            TYPE: "mailer.settings",
            modelId: "mailerSettings",
            _et: "MailerSettings",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#GROUP#my-group",
            SK: "A",
            TYPE: "security.group",
            slug: "my-group",
            _et: "SecurityGroup",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z",
            data: { permissions: [] }
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#TEAM#my-team",
            SK: "A",
            TYPE: "security.team",
            _et: "SecurityTeam",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#CMS#MODEL#myModel",
            SK: "A",
            TYPE: "cms.model",
            _et: "CmsModel",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#FLP#abc",
            SK: "A",
            TYPE: "flp",
            _et: "Flp",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z",
            data: { id: "abc#0001", parentId: "" }
        } as BaseRecord,
        expectsWrite: true
    },
    {
        record: {
            PK: "T#root#L#en-US#CMS#CME#entry-1",
            SK: "REV#0001",
            TYPE: "cms.entry",
            modelId: "someModel",
            _et: "CmsEntries",
            _ct: "2024-01-01T00:00:00.000Z",
            _md: "2024-01-01T00:00:00.000Z"
        } as BaseRecord,
        expectsWrite: true
    }
];

describe("v5ToV6Preset (DDB) — round-trip", () => {
    it("registers all 8 pipelines and writes one record per branch", async () => {
        const container = createDdbContainer({
            sourceRecords: { "source-table": fixtures.map(f => f.record) }
        });
        const runner = container.resolve(PipelineRunner);

        v5ToV6Preset.configure(runner);

        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const expectedWrites = fixtures.filter(f => f.expectsWrite).length;
        expect(targetDb.batchPutRecords.length).toBe(expectedWrites);
    });
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/presets/v5-to-v6-ddb.test.ts
```

Expected: FAIL — either a compile error (because the rewritten preset doesn't exist yet) or a runtime error from the current legacy preset.

- [ ] **Step 3: Rewrite the preset**

Replace the contents of `src/presets/v5-to-v6-ddb.ts` with:

```typescript
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { fmSettingsPipeline } from "./v5-to-v6/pipelines/fmSettings.ts";
import { fmFilePipeline } from "./v5-to-v6/pipelines/fmFile.ts";
import { mailerSettingsPipeline } from "./v5-to-v6/pipelines/mailerSettings.ts";
import { securityGroupsPipeline } from "./v5-to-v6/pipelines/securityGroups.ts";
import { securityTeamsPipeline } from "./v5-to-v6/pipelines/securityTeams.ts";
import { cmsModelPipeline } from "./v5-to-v6/pipelines/cmsModel.ts";
import { folderPermissionsPipeline } from "./v5-to-v6/pipelines/folderPermissions.ts";
import { cmsEntryPipeline } from "./v5-to-v6/pipelines/cmsEntry.ts";

export const v5ToV6Preset: MigrationPreset = {
    name: "v5-to-v6",
    description: "Webiny v5 to v6 migration with all necessary transformations",
    configure(runner: PipelineRunner.Interface): void {
        fmSettingsPipeline.register(runner, DdbScanner, DdbProcessor);
        fmFilePipeline.register(runner, DdbScanner, DdbProcessor);
        mailerSettingsPipeline.register(runner, DdbScanner, DdbProcessor);
        securityGroupsPipeline.register(runner, DdbScanner, DdbProcessor);
        securityTeamsPipeline.register(runner, DdbScanner, DdbProcessor);
        cmsModelPipeline.register(runner, DdbScanner, DdbProcessor);
        folderPermissionsPipeline.register(runner, DdbScanner, DdbProcessor);
        cmsEntryPipeline.register(runner, DdbScanner, DdbProcessor);
    }
};

export default v5ToV6Preset;
```

- [ ] **Step 4: Verify round-trip test passes**

```bash
yarn test __tests__/presets/v5-to-v6-ddb.test.ts
```

Expected: 1 test passing.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
yarn test
```

Expected: all previously-passing tests still pass. One previously-skipped test remains skipped (PresetLoader) — unskipped in Task 11.

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6-ddb.ts __tests__/presets/v5-to-v6-ddb.test.ts
git commit -m "feat: rewrite v5-to-v6-ddb preset using new pipeline factories"
```

---

### Task 10: Rewrite `v5-to-v6-os.ts` preset

**Files:**
- Modify: `src/presets/v5-to-v6-os.ts` (full rewrite)
- Create: `__tests__/presets/v5-to-v6-os.test.ts`

- [ ] **Step 1: Write the failing round-trip test**

Create `__tests__/presets/v5-to-v6-os.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createOsContainer } from "../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { v5ToV6OsPreset } from "~/presets/v5-to-v6-os.ts";

describe("v5ToV6OsPreset — registration", () => {
    it("registers the cmsEntryOs pipeline against the OS scanner", () => {
        const container = createOsContainer();
        const runner = container.resolve(PipelineRunner);
        v5ToV6OsPreset.configure(runner);
        expect(() => v5ToV6OsPreset.configure(runner)).toThrow(/already registered/i);
    });
});
```

- [ ] **Step 2: Verify test fails**

```bash
yarn test __tests__/presets/v5-to-v6-os.test.ts
```

Expected: FAIL — the current legacy preset uses `PipelineBuilder` imports that break the type-check / runtime.

- [ ] **Step 3: Rewrite the preset**

Replace the contents of `src/presets/v5-to-v6-os.ts` with:

```typescript
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
import { cmsEntryOsPipeline } from "./v5-to-v6/pipelines/cmsEntryOs.ts";

export const v5ToV6OsPreset: MigrationPreset = {
    name: "v5-to-v6-os",
    description: "Webiny v5 to v6 OpenSearch migration — CMS entries",
    configure(runner: PipelineRunner.Interface): void {
        cmsEntryOsPipeline.register(runner, OsScanner, OsProcessor);
    }
};

export default v5ToV6OsPreset;
```

- [ ] **Step 4: Verify test passes**

```bash
yarn test __tests__/presets/v5-to-v6-os.test.ts
```

Expected: 1 test passing.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: no regressions.

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/presets/v5-to-v6-os.ts __tests__/presets/v5-to-v6-os.test.ts
git commit -m "feat: rewrite v5-to-v6-os preset using new pipeline factories"
```

---

### Task 11: Delete legacy infra + re-enable PresetLoader skip

**Files:**
- Delete: `src/domain/transform/Pipeline.ts`
- Delete: `src/domain/transform/PipelineBuilder.ts`
- Delete: `src/domain/transform/Transformer.ts`
- Delete: `__tests__/domain/transform/Pipeline.test.ts`
- Delete: `__tests__/domain/transform/PipelineBuilder.test.ts`
- Delete: `__tests__/preset-pipelines.test.ts` (already in vitest excludes)
- Delete: `__tests__/nested-pipeline.test.ts`
- Modify: `vitest.config.ts` (remove `__tests__/preset-pipelines.test.ts` from excludes)
- Modify: `__tests__/features/PresetLoader/PresetLoader.test.ts` (remove `it.skip`)

- [ ] **Step 1: Grep for residual consumers**

```bash
grep -rn 'domain/transform/\(Pipeline\|PipelineBuilder\|Transformer\)\.ts' src/ __tests__/ --include="*.ts" 2>/dev/null | grep -v '__tests__/domain/transform/\|__tests__/nested-pipeline\.test\.ts\|__tests__/preset-pipelines\.test\.ts'
```

Expected: empty. If results surface, STOP — investigate. (The filter excludes the tests that will be deleted below; anything else is a real consumer.)

- [ ] **Step 2: Delete legacy source files + their unit tests + dead tests**

```bash
git rm src/domain/transform/Pipeline.ts \
       src/domain/transform/PipelineBuilder.ts \
       src/domain/transform/Transformer.ts \
       __tests__/domain/transform/Pipeline.test.ts \
       __tests__/domain/transform/PipelineBuilder.test.ts \
       __tests__/preset-pipelines.test.ts \
       __tests__/nested-pipeline.test.ts
```

- [ ] **Step 3: Update vitest excludes**

Modify `vitest.config.ts` — remove the line `"__tests__/preset-pipelines.test.ts",` from the exclude list (since the file no longer exists).

- [ ] **Step 4: Re-enable `PresetLoader.test.ts` skip**

In `__tests__/features/PresetLoader/PresetLoader.test.ts`, find the `it.skip` added during Plan-A Task 9 with the "Plan B" comment. Flip `it.skip` back to `it` and remove the explanatory comment (the reason it was skipped is now resolved).

- [ ] **Step 5: Run tests + ts-check**

```bash
yarn test
yarn ts-check 2>&1 | grep "error TS" | wc -l
```

Expected: all tests pass (no skips related to this plan). ts-check count DROPS compared to baseline — the two now-missing legacy files were the source of several residual errors in the excluded preset files that are about to get ported.

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add -A
git commit -m "chore: delete legacy Pipeline/PipelineBuilder/Transformer + dead tests"
```

---

### Task 12: Port excluded tests — Batch A (simple/unit-ish)

**Files:**
- Modify: `__tests__/batch-processing.test.ts`
- Modify: `__tests__/record-filtering.test.ts`
- Modify: `__tests__/global-transformations.test.ts`
- Modify: `vitest.config.ts` (remove these 3 from excludes)

- [ ] **Step 1: Read each file to understand current shape**

```bash
cat __tests__/batch-processing.test.ts
cat __tests__/record-filtering.test.ts
cat __tests__/global-transformations.test.ts
```

Record: what each test currently asserts, which legacy APIs it calls, which transformers/pipelines it exercises.

- [ ] **Step 2: Port each file to the new API**

For each test file: replace legacy `new PipelineBuilder().use(x).filter(y).build()` with:
```typescript
const container = createDdbContainer({ sourceRecords: { "source-table": [...records] } });
const runner = container.resolve(PipelineRunner);
const builder = runner.pipeline<BaseRecord, DdbTransformContext.Interface<BaseRecord>, DdbScanner.Shard>({
    name: "test",
    scanner: DdbScanner,
    processor: DdbProcessor
});
builder.filter(createFilter(predicate)).use(transformer);
runner.register(builder.build());
await runner.run();
const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
// assert targetDb.batchPutRecords
```

Replace legacy `await runner.processRecord(r)` / `await runner.processAll()` with `await runner.run()`.

Replace legacy `Transformer<DdbTransformContext.Interface>` shape with transformer functions imported from `~/transformers/...`.

Preserve what each test asserts — change how it sets up, not what it checks.

- [ ] **Step 3: Remove from vitest excludes**

Modify `vitest.config.ts` — remove these 3 lines from the exclude list:
```
"__tests__/batch-processing.test.ts",
"__tests__/global-transformations.test.ts",
"__tests__/record-filtering.test.ts",
```

- [ ] **Step 4: Verify the batch passes**

```bash
yarn test __tests__/batch-processing.test.ts __tests__/record-filtering.test.ts __tests__/global-transformations.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: test count grows by 3 files; all pass.

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add -A
git commit -m "test: port batch-processing, record-filtering, global-transformations to new API"
```

---

### Task 13: Port excluded tests — Batch B (per-pipeline unit tests)

**Files:**
- Modify: `__tests__/cms-entries.test.ts`
- Modify: `__tests__/cms-model-field-attributes.test.ts`
- Modify: `__tests__/file-manager-metadata.test.ts`
- Modify: `__tests__/file-manager-settings.test.ts`
- Modify: `vitest.config.ts` (remove these 4 from excludes)

- [ ] **Step 1: Read each file**

```bash
cat __tests__/cms-entries.test.ts
cat __tests__/cms-model-field-attributes.test.ts
cat __tests__/file-manager-metadata.test.ts
cat __tests__/file-manager-settings.test.ts
```

- [ ] **Step 2: Port each file to the new API**

Same port pattern as Task 12. For each file, the mapping is:
- `cms-entries` → register `cmsEntryPipeline`, seed a CMS entry fixture, assert on `targetDb.batchPutRecords`.
- `cms-model-field-attributes` → register `cmsModelPipeline`, seed a model fixture with legacy field attributes, assert the rename happened.
- `file-manager-metadata` → register `fmFilePipeline`, seed an FM file record, assert metadata creation effects.
- `file-manager-settings` → register `fmSettingsPipeline`, seed an fm.settings record, assert the transformed output.

Use the standard `createDdbContainer(...)` → `pipeline.register(runner, DdbScanner, DdbProcessor)` → `await runner.run()` → inspect `targetDb.batchPutRecords` flow.

- [ ] **Step 3: Remove from vitest excludes**

Remove these 4 lines from `vitest.config.ts` excludes:
```
"__tests__/cms-entries.test.ts",
"__tests__/cms-model-field-attributes.test.ts",
"__tests__/file-manager-metadata.test.ts",
"__tests__/file-manager-settings.test.ts",
```

- [ ] **Step 4: Verify the batch passes**

```bash
yarn test __tests__/cms-entries.test.ts __tests__/cms-model-field-attributes.test.ts __tests__/file-manager-metadata.test.ts __tests__/file-manager-settings.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: no regressions.

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add -A
git commit -m "test: port cms-entries, cms-model-field-attributes, file-manager-metadata, file-manager-settings to new API"
```

---

### Task 14: Port excluded tests — Batch C (security + folders + mailer)

**Files:**
- Modify: `__tests__/security-groups-to-roles.test.ts`
- Modify: `__tests__/security-teams.test.ts`
- Modify: `__tests__/folder-records.test.ts`
- Modify: `__tests__/mailer-settings.test.ts`
- Modify: `vitest.config.ts` (remove these 4 from excludes)

- [ ] **Step 1: Read each file**

```bash
cat __tests__/security-groups-to-roles.test.ts
cat __tests__/security-teams.test.ts
cat __tests__/folder-records.test.ts
cat __tests__/mailer-settings.test.ts
```

- [ ] **Step 2: Port each file to the new API**

Mapping:
- `security-groups-to-roles` → register `securityGroupsPipeline`, seed a security.group record, assert the TYPE change to `security.role`.
- `security-teams` → register `securityTeamsPipeline`, seed a security.team record, assert the data envelope wrap.
- `folder-records` → register `folderPermissionsPipeline`, seed an FLP record with `#0001` revision suffix on `data.id`, assert it's stripped.
- `mailer-settings` → register `mailerSettingsPipeline`, seed a mailerSettings record, assert the transformed output.

- [ ] **Step 3: Remove from vitest excludes**

Remove these 4 lines from `vitest.config.ts` excludes:
```
"__tests__/folder-records.test.ts",
"__tests__/mailer-settings.test.ts",
"__tests__/security-groups-to-roles.test.ts",
"__tests__/security-teams.test.ts",
```

- [ ] **Step 4: Verify the batch passes**

```bash
yarn test __tests__/security-groups-to-roles.test.ts __tests__/security-teams.test.ts __tests__/folder-records.test.ts __tests__/mailer-settings.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: no regressions.

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add -A
git commit -m "test: port security + folders + mailer to new API"
```

---

### Task 15: Port excluded tests — Batch D (preset-level)

**Files:**
- Modify: `__tests__/preset-system.test.ts`
- Modify: `__tests__/full-table-migration.test.ts`
- Modify: `__tests__/os-table-migration.test.ts`
- Modify: `vitest.config.ts` (remove these 3 from excludes)

- [ ] **Step 1: Read each file**

```bash
cat __tests__/preset-system.test.ts
cat __tests__/full-table-migration.test.ts
cat __tests__/os-table-migration.test.ts
```

- [ ] **Step 2: Port each file to the new API**

Mapping:
- `preset-system` → resolve `PresetLoader` from container, load `v5-to-v6`, call `configure(runner)`, assert no throw / correct registration count.
- `full-table-migration` → seed a full-table fixture via `MockDynamoDbClient`, call `v5ToV6Preset.configure(runner)`, `await runner.run()`, inspect `targetDb.batchPutRecords` across all 8 branches.
- `os-table-migration` → seed OS fixture via `createOsContainer`, call `v5ToV6OsPreset.configure(runner)`, `await runner.run()`, inspect `MockOpenSearchClient` bulk-indexed docs.

- [ ] **Step 3: Remove from vitest excludes**

Remove these 3 lines from `vitest.config.ts` excludes:
```
"__tests__/full-table-migration.test.ts",
"__tests__/os-table-migration.test.ts",
"__tests__/preset-system.test.ts",
```

- [ ] **Step 4: Verify the batch passes**

```bash
yarn test __tests__/preset-system.test.ts __tests__/full-table-migration.test.ts __tests__/os-table-migration.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: no regressions.

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add -A
git commit -m "test: port preset-system, full-table-migration, os-table-migration to new API"
```

---

### Task 16: Port excluded tests — Batch E (OS integration)

**Files:**
- Modify: `__tests__/integration/os-migration.test.ts`
- Modify: `vitest.config.ts` (remove from excludes)

The last excluded file. 380 LOC — the biggest port in this plan. Read carefully first; trim redundancy with `cmsEntryOs.test.ts` + `os-table-migration.test.ts` + `v5-to-v6-os.test.ts` if the content overlaps substantially (no duplicated assertions across 4 files — keep whichever is clearer).

- [ ] **Step 1: Read the file and categorize its tests**

```bash
cat __tests__/integration/os-migration.test.ts
```

For each `it(...)` block: decide whether it's (a) duplicated by an existing ported test (skip — just delete the `it` block), or (b) unique coverage (port it).

- [ ] **Step 2: Port each retained test to the new API**

For each retained block:
```typescript
const container = createOsContainer({ sourceRecords: { "source-primary": [...] } });
const runner = container.resolve(PipelineRunner);
v5ToV6OsPreset.configure(runner);
await runner.run();
// assert on MockOpenSearchClient state
```

- [ ] **Step 3: Remove from vitest excludes**

Remove this line from `vitest.config.ts` excludes:
```
"__tests__/integration/os-migration.test.ts",
```

- [ ] **Step 4: Verify the file passes**

```bash
yarn test __tests__/integration/os-migration.test.ts
```

Expected: all retained tests pass.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: no regressions. The vitest excludes list should now contain ZERO entries for this plan's scope (only node_modules and the comment block about legacy tests remain — remove the now-stale comment too).

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add -A
git commit -m "test: port integration/os-migration to new API; vitest excludes now empty"
```

---

### Task 17: Final verification

No files modified. No commit.

- [ ] **Step 1: Format check**

```bash
yarn format:fix
```

Expected: no-op (maybe `src/presets/example.ts` reformats unrelatedly — ignore/revert).

- [ ] **Step 2: Type-check**

```bash
yarn ts-check 2>&1 | grep "error TS" | wc -l
```

Record the count. Expected: noticeably lower than the Plan-A end baseline (82), because the rewritten presets no longer fail type-check. Remaining errors are the pre-existing variance-pattern errors (`Abstraction<IScanner<unknown, unknown>>` vs `Abstraction<Interface<BaseRecord, DdbShard>>`) plus ~9 new call sites where `pipeline.register(runner, DdbScanner/OsScanner, DdbProcessor/OsProcessor)` triggers the same variance pattern. Count should land at ~15-20, all the same root cause.

- [ ] **Step 3: Test suite**

```bash
yarn test 2>&1 | grep -E "Test Files|Tests "
```

Expected: test count grows vs Plan-A end baseline (397 tests / 1 skipped) by ~20 ported tests. No skips. No excluded files. Record the actual number.

- [ ] **Step 4: Inventory check**

```bash
ls src/presets/v5-to-v6/pipelines/
ls src/domain/transform/
grep -c '"__tests__' vitest.config.ts
```

Expected:
- `src/presets/v5-to-v6/pipelines/` lists exactly 9 `.ts` files (`cmsEntry`, `cmsModel`, `fmFile`, `fmSettings`, `mailerSettings`, `securityGroups`, `securityTeams`, `folderPermissions`, `cmsEntryOs`).
- `src/domain/transform/` lists `Preset.ts`, `filters.ts`, `commands/`, `types/`, and `index.ts` — no `Pipeline.ts`, `PipelineBuilder.ts`, `Transformer.ts`.
- `vitest.config.ts` has zero `"__tests__/...` entries in the excludes list (only `"**/node_modules/**"`).

- [ ] **Step 5: Commit log review**

```bash
git log --oneline -18
```

Expected: ~16 commits from this plan (tasks 1-16) + the spec commit at the bottom. Task 17 itself doesn't commit.

- [ ] **Step 6: Public API sanity check**

```bash
grep -c 'export' src/index.ts
```

Expected: same export count as Plan-A end (no new public-API additions in this plan — the new pipeline definitions stay unexported unless a follow-up chooses to expose them).

---

## Summary of What This Plan Delivers

- **9 pipeline definitions** in `src/presets/v5-to-v6/pipelines/` (camelCase filenames).
- **2 rewritten presets** (`v5-to-v6-ddb.ts`, `v5-to-v6-os.ts`) as thin registrars.
- **2 new preset round-trip tests** (`__tests__/presets/v5-to-v6-ddb.test.ts`, `__tests__/presets/v5-to-v6-os.test.ts`).
- **6 new pipeline-definition tests** (one per new pipeline).
- **7 deletions** — `src/domain/transform/{Pipeline,PipelineBuilder,Transformer}.ts` + their 2 unit tests + `nested-pipeline.test.ts` + `preset-pipelines.test.ts`.
- **15 test ports** — all 16 previously-excluded files re-enabled (minus `preset-pipelines.test.ts` which got deleted in Task 11).
- **Zero vitest excludes** related to this plan's scope.
- **PresetLoader skip** re-enabled.

**Closes Plan-A's deferred Task 11** (legacy Transformer.ts deletion).
