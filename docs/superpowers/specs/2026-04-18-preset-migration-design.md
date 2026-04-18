# Preset Migration (Plan B) Design

**Date:** 2026-04-18
**Package:** `@webiny/data-transfer`
**Follows:** `2026-04-18-transformer-library-design.md` (Plan A), which landed `createTransformer` / `createDdbTransformer` / `createOsTransformer` / `createPipeline` / `createDdbPipeline` / `createOsPipeline`, all 19 built-in transformers as plain functions, and three `PipelineDefinition` consts (`cmsEntryPipeline`, `cmsModelPipeline`, `fmFilePipeline`).

---

## Goal

Replace the legacy `v5-to-v6-ddb.ts` / `v5-to-v6-os.ts` presets with versions built on the new pipeline factories, delete the now-unused legacy `src/domain/transform/{Pipeline,PipelineBuilder,Transformer}.ts` and their tests, and port all 16 vitest-excluded test files plus `__tests__/nested-pipeline.test.ts` to the new `PipelineRunner` API.

End state: no file under `src/domain/transform/` references `TransformPipeline`/legacy `Transformer`, no test file imports the deleted infra, and the vitest exclude list is empty (or only contains unrelated legacy entries that we don't own).

---

## Architecture

Everything runs against the new `PipelineRunner` introduced in Plan A. A `MigrationPreset` is still `{ name, description, configure(runner) }` — the new `configure` body calls `<pipelineDefinition>.register(runner, Scanner, Processor)` for prebuilt pipelines, or uses `runner.pipeline({...}).filter().use().build()` + `runner.register(...)` for ad-hoc ones. In this plan every preset pipeline becomes a named `PipelineDefinition`, so `.register(...)` is the only call shape inside `configure`.

The legacy `src/domain/transform/Pipeline.ts` (the `TransformPipeline` class) and `src/domain/transform/PipelineBuilder.ts` (the legacy builder wrapping it) lose their last consumers when the two presets are rewritten, at which point they can be deleted together with `src/domain/transform/Transformer.ts` and any test file whose subject is one of those three.

The `PipelineBuilder.use()` type-broadening added in Plan-A Task 3 (accepts both legacy `Transformer` and new `Transformer.Interface`) goes away with the file — it was only a bridge.

---

## File Structure

### New pipeline definitions (`src/presets/v5-to-v6/pipelines/`)

All filenames camelCase. All pipeline names (the string passed to the factory, surfaced in logs) stay kebab-case to match existing runner integration conventions.

| File | Export | Pipeline name | Scanner binding | Filter | Transformer chain |
|---|---|---|---|---|---|
| `cmsEntry.ts` *(renamed)* | `cmsEntryPipeline` | `cms-entries` | DDB | `isCmsEntry` | `wrapInData, addGsiTenant, removeLocale, fixCmePk, fixBrokenStorageKeys, transformRichText, updateModelIds, removeFolderRevision, removeAttributes` |
| `cmsModel.ts` *(renamed)* | `cmsModelPipeline` | `cms-models` | DDB | `isCmsModel` | `wrapInData, addGsiTenant, removeLocale, transformModelGroup, renameFieldAttributes, removeAttributes` |
| `fmFile.ts` *(renamed)* | `fmFilePipeline` | `fm-files` | DDB | `[isCmsEntry, isFmFile]` (AND) | cmsEntry chain + `createMetadata, extractImageMetadata` |
| `fmSettings.ts` *(new)* | `fmSettingsPipeline` | `fm-settings` | DDB | `byType("fm.settings")` | `wrapInData, migrateFileManagerSettings, removeAttributes` |
| `mailerSettings.ts` *(new)* | `mailerSettingsPipeline` | `mailer-settings` | DDB | inline: `r => r.SK === "L" && r.modelId === "mailerSettings"` | `wrapInData, migrateMailerSettings, removeAttributes` |
| `securityGroups.ts` *(new)* | `securityGroupsPipeline` | `security-groups` | DDB | inline: `r => r.TYPE === "security.group" && !isBuiltInSecurityRole(r)` | `wrapInData, addGsiTenant, groupsToRoles, transformPermissions, removeAttributes` |
| `securityTeams.ts` *(new)* | `securityTeamsPipeline` | `security-teams` | DDB | `isSecurityTeam` | `wrapInData, addGsiTenant, removeAttributes` |
| `folderPermissions.ts` *(new)* | `folderPermissionsPipeline` | `folder-permissions` | DDB | `isFlpRecord` | `wrapInData, addGsiTenant, removeLocale, removeAttributes, updateFlpIds` |
| `cmsEntryOs.ts` *(new)* | `cmsEntryOsPipeline` | `cms-entries-os` | OS | `isCmsEntry` | same chain as `cmsEntryPipeline` |

Each new pipeline file is ~15-25 LOC. Each has a matching `*.test.ts` under `__tests__/presets/v5-to-v6/pipelines/` asserting `.name` and the `.register` + duplicate-registration-throws contract — same pattern as the three existing ones.

### Rewritten presets

**`src/presets/v5-to-v6-ddb.ts`** — thin registrar:

```typescript
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { fmSettingsPipeline }        from "./v5-to-v6/pipelines/fmSettings.ts";
import { fmFilePipeline }            from "./v5-to-v6/pipelines/fmFile.ts";
import { mailerSettingsPipeline }    from "./v5-to-v6/pipelines/mailerSettings.ts";
import { securityGroupsPipeline }    from "./v5-to-v6/pipelines/securityGroups.ts";
import { securityTeamsPipeline }     from "./v5-to-v6/pipelines/securityTeams.ts";
import { cmsModelPipeline }          from "./v5-to-v6/pipelines/cmsModel.ts";
import { folderPermissionsPipeline } from "./v5-to-v6/pipelines/folderPermissions.ts";
import { cmsEntryPipeline }          from "./v5-to-v6/pipelines/cmsEntry.ts";

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

Registration order preserves the legacy preset's first-match-wins requirements:

- `fmFile` BEFORE `cmsEntry` — FM files match both filters; `cmsEntry` is the catch-all.
- Everything else is type-specific enough to not collide with `cmsEntry`, but order-as-listed matches the pre-existing preset for diff-minimality.

**`src/presets/v5-to-v6-os.ts`** — single pipeline:

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

### Legacy deletion

Source:
- `src/domain/transform/Pipeline.ts`
- `src/domain/transform/PipelineBuilder.ts`
- `src/domain/transform/Transformer.ts`

Tests:
- `__tests__/domain/transform/Pipeline.test.ts` (subject gone)
- `__tests__/domain/transform/PipelineBuilder.test.ts` (subject gone)
- `__tests__/preset-pipelines.test.ts` (subject gone after Plan-A Task 9; presently in vitest excludes)
- `__tests__/nested-pipeline.test.ts` (tests legacy `TransformPipeline`; per-Bruno, no port — delete)

Re-enable:
- `__tests__/features/PresetLoader/PresetLoader.test.ts` — remove the `it.skip` added in Plan-A Task 9; the test passes once `v5-to-v6-ddb.ts` loads cleanly.

### Processor token resolution

This design assumes `DdbProcessor` and `OsProcessor` tokens are exported and resolvable from DI. If only a shared base `Processor` token exists (as `PipelineRunner.integration.test.ts` uses), the plan will fall back to passing that token — the pipeline definitions don't care which token is passed, only that the runner resolves a compatible `Processor.Interface`. Plan-writing verifies this before generating per-task instructions.

---

## Excluded Test Migration (16 files)

Every excluded test is ported to the new API. No deletions in this set.

**Port pattern:**

Legacy shape (varies — typically):
```typescript
const runner = container.resolve(PipelineRunner);
await runner.processRecord(record);        // gone
await runner.processAll();                 // gone
// or
const pipeline = new TransformPipeline().use(t);
await pipeline.run(record, ctxFactory);    // gone
```

New shape:
```typescript
const container = createDdbContainer({ sourceRecords: { "source-table": [record] } });
const runner = container.resolve(PipelineRunner);
<pipelineDefinition>.register(runner, DdbScanner, DdbProcessor);
// or for ad-hoc:
const builder = runner.pipeline<BaseRecord, DdbTransformContext.Interface<BaseRecord>, DdbScanner.Shard>({
    name: "test",
    scanner: DdbScanner,
    processor: DdbProcessor
});
builder.filter(createFilter(r => r.TYPE === "xxx")).use(myTransformer);
runner.register(builder.build());
await runner.run();
const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
// assert targetDb.batchPutRecords
```

**Per-file disposition** (decided at plan-writing time based on content read; this spec lists the 16 in batches for grouping):

| # | File | Current subject | New-API equivalent |
|---|---|---|---|
| 1 | `batch-processing.test.ts` | runner batching via removed `processAll` | runner batch via `runner.run()` |
| 2 | `cms-entries.test.ts` | CmsEntry pipeline end-to-end | `cmsEntryPipeline.register` + `runner.run()` |
| 3 | `cms-model-field-attributes.test.ts` | CmsModel rename behavior e2e | `cmsModelPipeline` + seeded fixture |
| 4 | `file-manager-metadata.test.ts` | FM file metadata side-effects | `fmFilePipeline` + seeded fixture |
| 5 | `file-manager-settings.test.ts` | FM settings transform | `fmSettingsPipeline` |
| 6 | `folder-records.test.ts` | FLP transform | `folderPermissionsPipeline` |
| 7 | `full-table-migration.test.ts` | whole-preset smoke | seeded fixture with one record per branch + `v5ToV6Preset.configure(runner)` |
| 8 | `global-transformations.test.ts` | global transformers via pipeline | single ad-hoc pipeline per case |
| 9 | `integration/os-migration.test.ts` | OS preset e2e | `v5ToV6OsPreset.configure(runner)` |
| 10 | `mailer-settings.test.ts` | mailer settings transform | `mailerSettingsPipeline` |
| 11 | `os-table-migration.test.ts` | OS table seeding + pipeline | `cmsEntryOsPipeline.register` + `OsScanner` |
| 12 | `preset-pipelines.test.ts` | DELETE — tested 3 deleted classes |
| 13 | `preset-system.test.ts` | preset loader + configure e2e | `PresetLoader` + `v5ToV6Preset.configure` |
| 14 | `record-filtering.test.ts` | filter predicates | ad-hoc pipelines exercising `accepts` |
| 15 | `security-groups-to-roles.test.ts` | security groups → roles e2e | `securityGroupsPipeline` |
| 16 | `security-teams.test.ts` | security teams e2e | `securityTeamsPipeline` |

(Row 12 — `preset-pipelines.test.ts` — is a delete, not a port; listed here for completeness. The count remaining after the delete is 15 files ported.)

**Big-file call-out:** `__tests__/integration/os-migration.test.ts` is 380 LOC. Plan-writing re-reads it and decides whether a full port is warranted or whether coverage is already met by `cmsEntryOs.test.ts` + the new OS round-trip test; a trim-to-essentials port is acceptable if redundancy is high.

---

## Testing Strategy

**New in this plan:**
- 6 pipeline-definition tests for the 6 new definitions (name + register + dup throws).
- 2 preset round-trip tests:
  - `__tests__/presets/v5-to-v6-ddb.test.ts` — seeded `MockDynamoDbClient` with one record per pipeline branch (~8 records), call `v5ToV6Preset.configure(runner)`, `await runner.run()`, assert `targetDb.batchPutRecords` contains one record per branch. Verifies registration order + first-match-wins for `fmFile` vs `cmsEntry`.
  - `__tests__/presets/v5-to-v6-os.test.ts` — same pattern via `MockOpenSearchClient` + `cmsEntryOsPipeline`.

**Preserved:**
- All 19 transformer unit tests (unchanged).
- 3 existing pipeline-definition tests (renamed with the file renames).
- `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`.
- 15 ported excluded tests.

**Removed:**
- `__tests__/nested-pipeline.test.ts` — deleted, `executePipeline` loses integration coverage. Unit coverage not added (explicit decision during brainstorming).
- `__tests__/preset-pipelines.test.ts` — deleted, subject removed in Plan A.
- `__tests__/domain/transform/{Pipeline,PipelineBuilder}.test.ts` — deleted with their subjects.

---

## Order of Work

Seven phases, each self-contained, green between phases:

1. **Rename existing 3 pipeline files to camelCase.** `git mv` cms-entry.ts → cmsEntry.ts, cms-model.ts → cmsModel.ts, fm-file.ts → fmFile.ts, + their test files. Update import in `src/index.ts`. Update import in the legacy `v5-to-v6-ddb.ts` (still references these via old paths until phase 3). 1 commit.
2. **Add 6 new pipeline definitions.** Each its own commit: `fmSettings`, `mailerSettings`, `securityGroups`, `securityTeams`, `folderPermissions`, `cmsEntryOs`. 6 commits.
3. **Rewrite the two presets.** `v5-to-v6-ddb.ts` + round-trip test in 1 commit; `v5-to-v6-os.ts` + round-trip test in 1 commit. 2 commits.
4. **Remove vitest excludes + re-enable PresetLoader skip.** The 16 excluded entries come out of `vitest.config.ts`; the `it.skip` on `PresetLoader.test.ts` flips to `it`. Tests currently fail — those failures are fixed in phase 6. 1 commit.
5. **Delete legacy infra.** `git rm src/domain/transform/{Pipeline,PipelineBuilder,Transformer}.ts`; `git rm __tests__/domain/transform/{Pipeline,PipelineBuilder}.test.ts`; `git rm __tests__/preset-pipelines.test.ts`; `git rm __tests__/nested-pipeline.test.ts`. Preceded by grep verifying zero `src/` consumers. 1 commit.
6. **Port the 16 excluded tests** in batches of 3-4 per commit. ~4-5 commits. Each batch ends green.
7. **Final verification.** `yarn format:fix` → no-op. `yarn ts-check` → error count goes down significantly (variance-pattern errors from Plan A remain until a separate typing cleanup). `yarn test` → all green, no excluded tests, no skips. Commit log review. No commit.

Total: ~14-16 commits. Phases 4 and 6 are temporarily red between themselves — that's the only red window in the whole plan. If a phase-6 port exposes a real bug, fix in-place and keep going.

---

## Risks & Open Questions

- **`DdbProcessor` / `OsProcessor` tokens:** plan-writing verifies their existence in `src/features/` before generating per-task code. Fallback: use the base `Processor` token passed as `DdbProcessor`/`OsProcessor`-typed param via `as Abstraction<Processor.Interface<...>>`.
- **Type-variance errors from Plan A:** `Implementation<Abstraction<IScanner<unknown, unknown>>, typeof DdbScannerImpl>` vs `Abstraction<Interface<BaseRecord, DdbShard>>` — persistent 8-error pattern. This plan adds ~9 new `.register(runner, DdbScanner, DdbProcessor)` call sites + 2 round-trip test files, each triggering the same pattern. Expected new error count: ~15-20 in total. All are the same root cause; a separate typing cleanup is appropriate but out of scope.
- **`executePipeline` coverage gap:** accepted per brainstorming decision. Flag for backlog if it bites.
- **Worker-integration handlers** (`src/commands/processSegment/handler.ts`, `processOsSegment/handler.ts`) stay stubbed — out of scope for this plan.

---

## What This Enables

- `src/domain/transform/` slims down to just the preset/filter surface (filters.ts, Preset.ts, commands/, types/) — everything related to the legacy pipeline class goes away.
- Future presets are one import + one `<pipeline>.register(runner, Scanner, Processor)` call per pipeline. No new builder class inheritance chain.
- The vitest exclude list becomes empty or contains only unrelated legacy entries — no more "tests live on the shelf until the preset migration plan lands" debt.
- Plan A's deferred Task 11 (delete legacy `Transformer.ts`) is closed.
