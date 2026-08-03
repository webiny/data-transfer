---
name: v5-to-v6-ddb
description: Full Webiny v5 → v6 migration of the primary DynamoDB table (CMS, File Manager, Security, Mailer, Folders, Audit Logs).
category: Presets
---

# v5-to-v6-ddb

**Use when:** migrating a Webiny v5 project's primary DynamoDB table to v6. This is the flagship preset — it applies all the domain-specific reshaping v6 requires (CMS entry/model shape changes, security groups→roles, file manager settings, mailer settings, folder permissions, audit logs) in one pass. Run `v5-to-v6-os` afterward if the project also has an OpenSearch companion table.

**What it does:**

- Scans the primary DynamoDB table via `DdbScanner`; runs 15 first-match-wins pipelines over it (registration order below — order is load-bearing because several record shapes overlap, e.g. File Manager files and Form Builder forms are also CMS entries).
- Blackholes (drops) migration-tracking records, ACO search cache records, background tasks, and Form Builder records (no v6 migration path yet for Form Builder).
- Audit logs are blackholed only if `target.auditLog.dynamodb.tableName` is not configured; otherwise they're transformed and written to the configured audit log table.
- Reshapes CMS groups, CMS models, CMS entries, File Manager settings/files, mailer settings, security groups (→ roles) and teams, and folder permissions (FLP records) into their v6 storage format.
- Copies admin user records verbatim (no transformer, still passes through the catch-all `DdbProcessor.onEnd` put).

**Pipelines registered** (in registration order — first match wins):

| # | Pipeline               | Scanner + Processors                             | Filter                                                          | Notes |
| - | ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------- | ----- |
| 1 | `MigrationRecords`     | `DdbScanner` + `[DdbProcessor]`                    | `isMigrationRecord`                                              | `.blackhole()` — always dropped |
| 2 | `AuditLogs`            | `DdbScanner` + `[AuditLogProcessor]`               | `isAuditLogEntry`                                                | Must run before `AcoSearchRecordsPage`/`CmsEntries` (shares the `acoSearchRecord` modelId prefix). `.blackhole()` conditionally — only when `target.auditLog?.dynamodb?.tableName` is unset |
| 3 | `AcoSearchRecordsPage` | `DdbScanner` + `[DdbProcessor]`                    | `isAcoSearchRecord`                                              | `.blackhole()` — always dropped |
| 4 | `ContentModelGroups`   | `DdbScanner` + `[DdbProcessor]`                    | `isCmsGroup`                                                     | |
| 5 | `BackgroundTasks`      | `DdbScanner` + `[DdbProcessor]`                    | `isBackgroundTask`                                               | `.blackhole()` — always dropped |
| 6 | `FileManagerSettings`  | `DdbScanner` + `[DdbProcessor]`                    | `byType("fm.settings")`                                          | |
| 7 | `FileManagerFiles`     | `DdbScanner` + `[DdbProcessor, S3Processor]`       | `isFmFile`                                                       | Must run before `CmsEntries` (fm files are also CMS entries) |
| 8 | `MailerSettings`       | `DdbScanner` + `[DdbProcessor]`                    | inline: `record.SK === "L" && record.modelId === "mailerSettings"` | |
| 9 | `SecurityGroups`       | `DdbScanner` + `[DdbProcessor]`                    | inline: `record.TYPE === "security.group" && !isBuiltInSecurityRole(record)` | |
| 10 | `SecurityTeams`       | `DdbScanner` + `[DdbProcessor]`                    | `isSecurityTeam`                                                 | |
| 11 | `CmsModels`           | `DdbScanner` + `[DdbProcessor]`                    | `isCmsModel`                                                     | |
| 12 | `FolderPermissions`   | `DdbScanner` + `[DdbProcessor]`                    | `isFlpRecord`                                                    | |
| 13 | `CmsEntries`          | `DdbScanner` + `[DdbProcessor]`                    | `isCmsEntry`                                                     | Catch-all for remaining CMS entries; must run after `FileManagerFiles` |
| 14 | `AdminUsers`          | `DdbScanner` + `[DdbProcessor]`                    | `isAdminUser`                                                    | No transformers — verbatim copy |
| 15 | `FormBuilderRecords`  | `DdbScanner` + `[DdbProcessor]`                    | `isFormBuilderRecord`                                            | `.blackhole()` — no v6 migration path yet; must run after `CmsEntries` (FB forms are CMS entries and would otherwise be claimed there) |

**Transformers applied** (in pipeline order):

- `AuditLogs`: `coreFieldsTransformer` → `dataFieldsTransformer` → `storageShapeTransformer` (the `auditLogTransformers` bundle)
- `ContentModelGroups`: `wrapInData` → `addGsiTenant` → `removeLocale` → `removeAttributes`
- `FileManagerSettings`: `wrapInData` → `migrateFileManagerSettings` → `removeAttributes`
- `FileManagerFiles`: `cmsEntryTransformers` bundle (`wrapInData` → `addGsiTenant` → `removeLocale` → `fixCmePk` → `fixBrokenStorageKeys` → `transformRichText` → `updateModelIds` → `removeFolderRevision` → `removeAttributes`) → `createMetadata` → `extractImageMetadata`
- `MailerSettings`: `wrapInData` → `migrateMailerSettings` → `removeAttributes`
- `SecurityGroups`: `wrapInData` → `addGsiTenant` → `groupsToRoles` → `transformPermissions` → `removeAttributes`
- `SecurityTeams`: `wrapInData` → `addGsiTenant` → `removeAttributes`
- `CmsModels`: `wrapInData` → `addGsiTenant` → `removeLocale` → `transformModelGroup` → `renameFieldAttributes` → `removeAttributes`
- `FolderPermissions`: `wrapInData` → `addGsiTenant` → `removeLocale` → `removeAttributes` → `updateFlpIds`
- `CmsEntries`: `cmsEntryTransformers` bundle → `addLiveField` → `replaceFileUrls(config)`
- `AdminUsers`: none — pure copy
- Blackholed pipelines (`MigrationRecords`, `AcoSearchRecordsPage`, `BackgroundTasks`, `FormBuilderRecords`, conditionally `AuditLogs`): no transformers run against their output because everything they emit is discarded, but filters still evaluate.

**Example usage in a custom preset:**

Extend or override one pipeline from this preset rather than rewriting all 15 — e.g. add a project-specific transformer to the CMS entries catch-all:

```typescript
import {
  createTransferPreset,
  DdbScanner,
  DdbProcessor,
  createFilter,
  isCmsEntry,
  cmsEntryTransformers, // not currently a public export — copy the chain manually if unavailable
  addLiveField,
  replaceFileUrls
} from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

export default createTransferPreset({
  name: "my-v5-to-v6-ddb",
  description: "v5-to-v6-ddb plus a custom stamp on every CMS entry.",
  configure({ runner, pipelineBuilderFactory, container }) {
    const cmsEntries = pipelineBuilderFactory
      .create({ name: "CmsEntries", scanner: DdbScanner, processors: [DdbProcessor] })
      .filter(createFilter(isCmsEntry))
      .use(cmsEntryTransformers)
      .use(addLiveField)
      .use(replaceFileUrls(container.resolve(/* MigrationConfig */)))
      .use(stampMigratedAt)
      .build();

    runner.register(cmsEntries);
    // ...register the remaining 14 pipelines from this preset, in the same order,
    // or use PipelineCustomizer to patch the built-in preset instead of copying it.
  }
});
```

In practice, prefer `PipelineCustomizer` (see `pipeline-customizer.md`) to patch a single pipeline of this built-in preset instead of re-registering all 15 by hand.
