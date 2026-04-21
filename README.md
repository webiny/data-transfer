# `@webiny/data-transfer`

A generic data-transfer tool for Webiny environments. Copies DynamoDB + S3 (or OpenSearch) records between AWS accounts, optionally running a transformer chain on each record.

**Use cases:**

- **v5 → v6 migration** — write a preset that registers the relevant pipelines.
- **Prod → dev seeding** — zero transformers, just copy.
- **Custom transfers** — write your own transformers + pipelines + preset for bespoke data moves.

The package ships one built-in preset (`v5-to-v6-ddb`) plus full authoring support for your own. See `templates/presets/example.ts` (scaffolded by `init`) for the authoring pattern.

## Quick start

```bash
npx @webiny/data-transfer init my-transfer
cd my-transfer
yarn install
cp projects/example/.env.example projects/example/.env
# Edit projects/example/.env with your AWS credentials
yarn transfer --config=./projects/example/ddb.transfer.config.ts
```

The `init` command scaffolds a project with config templates, `.env` files, and empty `transformers/` + `presets/` folders.

## Manual install

```bash
yarn add @webiny/data-transfer
```

Create a config file:

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
    preset: "./presets/my-preset.ts", // path relative to this config file
    segments: numberFromEnv("SEGMENTS", 4),
    modelsDir: "./path/to/models"
  }
});
```

Run it:

```bash
yarn webiny-data-transfer --config=./my-config.ts
```

**Credentials** — three shapes accepted, pick what matches your deploy:

- **`fromAwsProfile({profile})`** — reads `~/.aws/credentials`. Explicit about which profile. Best for local dev with multiple accounts — no risk of a stray `AWS_ACCESS_KEY_ID` env var silently hijacking the wrong account.
- **`fromAwsCredentialChain()`** — the AWS SDK default chain. Tries env vars → shared credentials file → SSO → EC2/ECS IAM role. Best for CI / cloud runs where creds come from the environment, and for one-config-fits-everywhere setups.
- **Literal `{accessKeyId, secretAccessKey, sessionToken?}`** — explicit strings. Use for temporary STS credentials or CI environments that inject the values as env vars directly.

```typescript
import {
  createDdbTransfer,
  fromAwsProfile,         // explicit profile
  fromAwsCredentialChain, // env → ini → SSO → IMDS
  fromEnv
} from "@webiny/data-transfer";

// …
credentials: fromAwsCredentialChain() // one line, works anywhere
// or
credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") })
// or
credentials: {
  accessKeyId: fromEnv("AWS_ACCESS_KEY_ID"),
  secretAccessKey: fromEnv("AWS_SECRET_ACCESS_KEY")
}
```

`fromEnv(name)` throws if the variable is unset or empty; `fromEnv(name, default)` falls back. `numberFromEnv` is the typed numeric sibling — no more `Number(process.env.X!)` ritual, and a bad value like `SEGMENTS=four` fails fast with a named error.

## Storage modes

The config builder determines the mode:

- `createDdbTransfer(...)` — DynamoDB primary table (+ S3 files). Handles all record types: CMS entries + models, security, file manager, folder permissions, mailer settings.
- `createOsTransfer(...)` — OpenSearch companion DynamoDB table. Handles CMS entries (reads gzipped records, unzips, transforms, zips again, writes to target OS DDB table).

Run DDB transfer first, then OS transfer with a separate config file. They don't share state.

## OpenSearch config shape

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
    dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") }, // primary table (models, tenants)
    opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") } // OS companion DDB table
  },
  target: {
    region: fromEnv("TARGET_REGION", "us-east-1"),
    credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
    opensearch: {
      endpoint: fromEnv("TARGET_OS_ENDPOINT"),
      tableName: fromEnv("TARGET_OS_TABLE"),
      service: "opensearch" // or "opensearch-serverless"
    }
  },
  pipeline: {
    preset: "./presets/my-os-preset.ts",
    segments: numberFromEnv("SEGMENTS", 4)
  }
});
```

**Index management** (OS mode): the tool disables `refresh_interval` just-in-time when it first writes to each index, and restores the original value after the transfer completes. Missing indexes are created with the Webiny base mapping. Only touched indexes are affected — safe for shared clusters.

## Tuning (optional)

Operational knobs live under `config.tuning`:

```typescript
export default createDdbTransfer({
  source: {
    /* ... */
  },
  target: {
    /* ... */
  },
  pipeline: { preset: "./presets/my-preset.ts" },
  tuning: {
    ddb: { maxRetries: 3, initialBackoffMs: 100 },
    s3: { concurrency: 10, maxRetries: 3, initialBackoffMs: 100 },
    os: {
      maxRetries: 3,
      retryScheduleMs: [5000, 10000, 20000, 30000, 30000],
      gzipConcurrency: 16
    }
  }
});
```

