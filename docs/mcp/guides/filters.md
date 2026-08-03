---
name: filters
description: All 18 built-in filter predicates plus createFilter — signatures, matching rules, and usage examples for pipeline .filter() calls.
category: Guides
---

# Filters

A `Filter<TRecord>` is `{ kind: "filter", check: (record) => boolean | Promise<boolean> }`. Build one with `createFilter(predicate)` and attach it to a pipeline with `.filter(...)`. Multiple `.filter()` calls on the same builder AND-compose — a record must pass every filter to be claimed by that pipeline.

```typescript
import { createFilter, isCmsEntry } from "@webiny/data-transfer";

pipelineBuilderFactory
  .create({ name: "cms-entries", scanner: DdbScanner, processors: [DdbProcessor] })
  .filter(createFilter(isCmsEntry))
  .build();
```

## `createFilter`

Source: `src/domain/pipeline/Filter.ts`.

```typescript
export interface Filter<TRecord> {
    readonly kind: "filter";
    readonly check: (record: TRecord) => boolean | Promise<boolean>;
}

function createFilter<TRecord>(
    predicate: (record: TRecord) => boolean | Promise<boolean>
): Filter<TRecord>;
```

Wraps any predicate — sync or async, built-in or inline — into the typed shape the pipeline builder expects.

```typescript
// Inline predicate — no built-in needed for one-off conditions
.filter(createFilter(r => r.TYPE === "cms.entry" && r.modelId === "article"))

// Async predicate is supported (check() may return Promise<boolean>)
.filter(createFilter(async r => (await lookupSomething(r)) != null))
```

## Import

All 18 predicates are exported directly from the package root, alongside `createFilter`:

```typescript
import {
  createFilter,
  byType,
  byTypePrefix,
  isCmsGroup,
  isCmsModel,
  isCmsEntry,
  byIncludesModelId,
  isAcoSearchRecord,
  isAdminUser,
  isBackgroundTask,
  isFmFile,
  isFlpRecord,
  isBuiltInSecurityRole,
  isSecurityTeam,
  isOsBackgroundTask,
  isOsMailerSettings,
  isAuditLogEntry,
  isMigrationRecord,
  isFormBuilderRecord
} from "@webiny/data-transfer";
```

Source: `src/domain/transform/filters.ts`.

## Predicate reference

| Predicate | Signature | Matches | Notes |
| --- | --- | --- | --- |
| `byType` | `(type: string) => (record) => boolean` | `record.TYPE === type` exactly | Factory — call with the exact type string, e.g. `byType("cms.model")` |
| `byTypePrefix` | `(prefix: string) => (record: BaseRecord) => boolean` | `record.TYPE` starts with `prefix` | Factory — for TYPE families like `"cms.entry"` |
| `isCmsGroup` | `(record: BaseRecord) => boolean` | `TYPE === "cms.group"` OR `PK` includes `"#CMS#CMG"` | Handles both raw v5 and reshaped record forms |
| `isCmsModel` | `(record: BaseRecord) => boolean` | `= byType("cms.model")` | Direct alias |
| `isCmsEntry` | `(input: BaseRecord) => boolean` | `TYPE` prefixed `"cms.entry"` OR `PK` includes `"#CMS#CME#"` | Catch-all for CMS entries regardless of shape |
| `byIncludesModelId` | `(target: string) => (record: BaseRecord) => boolean` | `record.index` or `record.modelId` (also checked under `record.data`) contains `target`, case-insensitive | Factory — used to build `isAcoSearchRecord` |
| `isAcoSearchRecord` | `(record: BaseRecord) => boolean` | `= byIncludesModelId("acoSearchRecord")` | ACO search cache records |
| `isAdminUser` | `(record: BaseRecord) => boolean` | `PK` includes `"#SECURITY#USER#"` AND `GSI1_PK === "securityRole#full-access"` | Full-access admin user records |
| `isBackgroundTask` | `(item: BaseRecord) => boolean` | `modelId === "webinyTask"` / `"webinyTaskLog"`, or `GSI1_PK` includes either string | DDB-side background task records |
| `isFmFile` | `(record: BaseRecord) => boolean` | `modelId` (top-level or `record.data.modelId`) is `"fmFile"` or `"wbyFmFile"` | File Manager file records |
| `isFlpRecord` | `(record: Record<string, unknown>) => boolean` | `PK` (string) includes `"#FLP#"` | Folder location permission records |
| `isBuiltInSecurityRole` | `(record: Record<string, unknown>) => boolean` | `slug` or `GSI1_SK` is `"full-access"` or `"anonymous"` | Use to exclude built-in roles from a custom `SecurityGroups` filter |
| `isSecurityTeam` | `(record: BaseRecord) => boolean` | `= byType("security.team")` | Direct alias |
| `isOsBackgroundTask` | `(record: Record<string, unknown>) => boolean` | `record.data.modelId` is `"webinyTask"` or `"webinyTaskLog"` | OS-side equivalent of `isBackgroundTask` — reads from the decompressed `data` payload |
| `isOsMailerSettings` | `(record: Record<string, unknown>) => boolean` | `record.data.modelId === "mailerSettings"` | OS-side mailer settings |
| `isAuditLogEntry` | `(record: BaseRecord) => boolean` | `modelId` (top-level or `.data`) lowercases to `"acosearchrecord-auditlogs"` AND `SK === "L"` | Must be filtered for before `isAcoSearchRecord`/`isCmsEntry` — shares the modelId prefix |
| `isMigrationRecord` | `(record: BaseRecord) => boolean` | `PK` starts with `"MIGRATION"` | v5 migration-tracking records; typically blackholed |
| `isFormBuilderRecord` | `(record: BaseRecord) => boolean` | `PK` includes `"#FB#"`, OR `TYPE` starts with `"fb.form."` / `"fb.formSubmission"` | Form Builder forms + submissions; no v6 migration path yet |

