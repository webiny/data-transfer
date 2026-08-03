---
name: publicApi
description: Every export from src/index.ts, organized by category, with import path, value-vs-type marker, and a one-line description for each.
category: Guides
---

# Public API surface

Everything a config/preset/transformer author can import from `@webiny/data-transfer` is re-exported from one file: `src/index.ts`. This is a complete inventory — every export, in file order within each category, marked **value** (importable without `type`, usable at runtime) or **type** (erased at compile time; import with `import type` or inline `type` specifiers).

Rule of thumb from `AGENTS.md`: anything added here must be something a user writing their own config/transformers/presets genuinely needs — domain-specific migration transformers stay internal.

## Config & Env

```typescript
import {
  createConfig, migrationConfigSchema, loadEnv, fromEnv, numberFromEnv,
  initDataTransfer, findPackageRoot, MigrationConfig
} from "@webiny/data-transfer";
import type { MigrationConfiguration, InitDataTransferContext } from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `createConfig` | value | Validates a config object against `unifiedTransferInputSchema` (Zod) and returns the parsed `MigrationConfiguration`. The one function every `config.ts` calls and default-exports. |
| `migrationConfigSchema` | value | The raw Zod schema `createConfig` validates against — for advanced users who want to validate/parse config data themselves without going through `createConfig`. |
| `MigrationConfiguration` | type | The parsed, validated shape `createConfig(...)` returns (and `MigrationConfig`'s DI token resolves to). |
| `loadEnv` | value | `loadEnv(import.meta.url)` loads the `.env` file sitting next to the calling config file, so env vars are available before `fromEnv`/`numberFromEnv` read them. |
| `fromEnv` | value | Reads a required (or defaulted, or nullable) env var as a string; throws a descriptive error on a missing/empty required var instead of silently producing `undefined`. |
| `numberFromEnv` | value | Same as `fromEnv` but parses to `number`; throws if the raw value isn't a valid number (catches typos like `SEGMENTS=four`). |
| `initDataTransfer` | value | Typed identity helper for a project's optional `setup.ts` — wraps `(ctx: { container }) => void \| Promise<void>` so the callback gets container typing without a separate import/annotation. |
| `InitDataTransferContext` | type | The `{ container: Container }` shape passed into the `initDataTransfer(...)` callback. |
| `findPackageRoot` | value | Walks up from a directory to locate `@webiny/data-transfer`'s own `package.json` root — works across source, compiled, and installed-via-npm contexts. Used internally by `WorkerSpawner`; exported for advanced tooling that needs the same resolution. |
| `MigrationConfig` | value | DI abstraction token for the **resolved** config. `container.resolve(MigrationConfig)` inside `register`/`configure`/transformer code returns the same `MigrationConfiguration` object `createConfig(...)` produced — read table names, regions, credentials, tuning, etc. at runtime. |

## Credentials

Re-exported directly from `@aws-sdk/credential-providers` (under friendlier names) so config authors don't need that package as a separate dependency:

```typescript
import { fromAwsProfile, fromAwsCredentialChain } from "@webiny/data-transfer";
```

| Export | Kind | Aliases | Description |
| --- | --- | --- | --- |
| `fromAwsProfile` | value | `fromIni` | Reads credentials for a named profile from `~/.aws/credentials`. Best for local dev with multiple accounts — no risk of a stray env var silently hijacking the wrong one. |
| `fromAwsCredentialChain` | value | `fromNodeProviderChain` | The AWS SDK's default resolution chain: env vars → shared credentials file → SSO/web-identity → EC2/ECS IAM role. Best for CI/cloud runs that must work without code changes. |

Both return an `AwsCredentialsProvider` (`() => Promise<AwsResolvedCredentials>`); a literal `{ accessKeyId, secretAccessKey, sessionToken? }` object is also accepted directly by `source.credentials`/`target.credentials` without importing anything.

## Transformer Factories

```typescript
import { createTransformer, createDdbTransformer, createOsTransformer } from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `createTransformer` | value | Generic transformer factory — `createTransformer<TContext>(name, fn)`. Stamps a `transformerName` property onto `fn` for logging; use for `BaseTransformContext`/`DdbCoreTransformContext` transformers or anything the two convenience factories below don't fit. |
| `createDdbTransformer` | value | Same runtime behavior as `createTransformer`, but binds `fn`'s parameter to `DdbTransformContext.Interface` (Base + `DdbProcessor` slice + `S3Processor` slice). Default choice for v5-to-v6 DDB transformers. |
| `createOsTransformer` | value | Same, but binds `fn`'s parameter to `OsTransformContext.Interface<OsScanner.Record>` (Base + `OsProcessor` slice). |

