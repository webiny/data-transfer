# `@webiny/data-transfer`

A generic data-transfer tool for Webiny environments. Copies DynamoDB + S3 (or OpenSearch) records between AWS accounts, optionally running a transformer chain on each record.

**Use cases:**

- **v5 → v6 migration** (the flagship preset ships with the package).
- **Prod → dev seeding** — zero transformers, just copy.
- **Custom transfers** — write your own transformers + pipelines + preset for bespoke data moves.

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
    preset: "v5-to-v6",
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
    preset: "v5-to-v6-os",
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
  pipeline: { preset: "v5-to-v6" },
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

## Writing custom pipelines

A **pipeline** composes a filter + transformer chain. It's bound to a scanner and processor at registration time:

```typescript
import { createDdbPipeline, createFilter } from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

export const taggedEntriesPipeline = createDdbPipeline("tagged-entries", builder => {
  builder
    .filter(createFilter(r => r.TYPE === "cms.entry" && r.tags?.includes("internal")))
    .use(stampMigratedAt);
});
```

Both `.filter()` and `.use()` are **optional**. A pipeline with neither accepts every record and emits it verbatim — pure data copy.

Pipeline factories:

- `createPipeline<TRecord, TContext, TShard>(name, configure)` — generic.
- `createDdbPipeline(name, configure)` — binds DDB scanner/processor shapes.
- `createOsPipeline(name, configure)` — binds OS scanner/processor shapes.

## Writing a preset

A preset is an object that registers pipelines with the runner:

```typescript
import type { MigrationPreset } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor } from "@webiny/data-transfer"; // if exported, else use generic Scanner/Processor
import { taggedEntriesPipeline } from "./pipelines/taggedEntries.ts";

export default {
  name: "custom",
  description: "Transfer only internal-tagged CMS entries",
  configure(runner) {
    taggedEntriesPipeline.register(runner, DdbScanner, DdbProcessor);
  }
} satisfies MigrationPreset;
```

Point `config.pipeline.preset` at the file path (relative to the config) or at the built-in name.

### Zero-transformer preset (pure data copy)

```typescript
import { createDdbPipeline } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor } from "@webiny/data-transfer";

const copyAll = createDdbPipeline("copy-all", () => {
  /* no filter, no transformers */
});

export default {
  name: "copy",
  description: "Copy every record from source to target verbatim",
  configure(runner) {
    copyAll.register(runner, DdbScanner, DdbProcessor);
  }
};
```

Every scanned record lands on target unchanged. No mutations applied.

## Built-in presets

| Name          | Config builder      | Covers                                                                                                                          |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `v5-to-v6`    | `createDdbTransfer` | CMS entries + models, security groups→roles, security teams, file manager settings + files, folder permissions, mailer settings |
| `v5-to-v6-os` | `createOsTransfer`  | CMS entries from the OS companion DDB table                                                                                     |

To use a built-in preset, reference it by name in `config.pipeline.preset` — the preset loader resolves it internally. The built-in transformers and pipeline definitions themselves are not re-exported from the package; they are treated as internal examples and will be revisited once the surrounding infrastructure settles. If you need one of them today, fork or inline it in your own preset.

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
