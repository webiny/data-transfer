---
name: configReference
description: createConfig shape — fromEnv/numberFromEnv, credentials (fromAwsProfile, fromAwsCredentialChain, literal), register callback, pipeline settings, tuning, debug/snapshot.
category: Guides
---

# Config reference

`createConfig(input)` validates a Zod schema (`unifiedTransferInputSchema`) and returns the parsed `MigrationConfiguration`. One `config.ts` file covers DynamoDB, S3, and optional OpenSearch for both source and target. Source: `src/features/MigrationConfig/createConfig.ts`, `src/features/MigrationConfig/schemas/unified.schema.ts`, `src/features/MigrationConfig/schemas/shared.schema.ts`.

```typescript
function createConfig(input: z.input<typeof unifiedTransferInputSchema>): MigrationConfiguration;
```

## Full shape

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
    opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") } // omit/null if no source OS
  },
  target: {
    region: fromEnv("TARGET_REGION", "eu-central-1"),
    credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
    dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
    s3: { bucket: fromEnv("TARGET_S3_BUCKET") },
    auditLog: { dynamodb: { tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE") } }, // null/omit to skip
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
    presetsDir: "./presets" // optional — custom preset files, listed alongside built-ins
  },
  fileUrls: { source: "https://old-cdn.example.com", target: "https://new-cdn.example.com" }, // optional
  register: async container => { /* ... */ },  // optional
  tuning: { /* ... */ },                        // optional
  debug: { /* ... */ }                          // optional
});
```

`loadEnv(import.meta.url)` loads the `.env` file sitting next to this config file — keep one `.env` per project so credentials stay isolated.

## `source` / `target` field reference

| Field | Required | Notes |
| --- | --- | --- |
| `region` | yes | Non-empty, trimmed string. |
| `credentials` | yes | See Credentials below. |
| `accountId` | no | Optional; used by the wizard's cross-account S3 warning. |
| `dynamodb.tableName` | yes | Non-empty, trimmed string. |
| `s3.bucket` | yes | Non-empty, trimmed string. |
| `opensearch` | no | `{ tableName }` on source, `{ endpoint, tableName, service, indexPrefix }` on target. Omit or `null` on **both** sides if unused — mismatched presence (one side set, the other not) fails validation. |
| `target.auditLog.dynamodb.tableName` | no | Omit, or set to `null`, to skip the audit log table — matching records are blackholed instead of written. |

### Validation guardrails (`superRefine` checks in `unified.schema.ts`)

`createConfig(...)` throws at call time if any of these hold:

- `source.s3.bucket === target.s3.bucket` — would overwrite source files.
- `source.region === target.region && source.dynamodb.tableName === target.dynamodb.tableName` — same table on both sides in the same region.
- `target.auditLog.dynamodb.tableName === target.dynamodb.tableName` — audit log table must differ from the main target table.
- `(source.opensearch != null) !== (target.opensearch != null)` — OS must be configured on both sides or neither.
- OS present on both sides AND `source.region === target.region && source.opensearch.tableName === target.opensearch.tableName` — same OS companion table on both sides in the same region.

These exist to catch copy-paste config mistakes before any data moves — cross-account setups that legitimately reuse a name/region should differentiate one side (rename or use a different region) to signal intent.

## Env helpers

Source: `src/utils/fromEnv.ts`.

```typescript
function fromEnv(name: string): string;                       // throws if unset/empty
function fromEnv(name: string, defaultValue: string): string;  // falls back to defaultValue
function fromEnv(name: string, defaultValue: null): string | null; // returns null instead of throwing

function numberFromEnv(name: string): number;                   // throws if unset
function numberFromEnv(name: string, defaultValue: number): number;
```

- **`fromEnv(name)`** — required; throws `Environment variable "<name>" is not set and no default was provided.` if unset **or empty** (`KEY=` in `.env` counts as unset — treated as a forgotten value, not an intentional empty override).
- **`fromEnv(name, default)`** — returns `default` when unset/empty.
- **`fromEnv(name, null)`** — returns `string | null`; use for genuinely optional config sections, e.g. `fromEnv("SOURCE_OS_TABLE", null)`.
- **`numberFromEnv(name, default?)`** — parses via `Number(...)`; throws `Environment variable "<name>" is not a valid number (got "<raw>").` on parse failure (e.g. `SEGMENTS=four`) so typos surface immediately instead of becoming `NaN` downstream.

## Credentials

Both `source.credentials` and `target.credentials` accept one of three shapes (`credentialsOrProviderSchema` in `shared.schema.ts`):

```typescript
import { fromAwsProfile, fromAwsCredentialChain } from "@webiny/data-transfer";