## Built-in Transformers (27)

Ready-made transformers for use in custom presets via `.use(...)`. Source: `src/transformers/**`. Full per-transformer detail (signatures, config args, edge cases) lives under `docs/mcp/transformers/`.

```typescript
import {
  // CMS
  addLiveField, fixBrokenStorageKeys, fixCmePk, removeFolderRevision,
  renameFieldAttributes, replaceFileUrls, transformModelGroup, transformRichText,
  updateModelIds, updateOsIndex,
  // File manager
  copyFileToTarget, createMetadata, extractImageMetadata, migrateFileManagerSettings,
  // Folders
  updateFlpIds,
  // Global
  addGsiTenant, addTransferTimestamp, removeAttributes, removeLocale, wrapInData,
  // Security
  groupsToRoles, removeTenant, transformPermissions,
  // Mailer
  migrateMailerSettings,
  // Audit logs
  coreFieldsTransformer, dataFieldsTransformer, storageShapeTransformer
} from "@webiny/data-transfer";
```

All 27 are **value** exports (plain functions, or factory functions in `replaceFileUrls`'s case — see `writingTransformers.md`).

### CMS (10)

| Export | Description |
| --- | --- |
| `addLiveField` | Computes and attaches the `live` pointer (published revision version) to CMS entry records. |
| `fixBrokenStorageKeys` | Corrects mismatched field storage keys in CMS entry values against the model's declared `storageId`. |
| `fixCmePk` | Removes a duplicated `#CME#CME#` segment from a record's `PK`. |
| `removeFolderRevision` | Strips the `#0001` revision suffix from folder location IDs and cleans up legacy folder location fields. |
| `renameFieldAttributes` | Renames legacy CMS model field attributes (`helpText`, `placeholderText`, `multipleValues`) to their v6 equivalents. |
| `replaceFileUrls` | Factory — `replaceFileUrls(config)` rewrites file-manager URLs embedded in CMS `file`/`rich-text` field values from `fileUrls.source` to `fileUrls.target`. |
| `transformModelGroup` | Resolves a CMS model's group ID reference to its slug string. |
| `transformRichText` | Converts legacy Slate-based rich-text field values into the Lexical state + rendered HTML format. |
| `updateModelIds` | Renames legacy system model IDs (`fmFile`, `acoFolder`, etc.) to their v6 `wby`-prefixed equivalents in keys and `data.modelId`. |
| `updateOsIndex` | Recomputes an OpenSearch record's target index name from its `modelId` and tenant. |

### File Manager (4)

| Export | Description |
| --- | --- |
| `copyFileToTarget` | Emits a verbatim S3 copy for a file-manager record, source key equal to target key. |
| `createMetadata` | Creates a KeyValueStore file-metadata record and copies the underlying S3 object to its new tenant-scoped path. |
| `extractImageMetadata` | Extracts image dimensions, EXIF, and IPTC metadata from raster image files and renames the legacy meta field. |
| `migrateFileManagerSettings` | Converts a legacy File Manager settings record into the v6 KeyValueStore format. |

### Folders (1)

| Export | Description |
| --- | --- |
| `updateFlpIds` | Strips the `#0001` revision suffix from folder-level-page `id` and `parentId` fields. |

### Global (5)

| Export | Description |
| --- | --- |
| `addGsiTenant` | Populates the `GSI_TENANT` attribute from the record's `PK` or `data.tenant`. |
| `addTransferTimestamp` | Stamps every record with the transfer time as `_tt`. |
| `removeAttributes` | Deletes deprecated top-level attributes (currently `webinyVersion`) from the data envelope. |
| `removeLocale` | Strips locale segments (e.g. `#L#en-US#`) from a record's keys and deletes the locale field. |
| `wrapInData` | Wraps all non-reserved top-level attributes of a record into a `data` envelope. |

### Security (3)

| Export | Description |
| --- | --- |
| `groupsToRoles` | Renames security "group" records and their `GROUP`/`GROUPS` key segments to the v6 "role" terminology. |
| `removeTenant` | Deletes the top-level `tenant` attribute from security role records. |
| `transformPermissions` | Migrates security role permissions to v6 shape — drops `content.i18n`, flattens per-locale model lists, and resolves group IDs to slugs. |

### Mailer (1)

| Export | Description |
| --- | --- |
| `migrateMailerSettings` | Converts a legacy Mailer settings record into the v6 KeyValueStore format. |

### Audit Logs (3)

| Export | Description |
| --- | --- |
| `coreFieldsTransformer` | Resolves an audit-log record's creator identity and creation time, and stamps a fresh id and TTL expiry. |
| `dataFieldsTransformer` | Lifts audit-log content fields (`app`, `action`, `message`, `entity`, `tags`, `content`) out of the legacy `values` envelope onto the record root. |
| `storageShapeTransformer` | Builds the final v6 audit-log storage record — nine GSI key sets plus the data envelope and TTL expiry. |

## Filters (18 predicates + `createFilter`)

```typescript
import {
  createFilter,
  byType, byTypePrefix, isCmsGroup, isCmsModel, isCmsEntry, byIncludesModelId,
  isAcoSearchRecord, isAdminUser, isBackgroundTask, isFmFile, isFlpRecord,
  isBuiltInSecurityRole, isSecurityTeam, isOsBackgroundTask, isOsMailerSettings,
  isAuditLogEntry, isMigrationRecord, isFormBuilderRecord
} from "@webiny/data-transfer";
import type { Filter } from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `createFilter` | value | Wraps any predicate (sync or async) into the `{ kind: "filter", check }` shape a pipeline builder's `.filter(...)` expects. |
| `Filter` | type | `{ readonly kind: "filter"; readonly check: (record: TRecord) => boolean \| Promise<boolean> }` — the shape `createFilter` produces. |
| `byType` | value | Factory — `byType(type)` matches `record.TYPE === type` exactly. |
| `byTypePrefix` | value | Factory — `byTypePrefix(prefix)` matches when `record.TYPE` starts with `prefix`. |
| `isCmsGroup` | value | Matches `TYPE === "cms.group"` or `PK` including `"#CMS#CMG"`. |
| `isCmsModel` | value | Alias for `byType("cms.model")`. |
| `isCmsEntry` | value | Matches CMS entries by `TYPE` prefix `"cms.entry"` or `PK` including `"#CMS#CME#"`, regardless of raw-vs-reshaped record form. |
| `byIncludesModelId` | value | Factory — `byIncludesModelId(target)` matches when `record.index`/`record.modelId` (also checked under `record.data`) contains `target`, case-insensitive. |
| `isAcoSearchRecord` | value | Alias for `byIncludesModelId("acoSearchRecord")`. |
| `isAdminUser` | value | Matches full-access admin user records (`PK` includes `"#SECURITY#USER#"` and `GSI1_PK === "securityRole#full-access"`). |
| `isBackgroundTask` | value | Matches DDB-side background task records (`modelId`/`GSI1_PK` referencing `webinyTask`/`webinyTaskLog`). |
| `isFmFile` | value | Matches File Manager file records (`modelId` `"fmFile"` or `"wbyFmFile"`, top-level or under `data`). |
| `isFlpRecord` | value | Matches folder location permission records (`PK` includes `"#FLP#"`). |
| `isBuiltInSecurityRole` | value | Matches the two built-in security roles (`slug`/`GSI1_SK` is `"full-access"` or `"anonymous"`) — use to exclude these from a custom roles filter. |
| `isSecurityTeam` | value | Alias for `byType("security.team")`. |
| `isOsBackgroundTask` | value | OS-side equivalent of `isBackgroundTask`, reading from the decompressed `data` payload. |
| `isOsMailerSettings` | value | Matches `record.data.modelId === "mailerSettings"` on OS-table records. |
| `isAuditLogEntry` | value | Matches audit log entries (`modelId` lowercases to `"acosearchrecord-auditlogs"` and `SK === "L"`) — must be filtered for **before** `isAcoSearchRecord`/`isCmsEntry` since they share a `modelId` prefix. |
| `isMigrationRecord` | value | Matches v5 migration-tracking records (`PK` starts with `"MIGRATION"`); typically blackholed. |
| `isFormBuilderRecord` | value | Matches Form Builder forms and submissions (`PK` includes `"#FB#"`, or `TYPE` prefixed `"fb.form."`/`"fb.formSubmission"`); no v6 migration path yet. |

## Scanners

```typescript
import { DdbScanner, OsScanner } from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `DdbScanner` | value | Scans every item in the source DynamoDB table, segment by segment, yielding raw `BaseRecord` items with no transformation. |
| `OsScanner` | value | Scans the source OpenSearch companion DynamoDB table, decompressing each record's gzip `data` payload; yields `{ index, data, ...BaseRecord }`. Only registered when `config.target.opensearch != null`. |

## Processors

```typescript
import { DdbProcessor, S3Processor, AuditLogProcessor, OsProcessor, Processor } from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `DdbProcessor` | value | Writes scanned/transformed records to the target DynamoDB table; auto-`putRecord`s in `onEnd` (zero-transformer copy behavior). |
| `S3Processor` | value | Copies S3 objects (source → target bucket) queued via `ctx.copyFile(...)`; no `onEnd` — never writes anything unless a transformer explicitly asks. |
| `AuditLogProcessor` | value | Writes audit-log entries to a dedicated target table, gated on both a configured `target.auditLog` table and `record.TYPE === "auditLog.log"`. |
| `OsProcessor` | value | Writes records to the target OS companion table, gzip-compressing `data` and managing target-index lifecycle (create / disable-refresh); auto-`putRecord`s in `onEnd`. |
| `Processor` | value | Base DI abstraction token every processor implementation shares. Reach for this when declaring a custom processor via `Processor.createImplementation({...})`; its namespace also carries the `Processor.Interface<TContext, TSlice>`, `Processor.Context`, and `Processor.SliceOf<P>` **types** used when typing a custom implementation. |

## Service Clients

DI abstractions for direct AWS access — resolve from `container` (e.g. inside `config.register` or a preset's `configure`) for pre-flight checks or custom side-effect code outside the transformer/processor pipeline.

```typescript
import {
  SourceDynamoDbClient, TargetDynamoDbClient, OpenSearchClient, SourceS3Client, TargetS3Client
} from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `SourceDynamoDbClient` | value | DI token for the source DynamoDB client (`scan`/`query`/`get`, no writes) — bound to `source.region`/`source.credentials`. |
| `TargetDynamoDbClient` | value | DI token for the target DynamoDB client (adds `batchWrite`) — bound to `target.region`/`target.credentials`. |
| `OpenSearchClient` | value | DI token for the OpenSearch client used for index lifecycle (`indexExists`, `createIndex`, `listIndexes`, `putIndexSettings`, `getIndexSettings`) — bound to `target.opensearch.endpoint`. |
| `SourceS3Client` | value | DI token for the source S3 client (`getObject`) — bound to `source.s3.bucket`/`source.region`. |
| `TargetS3Client` | value | DI token for the target S3 client (`copy`, `batchCopy`, `getObject`) — bound to `target.s3.bucket`/`target.region`. `copy`/`batchCopy` run with **target** credentials even when copying from the source bucket (cross-account implications — see `configReference.md`). |

## Context Types

Types used to annotate custom transformer functions. Import with `import type`. See `writingTransformers.md` for the full base-context API and processor-slice reference.

```typescript
import type {
  BaseTransformContext, DdbCoreTransformContext, DdbTransformContext, OsTransformContext, Transformer
} from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `BaseTransformContext` | type | The context every transformer gets regardless of pipeline processors: `record`, `original`, `modelProvider`, `cache`, `logger`, `compressionHandler`, `replace()`, `addCommand()`, `blackhole()`, `isBlackholed`. |
| `DdbCoreTransformContext` | type | `BaseTransformContext` + `DdbProcessor` slice (`putRecord`, `querySourceRecord`, `queryTargetRecord`) — no S3 helpers. For pipelines registering `DdbProcessor` only. |
| `DdbTransformContext` | type | `BaseTransformContext` + `DdbProcessor` slice + `S3Processor` slice (`copyFile`, `getFile`). Default context for v5-to-v6 DDB transformers; requires `processors: [DdbProcessor, S3Processor]`. |
| `OsTransformContext` | type | `BaseTransformContext` + `OsProcessor` slice. For OS-mode pipelines registering `OsProcessor`. |
| `Transformer` | type | `Transformer.Interface<TContext> = (ctx: TContext) => void \| Promise<void>` — the function shape every transformer (built-in or custom) satisfies. |

## Lifecycle Hooks

DI abstractions registered via `config.register`; all four use `{ multiple: true }`, so registering one **adds** to the list rather than replacing a default. See `configReference.md` and `pipelineRuntime.md` for exactly when each runs.

```typescript
import {
  BeforeTransferHook, AfterTransferHook, BeforeLoadPresetHook, AfterLoadPresetHook
} from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `BeforeTransferHook` | value | `{ execute(): Promise<void> }` — runs once in the orchestrator process, before any worker is spawned. |
| `AfterTransferHook` | value | `{ execute(): Promise<void> }` — runs once in the orchestrator process, after all workers finish (best-effort; a thrown error here is logged, not fatal). |
| `BeforeLoadPresetHook` | value | `{ execute(config): Promise<void> }` — runs once per **worker** process, before the preset is loaded/`configure()`d. |
| `AfterLoadPresetHook` | value | `{ execute(config, preset): Promise<void> }` — runs once per worker process, after `preset.configure(...)` completes. |

## Customization

Extension points for advanced config authors — override via `config.register`.

```typescript
import { IndexConfigurationProvider, ModelProvider, PipelineCustomizer } from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `IndexConfigurationProvider` | value | DI abstraction — override `getConfiguration(indexName, base)` to customize OpenSearch index mappings/settings per index before `OsProcessor` creates/updates it. |
| `ModelProvider` | value | DI abstraction — override `preloadModels`/`getModel`/`getModelIds` to customize how CMS model definitions are loaded (default: DB + `pipeline.modelsDir` JSON files). |
| `PipelineCustomizer` | value | DI abstraction — implement `{ name, canUse(pipelineName), configure(builder) }` to extend a built-in preset's pipeline (by name) from `setup.ts`/`config.register` without re-registering the whole preset. See `pipeline-customizer.md`. |

## Presets & Pipeline Construction

Core building blocks for writing a custom preset file. See `writingPresets.md` for the full walkthrough.

```typescript
import { createTransferPreset } from "@webiny/data-transfer";
import type { MigrationPreset, PresetConfigureContext, NonEmptyArray } from "@webiny/data-transfer";
```

| Export | Kind | Description |
| --- | --- | --- |
| `createTransferPreset` | value | Identity function — `createTransferPreset(preset)` returns `preset` unchanged; exists purely so a preset file's `configure({...})` gets typed inference without a separate `MigrationPreset` annotation. |
| `MigrationPreset` | type | The shape a preset file's `default` export must satisfy: `{ name: string; description: string; configure(ctx): void \| Promise<void> }`. |
| `PresetConfigureContext` | type | The `{ runner, pipelineBuilderFactory, container }` argument bag passed to `configure(...)`. |
| `NonEmptyArray` | type | Tuple-length helper used to type `pipelineBuilderFactory.create({ processors })` — enforces at compile time that `processors` has at least one element. |

Not (yet) exported from the package root: the base `Hook` abstraction that `.beforeExecuteCommands()`/`.afterExecuteCommands()` are typed against — see the caveat in `writingPresets.md` and `pipelineRuntime.md`.