## Predicates that read both raw and reshaped record shapes

Several predicates check a helper that falls back from a top-level property to the same property nested under `record.data` — this lets one filter match records both **before** and **after** a `wrapInData`-style transformer has run:

```typescript
// Internal helper used by byIncludesModelId / isAuditLogEntry
function getPropertyFromRecord<T>(record, propertyName: string): T | undefined {
    const value = record[propertyName];
    if (value !== undefined) return value;
    return record.data?.[propertyName];
}
```

`isFmFile`, `isOsBackgroundTask`, and `isOsMailerSettings` apply the same pattern directly for `modelId`.

## Ordering rules when composing filters

Filters only decide whether a pipeline **claims** a record — they don't decide overall precedence across pipelines by themselves. Combine filter choice with **registration order** (first-match-wins across a merge group):

```typescript
import {
  createFilter,
  isAuditLogEntry,
  isAcoSearchRecord,
  isCmsEntry,
  isFmFile
} from "@webiny/data-transfer";

// 1. Audit logs FIRST — isAuditLogEntry and isAcoSearchRecord both match
//    modelId "acoSearchRecord-AuditLogs" style prefixes; audit logs must win.
runner.register(auditLogsPipeline);

// 2. Generic ACO search cache records
runner.register(acoSearchPipeline);

// 3. File manager files BEFORE the CMS-entry catch-all — fm files are
//    also CMS entries and would otherwise be claimed by #4.
runner.register(fileManagerFilesPipeline);

// 4. Everything else that looks like a CMS entry
runner.register(cmsEntriesPipeline);
```

See `writingPresets.md` for the full first-match-wins model and `pipeline-runtime.md` for merge-group semantics.

## AND-composing multiple filters on one pipeline

```typescript
import { createFilter, isCmsEntry, byIncludesModelId } from "@webiny/data-transfer";

pipelineBuilderFactory
  .create({ name: "articles", scanner: DdbScanner, processors: [DdbProcessor] })
  .filter(createFilter(isCmsEntry))
  .filter(createFilter(byIncludesModelId("article")))   // AND — must ALSO be modelId "article"
  .build();
```

## Zero-filter catch-all

Omitting `.filter(...)` entirely makes a pipeline accept every record its merge group offers it — used for verbatim-copy presets or as a final catch-all registered last:

```typescript
const everything = pipelineBuilderFactory
  .create({ name: "everything", scanner: DdbScanner, processors: [DdbProcessor] })
  .build(); // no .filter() → matches all
```
