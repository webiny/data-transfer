# OS Transfer Preset Design

**Date:** 2026-04-22

## Overview

Add `v5-to-v6-os.ts` — a transfer preset for Webiny installations using DDB+OpenSearch storage. In OS mode the source table is the OpenSearch DDB table, which contains only CMS-backed entries (every row has an `index` field and a compressed `data` payload). This is distinct from the DDB-only preset, which scans the main application table.

## Key difference from DDB preset

In OS records the CMS entry payload is already in `record.data` (decompressed by `OsScanner`). `wrapInData` would be a no-op, so `osCmsEntryTransformers` omits it. Records also carry an `index` field (the target OpenSearch index name) that must be updated when a `modelId` is renamed.

## New pieces

### 1. `src/transformers/cms/updateOsIndex.ts`

A new `createOsTransformer` that rewrites `record.index` using the official Webiny index-name utility from the webiny packages. Runs after `updateModelIds` so `data.modelId` already holds the new value when the index is reconstructed.

### 2. `src/transformers/cmsEntryTransformers.ts` (update)

Add `osCmsEntryTransformers` alongside the existing `cmsEntryTransformers`:

```
osCmsEntryTransformers = [
    addGsiTenant,
    removeLocale,
    fixCmePk,
    fixBrokenStorageKeys,
    transformRichText,
    updateModelIds,
    updateOsIndex,      // new — updates record.index after modelId rename
    removeFolderRevision,
    removeAttributes
]
```

`wrapInData` is omitted (data already exists). `updateOsIndex` is appended after `updateModelIds`.

### 3. `src/domain/transform/filters.ts` (update)

Two new exports:

- `isOsBackgroundTask` — `data.modelId === "webinyTask" || data.modelId === "webinyTaskLog"`
- `isOsMailerSettings` — `data.modelId === "mailerSettings"`

`isFmFile` already checks `record.data?.modelId` and works unchanged for OS records.

### 4. `src/presets/v5-to-v6-os.ts` (new)

Four pipelines registered in first-match-wins order:

| # | Pipeline | Filter | Action |
|---|----------|--------|--------|
| 1 | BackgroundTasks | `isOsBackgroundTask` | blackhole |
| 2 | MailerSettings | `isOsMailerSettings` | blackhole |
| 3 | FileManagerFiles | `isFmFile` | `osCmsEntryTransformers` + OsProcessor |
| 4 | CmsEntries | `isCmsEntry` | `osCmsEntryTransformers` + OsProcessor |

Scanner: `OsScanner`. Processor: `OsProcessor`.

**Why blackhole mailer settings:** v6 stores mailer settings in the KV store (not OS-indexed). The DDB preset handles the DDB→KV migration; the OS record has no v6 target.

**Why blackhole background tasks:** transient data, same rationale as the DDB preset.

**Why FileManagerFiles before CmsEntries:** `fmFile`/`wbyFmFile` satisfy `isCmsEntry` — without a prior pipeline they would fall through to the catch-all.

## Filter coverage

`isCmsEntry` uses `byTypePrefix("cms.entry")` against the top-level `TYPE` field of the DDB row (`cms.entry.l`, `cms.entry.p`). This field is set by Webiny at write time and is not inside `data`, so it is available before decompression and works unchanged.

No record falls through unmatched.
