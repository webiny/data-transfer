---
name: v5-to-v6-os
description: Webiny v5 → v6 migration of the OpenSearch companion DynamoDB table.
category: Presets
---

# v5-to-v6-os

**Use when:** migrating a Webiny v5 project's OpenSearch companion DynamoDB table (the table that backs CMS search indexing) to v6. Run this **after** `v5-to-v6-ddb` — it only makes sense once the primary table has already been migrated. Only relevant if the project has `target.opensearch` configured.

**What it does:**

- Scans the OpenSearch DynamoDB table via `OsScanner` (which decompresses/normalizes the OS record shape); runs 5 first-match-wins pipelines over it via `OsProcessor`.
- Blackholes (drops) ACO search records, background tasks, and mailer settings — none of these have a v6 target in the OS table (mailer settings migrate via the DDB preset into the KV store instead).
- Reshapes File Manager file records and all remaining CMS entries into v6 storage format, mirroring the equivalent DDB-preset transformer chain but adapted for the OS record shape (`data` is already populated by `OsScanner`, so `wrapInData` is not needed).

**Pipelines registered** (in registration order — first match wins):

| # | Pipeline            | Scanner + Processors            | Filter                | Notes |
| - | -------------------- | -------------------------------- | ---------------------- | ----- |
| 1 | `AcoSearchRecords`   | `OsScanner` + `[OsProcessor]`     | `isAcoSearchRecord`     | `.blackhole()` — always dropped |
| 2 | `BackgroundTasks`    | `OsScanner` + `[OsProcessor]`     | `isOsBackgroundTask`    | `.blackhole()` — must run before `CmsEntries` (background tasks are CMS entries in the OS table) |
| 3 | `MailerSettings`     | `OsScanner` + `[OsProcessor]`     | `isOsMailerSettings`    | `.blackhole()` — v6 stores mailer settings in the KV store, migrated by the DDB preset; must run before `CmsEntries` |
| 4 | `FileManagerFiles`   | `OsScanner` + `[OsProcessor]`     | `isFmFile`              | Must run before `CmsEntries` (fm files satisfy `isCmsEntry` via TYPE prefix) |
| 5 | `CmsEntries`         | `OsScanner` + `[OsProcessor]`     | `isCmsEntry`            | Catch-all for remaining CMS entries |

**Transformers applied** (in pipeline order):

- `AcoSearchRecords`, `BackgroundTasks`, `MailerSettings`: none — everything they emit is discarded via `.blackhole()`, but filters still evaluate.
- `FileManagerFiles`: `osCmsEntryTransformers` bundle (`addGsiTenant` → `removeLocale` → `fixCmePk` → `fixBrokenStorageKeys` → `transformRichText` → `updateModelIds` → `updateOsIndex` → `removeFolderRevision` → `removeAttributes` → `addTransferTimestamp`)
- `CmsEntries`: `osCmsEntryTransformers` bundle → `addLiveField` → `replaceFileUrls(config)`

**Example usage in a custom preset:**

Extend the catch-all `CmsEntries` pipeline with a project-specific transformer, keeping the same registration order so the blackholed pipelines still claim their records first:

```typescript
import {
  createTransferPreset,
  OsScanner,
  OsProcessor,
  createFilter,
  isAcoSearchRecord,
  isOsBackgroundTask,
  isOsMailerSettings,
  isFmFile,
  isCmsEntry,
  addLiveField,
  replaceFileUrls
} from "@webiny/data-transfer";

export default createTransferPreset({
  name: "my-v5-to-v6-os",
  description: "v5-to-v6-os plus a custom transformer on the CMS entries catch-all.",
  configure({ runner, pipelineBuilderFactory, container }) {
    const acoSearchRecords = pipelineBuilderFactory
      .create({ name: "AcoSearchRecords", scanner: OsScanner, processors: [OsProcessor] })
      .filter(createFilter(isAcoSearchRecord))
      .blackhole()
      .build();

    const backgroundTasks = pipelineBuilderFactory
      .create({ name: "BackgroundTasks", scanner: OsScanner, processors: [OsProcessor] })
      .filter(createFilter(isOsBackgroundTask))
      .blackhole()
      .build();

    const mailerSettings = pipelineBuilderFactory
      .create({ name: "MailerSettings", scanner: OsScanner, processors: [OsProcessor] })
      .filter(createFilter(isOsMailerSettings))
      .blackhole()
      .build();

    const fileManagerFiles = pipelineBuilderFactory
      .create({ name: "FileManagerFiles", scanner: OsScanner, processors: [OsProcessor] })
      .filter(createFilter(isFmFile))
      // osCmsEntryTransformers is not currently a public export — build the equivalent
      // chain yourself, or import it from this preset's source as a reference.
      .build();

    const cmsEntries = pipelineBuilderFactory
      .create({ name: "CmsEntries", scanner: OsScanner, processors: [OsProcessor] })
      .filter(createFilter(isCmsEntry))
      .use(addLiveField)
      .use(replaceFileUrls(container.resolve(/* MigrationConfig */)))
      .build();

    runner
      .register(acoSearchRecords)
      .register(backgroundTasks)
      .register(mailerSettings)
      .register(fileManagerFiles)
      .register(cmsEntries);
  }
});
```

In practice, prefer `PipelineCustomizer` (see `pipeline-customizer.md`) to patch a single pipeline of this built-in preset instead of re-registering all 5 by hand.