All fields are optional; absent = built-in defaults. `BATCH_SIZE` for DynamoDB is NOT tunable (AWS enforces 25 items per `BatchWriteItem`).

DynamoDB and S3 clients additionally run in AWS SDK `adaptive` retry mode, which self-tunes backoff based on response-side throttle signals — no per-second pacing knob is needed or exposed. The `tuning.{ddb,s3}.maxRetries` cap controls the outer envelope on top of that.

## Writing custom transformers

A transformer is a plain function `(ctx) => void | Promise<void>` that mutates `ctx.record`. Wrap it with a named factory for DI friendliness:

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

- `createTransformer<TContext>(name, fn)` — generic over any context type.
- `createDdbTransformer(name, fn)` — binds `DdbTransformContext.Interface`.
- `createOsTransformer(name, fn)` — binds `OsTransformContext.Interface`.

### Context API

Both DDB and OS transform contexts expose:

| Member                     | Description                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ctx.record`               | Mutable record. Transformers change this.                                                             |
| `ctx.original`             | Frozen, deep-cloned pre-transform snapshot. Use for gate-checks or audit comparisons. Always present. |
| `ctx.commands`             | The command buffer. Transformers rarely need this directly — use the helpers below.                   |
| `ctx.modelProvider`        | Loaded CMS models.                                                                                    |
| `ctx.cache`                | Shared `Map`-like cache, persists across records within a run.                                        |
| `ctx.replace(newRecord)`   | Replace `ctx.record` wholesale.                                                                       |
| `ctx.putRecord(record)`    | Emit an extra PutRecord to the target (beyond the auto-put at chain end).                             |
| `ctx.queryRecord(pk, sk?)` | Query the source primary table. Returns `null` if not found.                                          |

DDB context additionally provides:

- `ctx.copyFile(sourceKey, targetKey)` — emit an S3 copy command.
- `ctx.getFile(key)` — read a file from the source bucket.

**Auto-put**: `DdbProcessor` and `OsProcessor` include an `onEnd` hook that emits a `PutRecord` for `ctx.record` at the end of each transformer chain. Pure-passthrough pipelines (no `.filter` + no `.use`) still produce writes. `S3Processor` has no `onEnd` — transformers call `ctx.copyFile(...)` explicitly.

## Writing a preset

A preset is an object exported as `default` from a `.ts` file. Wrap it in `createTransferPreset({...})` — a typed identity helper that gives you inference on `configure({...})` without needing to import and annotate `MigrationPreset`. Build pipelines via `pipelineBuilderFactory.create({...})`:

```typescript
import {
  createTransferPreset,
  DdbScanner,
  DdbProcessor,
  createFilter
} from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

export default createTransferPreset({
  name: "tagged-entries",
  description: "Stamp every internal-tagged CMS entry with migratedAt.",
  configure({ runner, pipelineBuilderFactory }) {
    const taggedEntries = pipelineBuilderFactory
      .create({ name: "TaggedEntries", scanner: DdbScanner, processors: [DdbProcessor] })
      .filter(createFilter(r => r.TYPE === "cms.entry" && r.tags?.includes("internal")))
      .use(stampMigratedAt)
      .build();

    runner.register(taggedEntries);
  }
});
```

Point `config.pipeline.preset` at the file path (relative to the config) — for example `"./presets/tagged-entries.ts"` or `"../shared/presets/foo.ts"`.

### `PresetConfigureContext`

`configure` receives:

- `runner` — call `.register(...pipelines)` after building.
- `pipelineBuilderFactory` — call `.create({...})` to build pipelines.
- `container` — DI container for resolving custom services you registered in `setup.ts` (see below).

Return `void` or `Promise<void>` — async configure is supported.

### `pipelineBuilderFactory.create({...})` — typed builder

`create({ name, scanner, processors })` returns a `PipelineBuilder` with `TRecord` inferred from the scanner and `TContext` inferred from the processors' slices. `processors` is a `NonEmptyArray`; TS rejects empty arrays and rejects processors whose slice keys collide (e.g. `DdbProcessor` + `OsProcessor` both contribute `putRecord`).

Builder methods:

- `.filter(filter)` — one filter per call. Multiple `.filter()` calls AND-compose; order doesn't matter for execution.
- `.use(transformer)` — one transformer per call. Insertion order IS preserved at execution time.
- `.beforeExecuteCommands(hook)` / `.afterExecuteCommands(hook)` — optional per-merge-group hooks.
- `.build()` — snapshots into an immutable `Pipeline`. Required before `runner.register()`.

`runner.register(p1, p2, ...)` is variadic, chainable, and throws on duplicate pipeline name.

### Zero-transformer preset (pure data copy)

```typescript
import { createTransferPreset, DdbScanner, DdbProcessor } from "@webiny/data-transfer";