credentials: fromAwsProfile({ profile: "prod-reader" })
// or
credentials: fromAwsCredentialChain()
// or — literal, for temporary STS credentials
credentials: { accessKeyId: "...", secretAccessKey: "...", sessionToken: "..." /* optional */ }
```

| Shape | Re-exported from | Behavior |
| --- | --- | --- |
| `fromAwsProfile({ profile })` | `@aws-sdk/credential-providers`'s `fromIni` | Reads `~/.aws/credentials`. Explicit account selection — best for local dev with multiple profiles; no risk of a stray `AWS_ACCESS_KEY_ID` env var silently hijacking the wrong account. |
| `fromAwsCredentialChain()` | `@aws-sdk/credential-providers`'s `fromNodeProviderChain` | AWS SDK default chain: env vars → shared credentials file → SSO/web-identity → EC2/ECS IAM role. Best for CI / cloud runs where the same config must work without code changes. |
| Literal `{ accessKeyId, secretAccessKey, sessionToken? }` | n/a — validated directly | Explicit strings, e.g. short-lived STS credentials. `sessionToken` optional. |

Both `fromAwsProfile`/`fromAwsCredentialChain` return an `AwsCredentialsProvider` (`() => Promise<AwsResolvedCredentials>`) — the schema's union validates either a literal object or any function, so a hand-written custom provider function also satisfies it.

## `register` callback (optional)

Runs **before** preset loading; wires custom DI bindings the preset's `configure()` can later resolve via `container`:

```typescript
import { createConfig, SourceDynamoDbClient, PipelineCustomizer } from "@webiny/data-transfer";

export default createConfig({
  // ...source, target, pipeline...
  register: async container => {
    const sourceDb = container.resolve(SourceDynamoDbClient); // direct AWS access, e.g. pre-flight checks

    container.register(MyCustomProcessorImpl);   // custom Processor.createImplementation(...)
    container.register(MyCustomizerImpl);        // PipelineCustomizer.createImplementation(...)
  }
});
```

Signature: `type RegisterFn = (container: Container) => void | Promise<void>`.

**Service client abstractions** resolvable from `container`: `SourceDynamoDbClient`, `TargetDynamoDbClient`, `OpenSearchClient`, `SourceS3Client`, `TargetS3Client`.

**Lifecycle hooks** can also be registered here — `BeforeTransferHook` / `AfterTransferHook` (`execute(): Promise<void>`, run once per whole transfer) and `BeforeLoadPresetHook` / `AfterLoadPresetHook` (`execute(config, preset?): Promise<void>`, run around preset loading). These abstractions use `{ multiple: true }` — registering one adds to the list rather than replacing a default.

### Customizing OpenSearch index configuration

Override `IndexConfigurationProvider` to control index creation — mappings, settings, per-index overrides:

```typescript
import { createConfig, IndexConfigurationProvider } from "@webiny/data-transfer";

class CustomIndexConfig implements IndexConfigurationProvider.Interface {
    public getConfiguration(indexName: string, base: IndexConfigurationProvider.Configuration) {
        const settings = { ...base.settings, number_of_replicas: 2 };
        if (indexName.includes("articles")) {
            return {
                settings,
                mappings: {
                    ...base.mappings,
                    properties: { ...base.mappings?.properties, title: { type: "text", analyzer: "english" } }
                }
            };
        }
        return { ...base, settings };
    }
}

const CustomIndexConfigImpl = IndexConfigurationProvider.createImplementation({
    implementation: CustomIndexConfig,
    dependencies: []
});

export default createConfig({
    // ...source, target, pipeline...
    register: container => { container.register(CustomIndexConfigImpl); }
});
```

The tool disables `refresh_interval` just-in-time on first write to each index and restores the original value after transfer completes. Missing indexes are created with the Webiny base mapping; only touched indexes are affected.

## `pipeline` settings

```typescript
pipeline: {
  segments: numberFromEnv("SEGMENTS", 4),   // parallel worker processes / DDB scan segments
  modelsDir: fromEnv("MODELS_DIR", "./models"), // CMS model JSON directory
  presetsDir: "./presets"                    // optional — custom preset files
}
```

All three fields are optional in the schema (`pipelineSettingsSchema`). `modelsDir` is required in practice by the OS preset and by rich-text / field-key transformers — point it at a directory of exported CMS model definitions:

```
models/
  single-model.json      # { "modelId": "...", "fields": [...], ... }
  array-of-models.json   # [{ "modelId": "...", "fields": [...] }, ...]
  webiny-export.json     # { "groups": [...], "models": [...] }  ← Webiny admin export
