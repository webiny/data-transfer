# `@webiny/data-transfer`

A generic data-transfer tool for Webiny environments. Copies DynamoDB + S3 (or OpenSearch) records between AWS accounts, optionally running a transformer chain on each record.

**Use cases:**

- **v5 → v6 migration** — write a preset that registers the relevant pipelines.
- **Prod → dev seeding** — zero transformers, just copy.
- **Custom transfers** — write your own transformers + pipelines + preset for bespoke data moves.

The package ships two built-in presets (`v5-to-v6-ddb`, `v5-to-v6-os`) plus full authoring support for your own.

## Quick start

```bash
git clone git@github.com:webiny/v5-to-v6.git
cd v5-to-v6
yarn install
cp projects/v5-to-v6/.env.example projects/v5-to-v6/.env
# Edit projects/v5-to-v6/.env with your AWS credentials and table names
yarn transfer --config=./projects/v5-to-v6/ddb.transfer.config.ts
```

The `projects/v5-to-v6/` folder is your starting point. Add more project folders under `projects/` for each environment (staging, prod, etc.) — each with its own `.env` for credential isolation.

## Storage modes

The config builder determines which AWS storage the transfer reads from and writes to:

- **`createDdbTransfer(...)`** — DynamoDB primary table (+ S3 files). Handles all record types: CMS entries + models, security, file manager, folder permissions, mailer settings.
- **`createOsTransfer(...)`** — OpenSearch companion DynamoDB table. Reads gzipped records, unzips, transforms, zips, writes to target OS DDB table.

Run DDB transfer first, then OS transfer with a separate config file. They don't share state.

## Config reference

### DDB config

```typescript
import {
  loadEnv,
  createDdbTransfer,
  fromAwsProfile,
  fromEnv,
  numberFromEnv
} from "@webiny/data-transfer";

loadEnv(import.meta.url);

export default createDdbTransfer({
  source: {
    region: fromEnv("SOURCE_REGION", "us-east-1"),
    credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
    dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
    s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
  },
  target: {
    region: fromEnv("TARGET_REGION", "us-east-1"),
    credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
    dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
    s3: { bucket: fromEnv("TARGET_S3_BUCKET") }
  },
  pipeline: {
    preset: "./presets/my-preset.ts",
    segments: numberFromEnv("SEGMENTS", 4),
    modelsDir: "./models" // optional
  }
});
```

`loadEnv(import.meta.url)` loads the `.env` file sitting next to this config file. Each project folder should have its own `.env` so credentials stay isolated between projects.

### OS config

```typescript
import {
  loadEnv,
  createOsTransfer,
  fromAwsProfile,
  fromEnv,
  numberFromEnv
} from "@webiny/data-transfer";

loadEnv(import.meta.url);

export default createOsTransfer({
  source: {
    region: fromEnv("SOURCE_REGION", "us-east-1"),
    credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
    dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
    opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") }
  },
  target: {
    region: fromEnv("TARGET_REGION", "us-east-1"),
    credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
    opensearch: {
      endpoint: fromEnv("TARGET_OS_ENDPOINT"),
      tableName: fromEnv("TARGET_OS_TABLE"),
      service: "opensearch", // or "opensearch-serverless"
      indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
    }
  },
  pipeline: {
    preset: "v5-to-v6-os",
    segments: numberFromEnv("SEGMENTS", 4),
    modelsDir: fromEnv("MODELS_DIR", "./models")
  }
});
```

**Index management** (OS mode): the tool disables `refresh_interval` just-in-time when it first writes to each index, and restores the original value after the transfer completes. Missing indexes are created with the Webiny base mapping. Only touched indexes are affected.

### Env helpers

