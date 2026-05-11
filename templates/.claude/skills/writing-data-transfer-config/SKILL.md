---
name: writing-data-transfer-config
description: Use when writing or editing a @webiny/data-transfer config file (config.ts). Covers createConfig signature, credential shapes (fromAwsProfile vs literal), fromEnv / numberFromEnv helpers, loadEnv, source/target collision + trimming rules, tuning knobs.
---

# Writing a `@webiny/data-transfer` config

A config is a `config.ts` file (one per project folder) that `export default`s `createConfig(...)`.

`createConfig` validates with Zod at import time — invalid configs fail fast with a useful message, before any AWS call.

OpenSearch fields (`source.opensearch` / `target.opensearch`) are optional — omit them entirely for a DDB-only transfer.

## Minimal shape

```ts
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
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
        // opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") }
    },
    target: {
        region: fromEnv("TARGET_REGION", "eu-central-1"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") },
        auditLog: { dynamodb: { tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE") } }
        // opensearch: {
        //     endpoint: fromEnv("TARGET_OS_ENDPOINT"),
        //     tableName: fromEnv("TARGET_OS_TABLE"),
        //     service: "opensearch",
        //     indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
        // }
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models"),
        presetsDir: "./presets"
    }
});
```

## Credentials — three accepted shapes

The `credentials` field accepts any of the three. Pick what matches where the transfer runs; mixing is fine across source/target.

### A) Profile — explicit (`fromAwsProfile`)

```ts
credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") })
```

Reads `~/.aws/credentials` using the named profile (re-export of `fromIni`; renamed because "ini" leaks the implementation detail). **Use locally** when you have multiple AWS accounts — explicit profile selection prevents a stray `AWS_ACCESS_KEY_ID` in your shell from silently overriding the wrong account.

### B) Default credential chain — flexible (`fromAwsCredentialChain`)

```ts
credentials: fromAwsCredentialChain()
```

Runs the AWS SDK's default resolution: env vars → shared credentials file → SSO / web identity → EC2/ECS IAM role. **Use in CI / cloud** where the credentials source depends on the deploy target, or when you want one config that "just works" locally AND on a build agent AND on an IAM-instance-profile box.

### C) Literal credentials from env — explicit strings

```ts
credentials: {
    accessKeyId: fromEnv("SOURCE_AWS_ACCESS_KEY_ID"),
    secretAccessKey: fromEnv("SOURCE_AWS_SECRET_ACCESS_KEY"),
    // sessionToken: fromEnv("SOURCE_AWS_SESSION_TOKEN")  // only for temporary STS creds
}
```

Use when your CI injects credentials as env vars directly, when you have temporary STS credentials to pass in, or when you prefer creds in a single `.env` file over a shared profile.

### Picking between them

| Scenario | Pick |
| --- | --- |
| Local dev, multiple AWS accounts | **A** — `fromAwsProfile` |
| CI with IAM role or env-based creds | **B** — `fromAwsCredentialChain` |
| CI that injects `AWS_*` env vars explicitly | **B** or **C** |
| One-config-works-everywhere | **B** — `fromAwsCredentialChain` |
| Temporary STS creds (session token) | **C** — literal object |

## `fromEnv(name, default?)`

Reads `process.env[name]` as a string. Throws if the variable is unset OR empty when no default is provided. Empty-string counts as missing because `KEY=` in a `.env` file is almost always a forgotten value.

```ts
region: fromEnv("SOURCE_REGION", "us-east-1"),   // has default
tableName: fromEnv("SOURCE_DDB_TABLE"),           // no default → throws if missing
```

## `numberFromEnv(name, default?)`

Same contract, but parses via `Number(...)`. Throws if the variable is set but not parseable (`SEGMENTS=four` → named error, not silent `NaN`).

```ts
segments: numberFromEnv("SEGMENTS", 4),
```

## `loadEnv(import.meta.url)`

Loads the `.env` file **next to the config file** (not the one at the repo root). Using `import.meta.url` anchors the lookup to THIS file's directory — so running from the repo root with `--config=./projects/X/...` still loads `projects/X/.env`. Every project should have its own `.env`.

## Config validation rules

Enforced by Zod at build time:

- **All string fields are trimmed** (`region`, `tableName`, `bucket`, `endpoint`, creds). A trailing-space paste error doesn't silently corrupt anything.
- **Whitespace-only rejected** — empty-after-trim is treated as missing.
- **Source/target collision guard**:
  - Same S3 bucket on both sides → rejected (would overwrite source files).
  - Same region + same DDB / OS-DDB table name → rejected (would read and write to the same table). Same table name across DIFFERENT regions is allowed — distinct physical tables.

## `pipeline.presetsDir` — preset discovery