```

Three JSON shapes can be mixed in the same directory; JSON models override DB-loaded models when both exist for the same `modelId`.

## `tuning` (optional)

```typescript
tuning: {
  flushEvery: numberFromEnv("FLUSH_EVERY", 500), // records per shard flush — bounds peak memory
  ddb: { maxRetries: 3, initialBackoffMs: 100, requestTimeoutMs: 5000 },
  s3:  { concurrency: 10, maxRetries: 3, initialBackoffMs: 100, requestTimeoutMs: 10000 },
  os:  { maxRetries: 3, retryScheduleMs: [5000, 10000, 20000], gzipConcurrency: 16 }
}
```

All fields optional (`tuningSchema`); absent = built-in defaults.

- **`flushEvery`** (default 500) — the runner calls each processor's `execute()` every N records and resets the command buffer, bounding peak memory to `flushEvery × avg_record_size` (≈ 5 MB at a 10 KB average, default). Lower to `100` for tables with very large records.
- **DynamoDB `BatchWriteItem` batch size is NOT tunable** — AWS hard-caps it at 25 items per call.
- DDB and S3 clients run in AWS SDK `adaptive` retry mode; `tuning.{ddb,s3}.maxRetries` caps the **outer** retry envelope on top of the SDK's own self-tuning backoff — it doesn't replace SDK retry logic.
- `tuning.os.retryScheduleMs` is an explicit backoff schedule (array of delays in ms) rather than a `maxRetries` + exponential-backoff pair.

## `debug` (optional)

```typescript
debug: {
  logLevel: "debug",  // "debug" | "info" | "warn" | "error" (default "info"); overridable via --log-level CLI flag
  snapshot: true,     // or: { dir: "./my-snapshot", compress: false }
  logFile: true       // or: "./my-transfer.log"
}
```

### `debug.snapshot`

Dumps every record the pipeline touches to local JSONL files (default dir `.transfer/<runId>/snapshot`):

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

```bash
zcat .transfer/<runId>/snapshot/cmsEntries/segment-0.source.jsonl.gz | jq 'select(.PK=="T#tenant#CME#abc")'
```

Set `compress: false` to `grep` directly without `zcat`. Best-effort — write errors log `warn` but never abort the transfer.

### `debug.logFile`

Captures the full runner log to disk. `true` → each process writes to `.transfer/<runId>/logs/<orchestrator|segment-N>.log` (one file per process, no interleaving under parallelism). String → all processes write to that path instead. Content is raw pino JSONL:

```bash
cat .transfer/<runId>/logs/*.log | pino-pretty
```

## `fileUrls` (optional)

Required only if you use the `replaceFileUrls` transformer factory (see `writingTransformers.md`):

```typescript
fileUrls: {
  source: "https://old-cdn.example.com",
  target: "https://new-cdn.example.com"
}
```

## Required IAM permissions

The tool runs a pre-flight access check (`HeadBucket` for S3, `DescribeTable` for DynamoDB) before any data moves; a failing check aborts the run with the specific resource/credential set that failed.

**Source credentials:**

| Service | Actions | Resource |
| --- | --- | --- |
| DynamoDB | `Scan`, `Query`, `DescribeTable` | Source primary table |
| S3 | `GetObject`, `ListBucket` | Source bucket |
| DynamoDB | `Scan`, `Query`, `DescribeTable` | Source OS companion table (if using OpenSearch) |

**Target credentials:**

| Service | Actions | Resource |
| --- | --- | --- |
| DynamoDB | `BatchWriteItem`, `Query`, `DescribeTable` | Target primary table |
| S3 | `PutObject`, `ListBucket` | Target bucket |
| S3 | `GetObject` on the **source** bucket | Cross-account note below |
| DynamoDB | `BatchWriteItem`, `Query`, `DescribeTable` | Target OS companion table (if using OpenSearch) |
| OpenSearch | `ESHttpGet`, `ESHttpPut`, `ESHttpPost` | Target OpenSearch domain (if using OpenSearch) |
| DynamoDB | `BatchWriteItem`, `DescribeTable` | Target audit log table (if configured) |

**S3 cross-account access:** `CopyObjectCommand` runs with **target credentials**. When source and target are in different AWS accounts, the target account needs read access to the source bucket — either a bucket policy on the source granting `s3:GetObject` to the target account, or a cross-account IAM role. Without this, S3 file copies fail with `AccessDenied`; the wizard warns on detected account-ID mismatch, and the pre-flight check verifies target credentials can reach the source bucket.
