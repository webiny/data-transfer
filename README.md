# `@webiny/data-transfer`

A generic data-transfer tool for Webiny environments. Copies DynamoDB + S3 (or OpenSearch) records between AWS accounts, optionally running a transformer chain on each record.

**Use cases:**

- **v5 → v6 migration** — write a preset that registers the relevant pipelines.
- **Prod → dev seeding** — zero transformers, just copy.
- **Custom transfers** — write your own transformers + pipelines + preset for bespoke data moves.

The package ships five built-in presets (`v5-to-v6-ddb`, `v5-to-v6-os`, `copy-ddb`, `copy-os`, `copy-files`) plus full authoring support for your own.

## Quick start

```bash
git clone git@github.com:webiny/data-transfer.git
cd data-transfer
yarn install
yarn transfer
```

`yarn transfer` (no `--config`) launches the **guided setup wizard**. It walks you through:

1. Selecting (or creating) a project folder under `projects/`
2. Collecting your Webiny output or Pulumi state JSON files and writing `.env`
3. Selecting a preset and optional dry-run mode, then starting the transfer

**First run (no `.env` yet):** the wizard extracts values from your JSON files, writes `.env`, and exits so you can review it before anything runs. Run `yarn transfer` again to continue.

**Subsequent runs (`.env` exists, no JSON files):** the wizard skips env setup entirely and goes straight to preset selection.

**`.env` exists AND JSON files present:** the wizard asks whether to repopulate `.env` from the JSON files or keep the existing values. Choose "repopulate" to refresh after deploying a new environment; choose "use existing" to skip to preset selection.

**Account ID warning:** the wizard extracts the AWS account ID from `primaryDynamodbTableArn` in the JSON files. If source and target accounts differ, it warns you to set `SOURCE_PROFILE` and `TARGET_PROFILE` in `.env` so the right credentials are used for each side.

**Preset selection:** each preset is listed with its one-line description (`v5-to-v6-ddb — Full DDB migration`). User-supplied presets in `presetsDir` appear alongside built-ins.

**Dry-run mode:** after selecting a preset the wizard asks "Dry run?" (default: No). In dry-run mode the tool scans and transforms records normally but skips all writes to the target (DynamoDB, S3, OpenSearch). Useful for validating your pipeline and transformer chain before committing a full transfer.

New project folders are **gitignored** by default — credentials and env files stay local. Only `projects/v5-to-v6/` is committed as the reference example.

### Populating your .env

The wizard needs output files from your source and target Webiny systems. Place them in `projects/<name>/` before running `yarn transfer`:

**Option A — Webiny CLI output (recommended):**

```bash
# In your source Webiny project:
yarn webiny output core --json > source.webiny.json
# In your target Webiny project:
yarn webiny output core --json > target.webiny.json
```