- **`fromEnv(name)`** — required string; throws if unset or empty (empty string counts as missing).
- **`fromEnv(name, default)`** — falls back to `default` when unset.
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
  ddb: { maxRetries: 3, initialBackoffMs: 100 },
  s3:  { concurrency: 10, maxRetries: 3, initialBackoffMs: 100 },
  os:  { maxRetries: 3, retryScheduleMs: [5000, 10000, 20000], gzipConcurrency: 16 }
}
```

All fields are optional; absent = built-in defaults. `BATCH_SIZE` for DynamoDB is NOT tunable (AWS enforces 25 items per `BatchWriteItem`). DDB and S3 clients run in AWS SDK `adaptive` retry mode — `tuning.{ddb,s3}.maxRetries` caps the outer retry envelope on top of the SDK's own self-tuning backoff.

### Debug options

Add a `debug` block to your config to opt into diagnostics:

```typescript
debug: {
  snapshot: true,    // or: { dir: "./my-snapshot", compress: false }
  logFile: true      // or: "./my-transfer.log"
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

Point `config.pipeline.preset` at the file path (relative to the config): `"./presets/my-preset.ts"`. Or use a built-in name like `"v5-to-v6-ddb"`.

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

`createFilter` wraps a predicate into a typed `Filter`:

```typescript
import { createFilter } from "@webiny/data-transfer";

// Accept only CMS entries
const isCmsEntry = createFilter(r => r.TYPE === "cms.entry");

// Accept only entries for a specific model
const isArticle = createFilter(r => r.TYPE === "cms.entry" && r.modelId === "article");
```

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

Pass by name in `config.pipeline.preset`:

- **`"v5-to-v6-ddb"`** — full Webiny v5 → v6 migration of the primary DynamoDB table (CMS entries, file manager, security, mailer, folder permissions, etc.).
- **`"v5-to-v6-os"`** — migration of the OpenSearch companion DynamoDB table. Run **after** `v5-to-v6-ddb`.

Custom presets are path-resolved from your config file's directory.

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

## Pipeline runtime semantics

- **Merge groups**: pipelines sharing the same scanner run together, in registration order.
- **First-match-wins**: within a merge group, the first pipeline whose filter(s) pass claims the record. Register more-specific filters before catch-alls.
- **Unmatched records**: if no pipeline accepts a record, it's dropped. The runner emits a `warn` per unmatched record and an `info`-level shard summary: `"unmatched 14 (pb.page.l=4, pb.page=4, T#root#FM#f1:L#v1=2)"`. When TYPE is absent or empty, the key is `PK:SK` instead of a type name. Each worker also writes `segment-N-unmatched.log` to `.transfer/<runId>/`. To transfer every record, add a zero-filter catch-all pipeline last.
- **Hooks**: before-hooks fire once per merge group before any shard; after-hooks fire once after all shards succeed. After-hooks are skipped on shard failure. Each hook receives `{ runId, mergeGroupId }`.
- **Parallelism**: `pipeline.segments` controls the number of parallel scanner segments (shards). Each shard runs in a separate child process.
- **Re-running specific shards**: pass `--segments=1,3` to re-drive only those indices. Workers still receive `--total` from `pipeline.segments`, so each shard scans the exact same slice as a full run. Use after a partial failure to avoid re-scanning the whole table.

---

## Troubleshooting

- **AWS throttling** — the SDK self-tunes via `retryMode: "adaptive"`. If you still hit the outer cap, bump `tuning.ddb.maxRetries` / `tuning.s3.maxRetries`; lower `tuning.s3.concurrency` for S3-heavy transfers.
- **OS indexes not creating** — the transfer aborts if index prep exhausts retries. Tune `tuning.os.maxRetries` and `tuning.os.retryScheduleMs`, or fix the underlying mapping error surfaced in the logs.
- **Missing env vars** — config files use `loadEnv(import.meta.url)` to load a sibling `.env`. Each project folder should have its own `.env`.
- **Target records look wrong** — `DdbProcessor` and `OsProcessor` auto-put `ctx.record` at chain end. If you call `ctx.putRecord(ctx.record)` manually on top of that, you get a duplicate write. Only call `putRecord` for ADDITIONAL records beyond the one being processed.
- **Unmatched records with no TYPE** — records appear as `PK:SK=N` in the summary instead of a TYPE name. Check the per-record warn lines (`unmatched record — TYPE= PK=... SK=...`) and `segment-N-unmatched.log` to identify what these records are, then decide whether to add a pipeline that handles them or leave them dropped intentionally.

## License

See `LICENSE`.
