# `@webiny/data-transfer`

A generic data-transfer tool for Webiny environments. Copies DynamoDB + S3 (or OpenSearch) records between AWS accounts, optionally running a transformer chain on each record.

**Use cases:**

- **v5 → v6 migration** — write a preset that registers the relevant pipelines.
- **Prod → dev seeding** — zero transformers, just copy.
- **Custom transfers** — write your own transformers + pipelines + preset for bespoke data moves.

The package ships no built-in presets — you author your own. See `templates/presets/example.ts` (scaffolded by `init`) and `src/presets/example.ts` (canonical reference).

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
import { loadEnv, createDdbTransfer } from "@webiny/data-transfer";

loadEnv(import.meta.url);

export default createDdbTransfer({
  source: {
    region: process.env.SOURCE_REGION!,
    credentials: {
      accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!
    },
    dynamodb: { tableName: "webiny-v5-table" },
    s3: { bucket: "webiny-v5-files" }
  },
  target: {
    region: process.env.TARGET_REGION!,
    credentials: {
      accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!
    },
    dynamodb: { tableName: "webiny-v6-table" },
    s3: { bucket: "webiny-v6-files" }
  },
  pipeline: {
    preset: "./presets/my-preset.ts", // path relative to this config file
    segments: 4,
    modelsDir: "./path/to/models"
  }
});
```

Run it:

```bash
yarn webiny-data-transfer --config=./my-config.ts
```

## Storage modes

The config builder determines the mode:

- `createDdbTransfer(...)` — DynamoDB primary table (+ S3 files). Handles all record types: CMS entries + models, security, file manager, folder permissions, mailer settings.
- `createOsTransfer(...)` — OpenSearch companion DynamoDB table. Handles CMS entries (reads gzipped records, unzips, transforms, zips again, writes to target OS DDB table).

Run DDB transfer first, then OS transfer with a separate config file. They don't share state.

## OpenSearch config shape

```typescript
import { loadEnv, createOsTransfer } from "@webiny/data-transfer";

loadEnv(import.meta.url);

export default createOsTransfer({
  source: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!
    },
    dynamodb: { tableName: "webiny-v5-table" }, // primary table (models, tenants)
    opensearch: { tableName: "webiny-v5-es-table" } // OS companion DDB table
  },
  target: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!
    },
    opensearch: {
      endpoint: "https://search-xxx.us-east-1.es.amazonaws.com",
      tableName: "webiny-v6-es-table",
      service: "opensearch" // or "opensearch-serverless"
    }
  },
  pipeline: {
    preset: "./presets/my-os-preset.ts",
    segments: 4
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

**Auto-put**: you do NOT need to call `ctx.putRecord(ctx.record)` at the end of a transformer chain — the runner auto-emits a PutRecord for the final `ctx.record` after the chain runs. Mutation-only transformers produce writes. Only call `putRecord` when emitting ADDITIONAL records.

## Writing a preset

A preset is an object exported from a `.ts` file. It builds pipelines inside `configure(runner)` using `runner.pipeline({...})`:

```typescript
import type { MigrationPreset } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor, createFilter } from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

const preset: MigrationPreset = {
  name: "tagged-entries",
  description: "Stamp every internal-tagged CMS entry with migratedAt.",
  configure(runner) {
    const taggedEntries = runner
      .pipeline({ name: "TaggedEntries", scanner: DdbScanner, processor: DdbProcessor })
      .filter(createFilter(r => r.TYPE === "cms.entry" && r.tags?.includes("internal")))
      .use(stampMigratedAt)
      .build();

    runner.register(taggedEntries);
  }
};

export default preset;
```

Point `config.pipeline.preset` at the file path (relative to the config) — for example `"./presets/tagged-entries.ts"` or `"../shared/presets/foo.ts"`.

### `runner.pipeline({...})` — typed builder

`runner.pipeline({ name, scanner, processor })` returns a `PipelineBuilder` with `TRecord` and `TContext` inferred from the scanner + processor pair. Mismatched pairs (e.g. `DdbScanner` + `OsProcessor`) fail at compile time.

Builder methods:

- `.filter(filter)` — accepts one filter per call. Multiple `.filter()` calls AND-compose; order doesn't matter for execution.
- `.use(transformer)` — accepts one transformer per call. Insertion order IS preserved at execution time.
- `.beforeExecuteCommands(hook)` / `.afterExecuteCommands(hook)` — optional per-merge-group hooks.
- `.build()` — snapshots into an immutable `Pipeline`. Required before `runner.register()`.

`runner.register(p1, p2, ...)` is variadic, chainable, and throws on duplicate pipeline name.

### Zero-transformer preset (pure data copy)

```typescript
import type { MigrationPreset } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor } from "@webiny/data-transfer";

const preset: MigrationPreset = {
  name: "copy",
  description: "Copy every record from source to target verbatim.",
  configure(runner) {
    const copyAll = runner
      .pipeline({ name: "copy-all", scanner: DdbScanner, processor: DdbProcessor })
      .build(); // no .filter, no .use → accepts every record, emits verbatim

    runner.register(copyAll);
  }
};

export default preset;
```

The runner auto-emits a `PutRecord` for `ctx.record` at the end of each transformer chain (or right after the filter passes, when the chain is empty). Mutation-only transformers produce writes; pure-passthrough pipelines do too.

## Built-in presets

The package ships none today. The `PresetLoader` does scan `node_modules/@webiny/data-transfer/src/presets/` at runtime — drop a `.ts` file there (filename = preset name) and it ships in the next release. `example.ts` is excluded from discovery (it's the canonical reference, not a real preset). Until a built-in lands, every preset is path-resolved from your config file.

## Pipeline runtime semantics

- **Merge groups**: pipelines sharing the same scanner run together, in registration order.
- **First-match-wins**: within a merge group, the first pipeline whose filter(s) pass is the one that runs for that record. Register more-specific filters before catch-alls.
- **Hooks**: each pipeline may declare before-hooks + after-hooks. Before-hooks fire once per merge group before any shard runs; after-hooks fire once after all shards in the merge group succeed. After-hooks are skipped on shard failure.
- **Parallelism**: the `pipeline.segments` config field controls the number of scanner segments (shards). Each shard runs in parallel via a child process.

## Troubleshooting

- **AWS throttling** — the SDK already self-tunes via `retryMode: "adaptive"`. If you still hit the outer retry cap, bump `tuning.ddb.maxRetries` / `tuning.s3.maxRetries`; consider lowering `tuning.s3.concurrency` for S3-heavy transfers.
- **OS indexes not creating** — the transfer now aborts if index prep exhausts retries (previously it silently continued and wrote to a missing/wrong-mapping index). Tune `tuning.os.maxRetries` and `tuning.os.retryScheduleMs`, or fix the underlying mapping error surfaced in the logs.
- **Missing env vars** — config files typically use `loadEnv(import.meta.url)` to load a sibling `.env`. Each project folder should have its own `.env` isolated from others.
- **Target records look wrong** — the runner auto-puts `ctx.record` at the end of each transformer chain. If you're manually calling `ctx.putRecord(ctx.record)`, that's a duplicate write. Remove it; only call `putRecord` for ADDITIONAL records.

## License

See `LICENSE`.