**Option B — Pulumi state file (when you don't have Webiny CLI access):**

```bash
# Copy from: .pulumi/apps/core/.pulumi/stacks/core/<env>.json
cp /path/to/source-project/state.json projects/<name>/source.pulumi.json
cp /path/to/target-project/state.json projects/<name>/target.pulumi.json
```

Mixed formats are allowed (e.g. `source.webiny.json` + `target.pulumi.json`).

**CMS model exports (optional):** drop your exported model definitions into `projects/<name>/models/`. Export them from the Webiny Admin CMS → Models → Export, then copy the file there. See [`modelsDir`](#modelsdir) for accepted formats.

## Config reference

One `config.ts` file covers all storage types. DynamoDB and S3 are required; OpenSearch is optional — omit or set to `null` if your environment doesn't use it. The preset you select at runtime determines which storage operations actually run.

```typescript
import {
  loadEnv,
  createConfig,
  fromAwsProfile,
  fromEnv,
  numberFromEnv
} from "@webiny/data-transfer";

loadEnv(import.meta.url);

export default createConfig({
  source: {
    region: fromEnv("SOURCE_REGION", "eu-central-1"),
    credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
    dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
    s3: { bucket: fromEnv("SOURCE_S3_BUCKET") },
    // Remove or set to null if your source has no OpenSearch:
    opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") }
  },
  target: {
    region: fromEnv("TARGET_REGION", "eu-central-1"),
    credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
    dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
    s3: { bucket: fromEnv("TARGET_S3_BUCKET") },
    // Set tableName to null or omit the block to skip the audit log:
    auditLog: { dynamodb: { tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE") } },
    // Remove or set to null if your target has no OpenSearch:
    opensearch: {
      endpoint: fromEnv("TARGET_OS_ENDPOINT"),
      tableName: fromEnv("TARGET_OS_TABLE"),
      service: "opensearch", // or "opensearch-serverless"
      indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
    }
  },
  pipeline: {
    segments: numberFromEnv("SEGMENTS", 4),
    modelsDir: fromEnv("MODELS_DIR", "./models"),
    // Optional: point at your own preset files (alongside built-ins):
    presetsDir: "./presets"
  }
});
```

`loadEnv(import.meta.url)` loads the `.env` file sitting next to this config file. Each project folder should have its own `.env` so credentials stay isolated between projects.

**Index management** (OpenSearch): the tool disables `refresh_interval` just-in-time when it first writes to each index, and restores the original value after the transfer completes. Missing indexes are created with the Webiny base mapping. Only touched indexes are affected.

### Env helpers

- **`fromEnv(name)`** — required string; throws if unset or empty (empty string counts as missing).
- **`fromEnv(name, default)`** — falls back to `default` when unset.
- **`fromEnv(name, null)`** — returns `string | null`; returns `null` (instead of throwing) when unset. Use for optional config sections (e.g. `fromEnv("SOURCE_OS_TABLE", null)`).
- **`numberFromEnv(name, default?)`** — typed numeric; throws on parse failure (`SEGMENTS=four` fails immediately with a named error).

### Credentials

Three shapes accepted on both `source.credentials` and `target.credentials`:

- **`fromAwsProfile({ profile })`** — reads `~/.aws/credentials`. Explicit about which profile. Best for local dev with multiple accounts — no risk of a stray `AWS_ACCESS_KEY_ID` silently hijacking the wrong account.
- **`fromAwsCredentialChain()`** — the AWS SDK default chain: env vars → shared credentials file → SSO → EC2/ECS IAM. Best for CI / cloud runs.
- **Literal `{ accessKeyId, secretAccessKey, sessionToken? }`** — explicit strings for temporary STS credentials.

```typescript
import { fromAwsProfile, fromAwsCredentialChain } from "@webiny/data-transfer";

credentials: fromAwsProfile({ profile: "prod-reader" })
// or
credentials: fromAwsCredentialChain()
// or
credentials: { accessKeyId: "...", secretAccessKey: "..." }
```

### Required IAM permissions

The tool runs a pre-flight access check before any data moves. If permissions are missing it reports exactly which check failed and what to fix. The table below lists the minimum IAM actions each credential set must have.

**Source credentials:**

| Service  | Actions                                                     | Resource                                        |
| -------- | ----------------------------------------------------------- | ----------------------------------------------- |
| DynamoDB | `dynamodb:Scan`, `dynamodb:Query`, `dynamodb:DescribeTable` | Source primary table                            |
| S3       | `s3:GetObject`, `s3:ListBucket`                             | Source bucket (`arn:aws:s3:::<bucket>` + `/*`)  |
| DynamoDB | `dynamodb:Scan`, `dynamodb:Query`, `dynamodb:DescribeTable` | Source OS companion table (if using OpenSearch) |

**Target credentials:**

| Service    | Actions                                                               | Resource                                                          |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| DynamoDB   | `dynamodb:BatchWriteItem`, `dynamodb:Query`, `dynamodb:DescribeTable` | Target primary table                                              |
| S3         | `s3:PutObject`, `s3:ListBucket`                                       | Target bucket (`arn:aws:s3:::<bucket>` + `/*`)                    |
| S3         | `s3:GetObject` on the **source** bucket                               | Source bucket (`arn:aws:s3:::<source-bucket>/*`) — see note below |
| DynamoDB   | `dynamodb:BatchWriteItem`, `dynamodb:Query`, `dynamodb:DescribeTable` | Target OS companion table (if using OpenSearch)                   |
| OpenSearch | `es:ESHttpGet`, `es:ESHttpPut`, `es:ESHttpPost`                       | Target OpenSearch domain (if using OpenSearch)                    |
| DynamoDB   | `dynamodb:BatchWriteItem`, `dynamodb:DescribeTable`                   | Target audit log table (if configured)                            |

**S3 cross-account access (important):** `CopyObjectCommand` runs with **target credentials**. When source and target are in different AWS accounts, the target account must be able to read from the source bucket. Either:

1. Add a **bucket policy** on the source bucket granting `s3:GetObject` to the target account, or
2. Use a **cross-account IAM role** that the target credentials can assume with read access to the source bucket.

Without this, S3 file copies will fail with `AccessDenied`. The wizard warns you when it detects different account IDs; the pre-flight access check verifies that the target credentials can actually reach the source bucket.

**Pre-flight access checks:** the tool verifies access before any data moves. S3 buckets are checked with `HeadBucket` (requires `s3:ListBucket` at the bucket level), DynamoDB tables with `DescribeTable`. If any check fails, the run aborts with a clear message showing which resource and credential set failed.

### `modelsDir`

Required by the OS preset and by rich-text / field-key transformers. Point at a directory of exported CMS model definitions. Three JSON shapes are accepted and can be mixed in the same directory:

```
models/
  single-model.json      # { "modelId": "...", "fields": [...], ... }
  array-of-models.json   # [{ "modelId": "...", "fields": [...] }, ...]
  webiny-export.json     # { "groups": [...], "models": [...] }  ← Webiny admin export
```

JSON models override DB-loaded models when both exist.

### Tuning (optional)

```typescript
tuning: {
  flushEvery: numberFromEnv("FLUSH_EVERY", 500), // records per shard flush — bounds peak memory
  ddb: { maxRetries: 3, initialBackoffMs: 100, requestTimeoutMs: 5000 },
  s3:  { concurrency: 10, maxRetries: 3, initialBackoffMs: 100, requestTimeoutMs: 10000 },
  os:  { maxRetries: 3, retryScheduleMs: [5000, 10000, 20000], gzipConcurrency: 16 }
}
```

All fields are optional; absent = built-in defaults. `BATCH_SIZE` for DynamoDB is NOT tunable (AWS enforces 25 items per `BatchWriteItem`). DDB and S3 clients run in AWS SDK `adaptive` retry mode — `tuning.{ddb,s3}.maxRetries` caps the outer retry envelope on top of the SDK's own self-tuning backoff.

**`tuning.flushEvery`** controls how often accumulated write commands are flushed during a shard scan. The runner calls `processor.execute()` every N records and resets the buffer, so peak memory stays at `flushEvery × avg_record_size` regardless of table size. Default 500 (≈ 5 MB at a 10 KB average). Lower to 100 for tables with very large records.

### Debug options

Add a `debug` block to your config to opt into diagnostics:

```typescript
debug: {
  logLevel: "debug",  // "debug" | "info" | "warn" | "error" (default "info"); also overridable via --log-level CLI flag
  snapshot: true,     // or: { dir: "./my-snapshot", compress: false }
  logFile: true       // or: "./my-transfer.log"
}
```

**`debug.snapshot`** dumps every record the pipeline touches to local JSONL files:

```
.transfer/<runId>/
├── snapshot/
│   ├── <pipelineName>/
│   │   ├── segment-0.source.jsonl.gz         ← post-filter, pre-transform
│   │   ├── segment-0.post-transform.jsonl.gz ← after the whole transformer chain
│   │   └── segment-0.commands.jsonl.gz       ← PutRecord + S3Copy + etc.
│   └── dropped/
│       └── segment-0.jsonl.gz                ← records matching no pipeline
├── segment-0-blackholed.log
└── segment-0-unmatched.log
```

Inspect with `zcat` + `jq`:

```bash
zcat .transfer/<runId>/snapshot/cmsEntries/segment-0.source.jsonl.gz | jq 'select(.PK=="T#tenant#CME#abc")'
```

Set `compress: false` to `grep` directly without `zcat`. Snapshot is best-effort — write errors log `warn` but never abort the transfer.

**`debug.logFile`** captures the full runner log to disk. `true` → each process writes to `.transfer/<runId>/logs/<orchestrator|segment-N>.log` (one file per process, no interleaving under parallelism). String → all processes write to that path. Content is raw pino JSONL:

```bash
cat .transfer/<runId>/logs/*.log | pino-pretty
```

---

## Writing a preset

A preset is the bridge between your config file and the DI container. It tells the runner which pipelines to register, which scanners + processors to use, and which transformers + filters to apply.

### Preset shape

A preset is an object with `{ name, description, configure }` exported as `default`. Use `createTransferPreset` for typed inference:

```typescript
import {
  createTransferPreset,
  DdbScanner,
  DdbProcessor,
  S3Processor,
  createFilter
} from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

export default createTransferPreset({
  name: "my-preset",
  description: "One-line description shown in CLI output.",
  configure({ runner, pipelineBuilderFactory }) {
    const pipeline = pipelineBuilderFactory
      .create({ name: "my-pipeline", scanner: DdbScanner, processors: [DdbProcessor, S3Processor] })
      .filter(createFilter(r => r.TYPE === "cms.entry"))
      .use(stampMigratedAt)
      .build();

    runner.register(pipeline);
  }
});
```

Drop the file in your `projects/<name>/presets/` directory. The wizard will offer it by name alongside built-ins.

### `pipelineBuilderFactory.create({ name, scanner, processors })`

- **`name`** — unique string; the runner throws on duplicate names.
- **`scanner`** — `DdbScanner` or `OsScanner`. Determines which table is scanned and what `TRecord` shape flows through the chain.
- **`processors`** — `NonEmptyArray` of processor classes. Each processor contributes a **slice** of helpers onto the transformer context (see [Processor slices](#processor-slices) below). TS rejects empty arrays and processors whose slice keys collide (e.g. `DdbProcessor` + `OsProcessor` both contribute `putRecord`).

### Builder methods

| Method                         | Description                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.filter(f)`                   | Add a filter. Multiple calls AND-compose in evaluation order. Records that fail any filter are skipped.                                                                                                 |
| `.use(t)`                      | Add a transformer. Execution order matches registration order.                                                                                                                                          |
| `.blackhole()`                 | Observe-only mode — filters + transformers + `onEnd` still run but every emitted command is discarded. Nothing lands in the target. Pair with `debug.snapshot` to inspect what WOULD have been written. |
| `.beforeExecuteCommands(hook)` | Run a hook once per merge group before any shard runs.                                                                                                                                                  |
| `.afterExecuteCommands(hook)`  | Run a hook once after all shards in the merge group succeed. Skipped on shard failure.                                                                                                                  |
| `.build()`                     | Snapshot into an immutable `Pipeline`. Required before `runner.register()`.                                                                                                                             |

`runner.register(p1, p2, ...)` is variadic and chainable.

### Filters

`createFilter` wraps a predicate into a typed `Filter`. Write one inline or use a built-in predicate:

```typescript
import {
  createFilter,
  isFmFile,
  isCmsEntry,
  byType,
  byIncludesModelId
} from "@webiny/data-transfer";

// Built-in predicates — handle both raw v5 and post-wrapInData record shapes
.filter(createFilter(isFmFile))                           // file manager files
.filter(createFilter(isCmsEntry))                         // any CMS entry
.filter(createFilter(byType("cms.model")))                // exact TYPE match
.filter(createFilter(byIncludesModelId("article")))       // modelId contains "article"

// Inline predicate for anything custom
.filter(createFilter(r => r.TYPE === "cms.entry" && r.modelId === "article"))
```

**All built-in filter predicates** (import from `@webiny/data-transfer`):

| Predicate                   | Matches                                            |
| --------------------------- | -------------------------------------------------- |
| `byType(type)`              | `record.TYPE === type`                             |
| `byTypePrefix(prefix)`      | `record.TYPE.startsWith(prefix)`                   |
| `isCmsGroup`                | CMS group records                                  |
| `isCmsModel`                | CMS model records                                  |
| `isCmsEntry`                | CMS entry records                                  |
| `byIncludesModelId(target)` | `modelId` contains `target` (case-insensitive)     |
| `isAcoSearchRecord`         | ACO search records                                 |
| `isBackgroundTask`          | Webiny background task records                     |
| `isFmFile`                  | File manager file records                          |
| `isFlpRecord`               | Folder location permission records                 |
| `isBuiltInSecurityRole`     | Built-in roles (`full-access`, `anonymous`)        |
| `isSecurityTeam`            | Security team records                              |
| `isOsBackgroundTask`        | OS background task records (checks `data.modelId`) |
| `isOsMailerSettings`        | OS mailer settings records                         |
| `isAuditLogEntry`           | Audit log entry records                            |
| `isMigrationRecord`         | Migration tracking records                         |
| `isFormBuilderRecord`       | Form Builder records (forms + submissions)         |

Multiple `.filter()` calls on the same pipeline AND-compose — a record must pass all of them. Register more-specific filters before catch-alls.

### Multiple pipelines and first-match-wins

Pipelines sharing the same scanner run as a **merge group**. Within a group, the first pipeline whose filters all pass "wins" that record — subsequent pipelines skip it. Registration order is semantically significant.

```typescript
configure({ runner, pipelineBuilderFactory }) {
  // High-value entries: custom transformer chain
  const articles = pipelineBuilderFactory
    .create({ name: "articles", scanner: DdbScanner, processors: [DdbProcessor] })
    .filter(createFilter(r => r.TYPE === "cms.entry" && r.modelId === "article"))
    .use(migrateArticle)
    .build();

  // Everything else: verbatim copy
  const rest = pipelineBuilderFactory
    .create({ name: "rest", scanner: DdbScanner, processors: [DdbProcessor] })
    .build();

  runner.register(articles, rest); // order matters: articles checked first
}
```

Records that match no pipeline are dropped (see [Unmatched records](#pipeline-runtime-semantics)).

### Zero-transformer preset (pure data copy)

```typescript
export default createTransferPreset({
  name: "copy",
  description: "Copy every record verbatim.",
  configure({ runner, pipelineBuilderFactory }) {
    const copyAll = pipelineBuilderFactory
      .create({ name: "copy-all", scanner: DdbScanner, processors: [DdbProcessor] })
      .build(); // no .filter → accepts all; no .use → no transformations

    runner.register(copyAll);
  }
});
```

`DdbProcessor.onEnd` emits a `PutRecord` for `ctx.record` at the end of each record — pure-passthrough pipelines still produce writes.

### Built-in presets

Select by name when the wizard asks "Which preset do you want to run?":

- **`"v5-to-v6-ddb"`** — full Webiny v5 → v6 migration of the primary DynamoDB table (CMS entries, file manager, security, mailer, folder permissions, etc.).
- **`"v5-to-v6-os"`** — migration of the OpenSearch companion DynamoDB table. Run **after** `v5-to-v6-ddb`.
- **`"copy-ddb"`** — verbatim DynamoDB + S3 copy (no transformations).
- **`"copy-os"`** — verbatim OpenSearch companion table copy (no transformations).
- **`"copy-files"`** — S3-only file copy.

Custom presets placed in your `presetsDir` are listed alongside built-ins.

---

## Writing transformers

A transformer is a function `(ctx) => void | Promise<void>` that mutates `ctx.record`. Wrap it with a factory for a named identity:

```typescript
import { createDdbTransformer } from "@webiny/data-transfer";
import type { DdbTransformContext } from "@webiny/data-transfer";

export const stampMigratedAt = createDdbTransformer(
  "stampMigratedAt",
  (ctx: DdbTransformContext.Interface) => {
    ctx.record.migratedAt = new Date().toISOString();
  }
);
```

Factory variants:

- **`createTransformer<TContext>(name, fn)`** — generic over any context type.
- **`createDdbTransformer(name, fn)`** — binds `DdbTransformContext.Interface` (Base + DdbProcessor slice + S3Processor slice).
- **`createOsTransformer(name, fn)`** — binds `OsTransformContext.Interface` (Base + OsProcessor slice).

### Context type aliases

Use the narrowest type that covers what your transformer needs:

| Type                                | Processors in pipeline         | When to use                                                                                                        |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `BaseTransformContext.Interface`    | any                            | Transformers that only touch `ctx.record`, `ctx.cache`, `ctx.logger`, etc. — no processor-specific helpers needed. |
| `DdbCoreTransformContext.Interface` | `DdbProcessor` only            | DDB transformers that need `querySourceRecord` / `queryTargetRecord` / `putRecord` but not S3 helpers.             |
| `DdbTransformContext.Interface`     | `DdbProcessor` + `S3Processor` | Default for v5-to-v6 DDB transformers that may call `ctx.copyFile` / `ctx.getFile`.                                |
| `OsTransformContext.Interface`      | `OsProcessor`                  | OS transformers. `ctx.record.data` is the decompressed payload (always present).                                   |

### Base context API

Available on every transformer context regardless of pipeline configuration:

| Member                   | Description                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `ctx.record`             | Mutable record. Transformers mutate this.                                                                           |
| `ctx.original`           | Frozen, deep-cloned pre-transform snapshot. Always present. Use for gate-checks or audit comparisons. Never modify. |
| `ctx.replace(newRecord)` | Replace `ctx.record` wholesale.                                                                                     |
| `ctx.addCommand(cmd)`    | Push a raw command to the command bag. Rarely needed in transformers — processor slice helpers are sugar over this. |
| `ctx.modelProvider`      | Loaded CMS models (from DB + `modelsDir` JSON files if set).                                                        |
| `ctx.cache`              | Shared `Map`-like cache, persists across records within a shard. Useful for deduplication.                          |
| `ctx.logger`             | Logger bound to the current worker. Use instead of `console.*` — respects configured log level.                     |
| `ctx.compressionHandler` | Gzip compression utility. Rarely needed directly.                                                                   |
| `ctx.blackhole()`        | Per-record blackholing — suppresses all writes for this record. Remaining transformers + `onEnd` still run.         |
| `ctx.isBlackholed`       | Read-only flag; `true` after `ctx.blackhole()` is called.                                                           |

### Processor slices

Each processor in the pipeline contributes additional helpers onto the context:

**`DdbProcessor` slice** (`DdbTransformContext`, `DdbCoreTransformContext`):

| Member                              | Description                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `ctx.putRecord(record)`             | Emit an extra `PutRecord` to the DDB target (beyond the auto-put at chain end). |
| `ctx.querySourceRecord<T>(pk, sk?)` | Query the source DDB primary table. Returns `null` if not found.                |
| `ctx.queryTargetRecord<T>(pk, sk?)` | Query the target DDB primary table. Returns `null` if not found.                |

**`S3Processor` slice** (`DdbTransformContext`):

| Member                               | Description                                                   |
| ------------------------------------ | ------------------------------------------------------------- |
| `ctx.copyFile(sourceKey, targetKey)` | Emit an S3 copy command.                                      |
| `ctx.getFile(key)`                   | Read a file from the source bucket. Returns `Buffer \| null`. |

**`OsProcessor` slice** (`OsTransformContext`):

| Member                              | Description                                                 |
| ----------------------------------- | ----------------------------------------------------------- |
| `ctx.putRecord(record)`             | Emit a `PutRecord` to the OS DDB target.                    |
| `ctx.querySourceRecord<T>(pk, sk?)` | Query the source OS DDB table. Returns `null` if not found. |
| `ctx.queryTargetRecord<T>(pk, sk?)` | Query the target OS DDB table. Returns `null` if not found. |

**Auto-put**: `DdbProcessor` and `OsProcessor` include an `onEnd` hook that emits a `PutRecord` for `ctx.record` at chain end. `S3Processor` has no `onEnd` — call `ctx.copyFile(...)` explicitly in your transformers.

### Built-in transformers

Ready-made transformers exported from `@webiny/data-transfer`:

#### `copyFileToTarget`

Emits a verbatim S3 copy for a file record — source key equals target key (`ctx.copyFile(key, key)`). Reads the key from `text@key` and handles both raw v5 and post-`wrapInData` record shapes.

```typescript
import {
  createTransferPreset,
  createFilter,
  isFmFile,
  copyFileToTarget,
  DdbScanner,
  DdbProcessor,
  S3Processor
} from "@webiny/data-transfer";

export default createTransferPreset({
  name: "ddb-verbatim",
  description: "Copy all DDB records verbatim, including S3 file objects.",
  configure({ runner, pipelineBuilderFactory }) {
    // File records: copy DDB record + S3 object
    const files = pipelineBuilderFactory
      .create({ name: "files", scanner: DdbScanner, processors: [DdbProcessor, S3Processor] })
      .filter(createFilter(isFmFile))
      .use(copyFileToTarget)
      .build();

    // Everything else: verbatim DDB copy
    const everything = pipelineBuilderFactory
      .create({ name: "everything", scanner: DdbScanner, processors: [DdbProcessor] })
      .build();

    runner.register(files, everything); // files MUST be registered first (first-match-wins)
  }
});
```

**Requires:** pipeline must include `S3Processor`. **Do not use** when you need a new key path (e.g. the v5→v6 `tenants/<id>/files/<key>` migration) — use the internal `createMetadata` transformer instead.

#### `replaceFileUrls`

Rewrites file-manager URLs in CMS rich-text and long-text fields from the source domain to the target domain. Requires a `fileUrls` block in your config root:

```typescript
export default createConfig({
  // ...source, target, pipeline as usual...
  fileUrls: {
    source: "https://old-cdn.example.com",
    target: "https://new-cdn.example.com"
  }
});
```

```typescript
import { replaceFileUrls } from "@webiny/data-transfer";

// In your preset:
.use(replaceFileUrls)
```

### Built-in processors

| Processor           | Slice helpers                                         | Notes                                                                |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| `DdbProcessor`      | `putRecord`, `querySourceRecord`, `queryTargetRecord` | Primary DDB table. Auto-puts `ctx.record`.                           |
| `S3Processor`       | `copyFile`, `getFile`                                 | S3 bucket. No auto-put; emit S3Copy via `ctx.copyFile`.              |
| `OsProcessor`       | `putRecord`, `querySourceRecord`, `queryTargetRecord` | OS DDB table. Auto-puts. Gzips on write, ensuresIndex.               |
| `AuditLogProcessor` | `putAuditLog`                                         | Writes to the audit log table. No-op when `target.auditLog` is null. |

---

## Custom DI — `setup.ts`

If your preset needs to resolve custom processors, features, or other DI bindings, drop a `setup.ts` next to your transfer config:

```typescript
// projects/my-project/setup.ts
import { initDataTransfer } from "@webiny/data-transfer";
import { MyCustomFeature } from "../../features/MyCustomFeature.ts";

export default initDataTransfer(async ({ container }) => {
  container.register(MyCustomFeature);
});
```

The CLI picks it up automatically and runs it **before** loading your preset, so the preset can `container.resolve(...)` anything you registered. The file is optional — delete it if you don't need custom DI wiring.

`container` is a `@webiny/di` container with all core data-transfer features already wired (scanners, processors, executors, etc.). `initDataTransfer` is a typed helper that validates the export shape.

---

## Extending built-in presets

Need to add a filter or transformer to a built-in preset pipeline without forking it? Use `PipelineCustomizer`. Implement the interface in `setup.ts`, target pipelines by name, and your customizations are appended at build time:

```typescript
// projects/my-project/setup.ts
import {
  initDataTransfer,
  PipelineCustomizer,
  createFilter,
  createDdbTransformer
} from "@webiny/data-transfer";

class SkipUnwantedModels implements PipelineCustomizer.Interface {
  public readonly name = "SkipUnwantedModels";

  public canUse(pipelineName: string): boolean {
    return pipelineName === "CmsEntries";
  }

  public configure(builder: PipelineCustomizer.Builder): void {
    builder.filter(createFilter(record => record.modelId !== "unwantedModel")).use(
      createDdbTransformer("skipExisting", async ctx => {
        const existing = await ctx.queryTargetRecord(ctx.record.PK, ctx.record.SK);
        if (existing.length > 0) {
          ctx.blackhole(); // skip writing this record
        }
      })
    );
  }
}

const SkipUnwantedModelsCustomizer = PipelineCustomizer.createImplementation({
  implementation: SkipUnwantedModels,
  dependencies: []
});

export default initDataTransfer(async ({ container }) => {
  container.register(SkipUnwantedModelsCustomizer);
});
```

- **`canUse(pipelineName)`** — return `true` for any pipeline you want to extend. Can target multiple pipelines.
- **`configure(builder)`** — `.filter()` adds an AND-filter after the preset's filters. `.use()` appends a transformer after the preset's transformers.
- **`ctx.blackhole()`** — per-record blackholing from within a transformer. Remaining transformers and `onEnd` hooks still run, but all commands for this record are discarded.
- **Unmatched warning** — if `canUse()` never matches, a warning is logged using the customizer's `name` property.

For the full guide including available pipeline names per preset, see [`docs/guides/pipeline-customizer.md`](docs/guides/pipeline-customizer.md).

---

## Pipeline runtime semantics

- **Merge groups**: pipelines sharing the same scanner run together, in registration order.
- **First-match-wins**: within a merge group, the first pipeline whose filter(s) pass claims the record. Register more-specific filters before catch-alls.
- **Unmatched records**: if no pipeline accepts a record, it's dropped. The runner emits a `warn` per unmatched record and an `info`-level shard summary: `"unmatched 14 (pb.page.l=4, pb.page=4, T#root#FM#f1:L#v1=2)"`. When TYPE is absent or empty, the key is `PK:SK` instead of a type name. Each worker also writes `segment-N-unmatched.log` to `.transfer/<runId>/`. To transfer every record, add a zero-filter catch-all pipeline last.
- **Hooks**: before-hooks fire once per merge group before any shard; after-hooks fire once after all shards succeed. After-hooks are skipped on shard failure. Each hook receives `{ runId, mergeGroupId }`.
- **Parallelism**: `pipeline.segments` controls the number of parallel scanner segments (shards). Each shard runs in a separate child process.
- **Re-running specific shards**: pass `--segments=1,3` to re-drive only those indices. Workers still receive `--total` from `pipeline.segments`, so each shard scans the exact same slice as a full run. Use after a partial failure to avoid re-scanning the whole table.

---

## Troubleshooting

- **Out-of-memory on large tables** — each worker buffers write commands between flushes. Reduce `tuning.flushEvery` (default 500) to a smaller value (e.g. `FLUSH_EVERY=100`) so each flush covers fewer records and peak memory stays manageable.
- **AWS throttling** — the SDK self-tunes via `retryMode: "adaptive"`. If you still hit the outer cap, bump `tuning.ddb.maxRetries` / `tuning.s3.maxRetries`; lower `tuning.s3.concurrency` for S3-heavy transfers.
- **OS indexes not creating** — the transfer aborts if index prep exhausts retries. Tune `tuning.os.maxRetries` and `tuning.os.retryScheduleMs`, or fix the underlying mapping error surfaced in the logs.
- **Missing env vars** — run `yarn transfer` (no `--config`) to launch the guided setup wizard, which writes your `.env` automatically. Or copy `.env.example` manually and fill it in. Config files use `loadEnv(import.meta.url)` to load the sibling `.env`.
- **Target records look wrong** — `DdbProcessor` and `OsProcessor` auto-put `ctx.record` at chain end. If you call `ctx.putRecord(ctx.record)` manually on top of that, you get a duplicate write. Only call `putRecord` for ADDITIONAL records beyond the one being processed.
- **Unmatched records with no TYPE** — records appear as `PK:SK=N` in the summary instead of a TYPE name. Check the per-record warn lines (`unmatched record — TYPE= PK=... SK=...`) and `segment-N-unmatched.log` to identify what these records are, then decide whether to add a pipeline that handles them or leave them dropped intentionally.
- **S3 `AccessDenied` on file copies** — `CopyObjectCommand` runs with target credentials, so in cross-account scenarios the target account must have `s3:GetObject` on the source bucket. Add a bucket policy on the source bucket granting read to the target account (see [Required IAM permissions](#required-iam-permissions)). The pre-flight access check catches this before the transfer starts — look for the `S3 cross-account read` check in the output.
- **DynamoDB `AccessDeniedException`** — source credentials need `Scan` + `Query` + `DescribeTable` on the source table; target credentials need `BatchWriteItem` + `Query` + `DescribeTable` on the target table. The pre-flight check reports which side failed. For the audit log table, `BatchWriteItem` + `DescribeTable` on the target audit log table is required (or set `target.auditLog` to `null` to skip it).

## License

See `LICENSE`.
