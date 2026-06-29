# Config reference

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