export default createTransferPreset({
  name: "copy",
  description: "Copy every record from source to target verbatim.",
  configure({ runner, pipelineBuilderFactory }) {
    const copyAll = pipelineBuilderFactory
      .create({ name: "copy-all", scanner: DdbScanner, processors: [DdbProcessor] })
      .build(); // no .filter, no .use → accepts every record, emits verbatim

    runner.register(copyAll);
  }
});
```

`DdbProcessor.onEnd` emits a `PutRecord` for `ctx.record` at the end of each record. Pure-passthrough pipelines (no transformers, no filters) still produce writes.

## Built-in presets

The package ships one: `v5-to-v6-ddb` — the full Webiny v5 → v6 DDB migration. Pass it by name via `config.pipeline.preset: "v5-to-v6-ddb"`. The `PresetLoader` scans `node_modules/@webiny/data-transfer/src/presets/` at runtime — drop a `.ts` file there (filename = preset name) and it ships in the next release. Custom presets are still path-resolved from your config file (`"./presets/my-preset.ts"`).

## Pipeline runtime semantics

- **Merge groups**: pipelines sharing the same scanner run together, in registration order.
- **First-match-wins**: within a merge group, the first pipeline whose filter(s) pass is the one that runs for that record. Register more-specific filters before catch-alls.
- **Unmatched records are dropped by design**: if no pipeline in the merge group accepts a record, it's skipped. A preset picks which record types to transfer — types outside the preset's filter set are intentionally left behind. The runner emits an `info`-level summary at the end of each shard: `"[<mergeGroupId> shard 1/4] scanned 10000, transferred 9612 (cmsEntries=8421, fmFiles=1191), dropped 388"` — so a default-log-level run shows exactly how many records landed vs. were skipped. If you need every record to land on the target, add a catch-all pipeline last (`.filter(createFilter(() => true))`) or register a zero-transformer passthrough under the same scanner.
- **Hooks**: each pipeline may declare before-hooks + after-hooks. Before-hooks fire once per merge group before any shard runs; after-hooks fire once after all shards in the merge group succeed. After-hooks are skipped on shard failure.
- **Parallelism**: the `pipeline.segments` config field controls the number of scanner segments (shards). Each shard runs in parallel via a child process.

## Debugging: per-record snapshot

Add `debug: { snapshot: true }` to your config to dump every record the pipeline touches to local JSONL files. Useful for seeing exactly what a transformer did to a specific record, without going back to AWS.

```typescript
export default createDdbTransfer({
  source: {
    /* ... */
  },
  target: {
    /* ... */
  },
  pipeline: { preset: "./presets/my-preset.ts" },
  debug: {
    snapshot: true
    // or: snapshot: { dir: "./my-snapshot", compress: false }
  }
});
```

Layout (default `dir`: `.transfer/<runId>/snapshot`, gzipped):

```
.transfer/<runId>/snapshot/
├── <pipelineName>/
│   ├── segment-0.source.jsonl.gz         ← post-filter, pre-transform
│   ├── segment-0.post-transform.jsonl.gz ← after the whole transformer chain
│   └── segment-0.commands.jsonl.gz       ← PutRecord + S3Copy + etc.
└── dropped/
    └── segment-0.jsonl.gz                ← records matching no pipeline filter
```

One file per shard per pipeline per category. Inspect with `zcat` + `jq`:

```bash
zcat .transfer/<runId>/snapshot/cmsEntries/segment-0.source.jsonl.gz | jq 'select(.PK=="T#tenant#CME#abc")'
```

Snapshot is best-effort — write errors log `warn` but never break the transfer. Set `compress: false` if you want to `grep` the files directly without `zcat`.

## Troubleshooting

- **AWS throttling** — the SDK already self-tunes via `retryMode: "adaptive"`. If you still hit the outer retry cap, bump `tuning.ddb.maxRetries` / `tuning.s3.maxRetries`; consider lowering `tuning.s3.concurrency` for S3-heavy transfers.
- **OS indexes not creating** — the transfer now aborts if index prep exhausts retries (previously it silently continued and wrote to a missing/wrong-mapping index). Tune `tuning.os.maxRetries` and `tuning.os.retryScheduleMs`, or fix the underlying mapping error surfaced in the logs.
- **Missing env vars** — config files typically use `loadEnv(import.meta.url)` to load a sibling `.env`. Each project folder should have its own `.env` isolated from others.
- **Target records look wrong** — the runner auto-puts `ctx.record` at the end of each transformer chain. If you're manually calling `ctx.putRecord(ctx.record)`, that's a duplicate write. Remove it; only call `putRecord` for ADDITIONAL records.

## License

See `LICENSE`.