`pipeline.presetsDir` points at a directory of preset files (e.g., `"./presets"`). The runner discovers them at startup; the transfer wizard lets you pick one at runtime. No preset path is needed in the config file itself.

## `pipeline.modelsDir` — CMS model definitions

Used by built-in transformers that inspect field types (`fixBrokenStorageKeys`, `transformRichText`, `addLiveField`). Point at a directory of exported model definitions.

```ts
pipeline: {
    modelsDir: fromEnv("MODELS_DIR", "./models"),
    presetsDir: "./presets"
}
```

Three JSON shapes are accepted and can be mixed freely in the same directory:

| Shape | Example |
|-------|---------|
| Single model | `{ "modelId": "blog", "fields": [...], ... }` |
| Array of models | `[{ "modelId": "blog", "fields": [...] }, ...]` |
| Webiny admin export | `{ "groups": [...], "models": [...] }` |

The Webiny admin panel's **Export** button produces the `{groups, models}` shape. JSON models override DB-loaded models (user-provided definition takes precedence over what was scanned from the source DDB table).

## Snapshot / debug (optional)

```ts
debug: {
    snapshot: true
    // or: snapshot: { dir: "./my-snapshot", compress: false }
}
```

Dumps every record the pipeline touches to local JSONL files. Useful for diffing source vs post-transform on a specific record without re-scanning AWS. Layout (one file per shard per pipeline per category):

- `<dir>/<pipelineName>/segment-<n>.source.jsonl.gz` — post-filter, pre-transform records.
- `<dir>/<pipelineName>/segment-<n>.post-transform.jsonl.gz` — after the transformer chain + onEnd.
- `<dir>/<pipelineName>/segment-<n>.commands.jsonl.gz` — every emitted command (PutRecord, S3Copy, custom).
- `<dir>/dropped/segment-<n>.jsonl.gz` — records that matched no pipeline filter.

Default `dir`: `.transfer/<runId>/snapshot`. Default `compress`: `true`. Best-effort — write errors log `warn` but never fail the transfer.

**Snapshot files may contain production data.** The default `.transfer/` location is gitignored in this repo. If you override `dir` to a path outside `.transfer/`, add your override path to `.gitignore` yourself — these files typically contain full source records + transformed records + emitted commands, which are usually not things you want committed.

### Persistent log file (`debug.logFile`)

```ts
debug: {
    logFile: true                // default: .transfer/<runId>/logs/<orchestrator|segment-N>.log
    // or: logFile: "./my-transfer.log"
}
```

Writes raw pino JSONL to disk in addition to stdout. With `true`, each process gets its own file (orchestrator + one per worker), so concurrent appends can't interleave. With a string path, all processes append to the same file — fine for low-throughput orchestrator logs, risky when worker parallelism is high.

Post-run inspection: `cat .transfer/<runId>/logs/*.log | pino-pretty`. Default path is under `.transfer/` (gitignored in this repo). Custom paths are the user's gitignore responsibility.

## Tuning (optional)

```ts
tuning: {
    ddb: { maxRetries: 3, initialBackoffMs: 100 },
    s3:  { concurrency: 10, maxRetries: 3, initialBackoffMs: 100 },
    os:  {
        maxRetries: 3,
        retryScheduleMs: [5000, 10000, 20000, 30000, 30000],
        gzipConcurrency: 16
    }
}
```

All optional; absent = built-in defaults. AWS SDK `retryMode: "adaptive"` is always on for DDB + S3 — it self-tunes backoff based on real throttle signals, so you usually don't need to tune these.

## Running it

From the user project root:

```bash
yarn transfer --config=./projects/<name>/config.ts
```

Or with a specific AWS profile pre-set in `.env`:

```
SOURCE_PROFILE=prod-reader
TARGET_PROFILE=staging-writer
```

## Common patterns

- **One config per project** — a single `config.ts` handles both DDB and OS transfers. The wizard picks the preset at runtime.
- **Multiple target environments** — duplicate the project folder under `projects/` with different `.env`. The `config.ts` stays identical.
- **Custom preset** — write one (see `writing-data-transfer-preset` skill), drop it in `presetsDir`, and the wizard will discover it automatically.

## Anti-patterns

- **`process.env.X!` bang-casting** — loses the friendly "variable not set" error, and silently passes `undefined` to the AWS SDK on typos. Use `fromEnv(name)` or `fromEnv(name, default)` instead.
- **Hardcoded credentials in the config file** — `.env*` is gitignored; put secrets there. If `.env` ever grows a key that shouldn't be in source, make sure `.gitignore` covers it.
- **Source and target point at the same table** — rejected at build time, but worth re-checking manually before a real run: different regions OR different table names.
