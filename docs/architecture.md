# Architecture patterns

### DI via `@webiny/di`

- `createAbstraction<T>(name)` → `Abstraction<T>` (has `.token: symbol`).
- `Abstraction.createImplementation({ implementation, dependencies })` → an Implementation class (`I & { __abstraction: A }`). **The Implementation class is NOT an Abstraction at runtime** — it has no `.token`. `container.resolve(ImplClass)` would fail, but `container.register(ImplClass)` works (reads abstraction via `Metadata`).
- `PipelineBuilderFactory.create({ name, scanner, processors })` accepts Implementation classes (not just abstractions). The type system infers `TRecord` / `TContext` / `TShard` from the Impl class instance types. At runtime the factory has all `Processor` and `Scanner` instances injected via `[Processor, { multiple: true }]` / `[Scanner, { multiple: true }]` dependencies, then finds each right instance by `x.constructor === implClass` — **pipelines carry resolved scanner and processor instances, not tokens**. All processors share `Symbol("Core/Processor")`; all scanners share `Symbol("Core/Scanner")`; constructor identity is the discriminator, not registration order.
- `runner.register(...pipelines: Pipeline<any, any, any>[])` widens the parameter type intentionally — TRecord is invariant in `Pipeline` (because `Filter<TRecord>` is contravariant), so a strict signature would force every caller to cast. The runner doesn't introspect type params at this boundary.

For the full `@webiny/di` guide, see [webiny-di-guide.md](webiny-di-guide.md).

### Feature layout

Every feature follows:

```
src/features/FeatureName/
├── abstractions/
│   ├── FeatureName.ts    # Interface + abstraction token + namespace
│   └── index.ts          # Only const tokens (no type exports)
├── FeatureName.ts        # Class + createImplementation
├── feature.ts            # createFeature registers into container
└── index.ts              # Public API
```

**Rules that are NOT negotiable:**

- Types accessed only via namespace (`FeatureName.Interface`), never direct interface exports from abstractions.
- `public`/`private`/`protected` on every class member.
- Braces always — no single-line `if`/`for`/`while`.
- No `reflect-metadata` imports (loaded by `@webiny/di` internally).
- `~/*` path alias in `src/`; relative paths in `__tests__/` for test-only infra that lives outside `src/`.
- Named `interface`/`type` for any structural shape — no inline `{ ... }` in generic positions.
- File names use **camelCase** (not kebab-case).
- oxfmt (`yarn format:fix`) — NOT prettier.
- `yarn` — never `npm`.

### Pipeline runtime model

- **Merge group** = set of pipelines sharing the same scanner instance (keyed by object identity). Runner iterates one merge group at a time.
- **First-match-wins** per record: within a merge group, the first pipeline whose filters all pass is the one that runs. Subsequent pipelines skip that record.
- **Unmatched records are dropped per design**: if NO pipeline in the merge group accepts a record, it's skipped. Each unmatched record emits a `warn`-level log line: `"unmatched record — TYPE=<type> PK=<pk> SK=<sk>"`. The shard summary shows a TYPE breakdown: `"unmatched 5 (page.page=3, cms.entry=2)"`; when TYPE is absent or empty, the key is `PK:SK` instead of `unknown`. After the run, `segment-N-unmatched.log` under `.transfer/<runId>/` lists every unmatched record (one per line: `[TYPE] PK : SK`). If users want exhaustive transfer, register a catch-all passthrough pipeline last.
- **Filter order matters**: register more-specific pipelines before catch-alls.
- **Blackhole pipelines** (`builder.blackhole()`): filters + transformers + `onEnd` run exactly as usual; the fold-to-shard step in `runRecord` is what's skipped, so every emitted command is dropped before any processor drains. Use for observe-only pipelines (validation, dry-run-one-pipeline, shadow runs). Snapshot still records source/post-transform/commands — diffing a blackholed pipeline's intended writes is the whole point. `PipelineConfig.blackhole` is `?: boolean`; `Pipeline.isBlackhole` getter normalizes missing → `false`.
- **Per-record `onEnd` hooks replace magic auto-put**: after filters + transformers run, the runner invokes each processor's `onEnd?(ctx)` sequentially in array order. `DdbProcessor.onEnd` and `OsProcessor.onEnd` call `ctx.putRecord(ctx.record)` via their slice helpers — so pipelines containing either get the "auto-put" behavior by virtue of the processor. `S3Processor` has no `onEnd` (no derivable per-record default). Pipelines with zero transformers still produce writes as long as a writer processor is in the list. See `src/features/PipelineRunner/PipelineRunner.ts:runRecord`.
- **Hooks**: per merge group. Before-hooks run (dedup'd by token, in registration order) before any shards. After-hooks run (dedup'd, in REVERSE order) after all shards succeed. After-hooks are SKIPPED on shard failure. Each hook gets `{ runId, mergeGroupId }`.

### Context surface (slice-merged)

`BaseTransformContext.Interface<TRecord>` (slim — target-agnostic) exposes:

- `record: TRecord` — mutable, transformers change this.
- `original: Readonly<TRecord>` — **frozen snapshot of the pre-transform record, always present**. Users may consume it for gate-checks, audits, etc. — do NOT remove even if no built-in code uses it.
- `addCommand(cmd: Command)` — push a command to the (internal) bag. Canonical primitive; slice helpers are sugar over it.
- `modelProvider`, `cache`, `logger`, `compressionHandler` — shared singletons. Use `ctx.logger` instead of `console.*` inside transformers — it's bound to the current worker and respects the configured log level. `compressionHandler` is used by rich-text and compressed-field transformers.
- `replace(newRecord)` — replaces `ctx.record`.
- `blackhole()` — marks this record for per-record blackholing. Remaining transformers and `onEnd` hooks still run (side effects preserved), but all commands are discarded at the fold step. Irreversible within the record lifecycle. The runner checks `ctx.isBlackholed` after transformers + `onEnd`: `if (pipeline.isBlackhole || ctx.isBlackholed) { return Blackholed; }`.
- `readonly isBlackholed: boolean` — read-only flag set by `blackhole()`. Defaults to `false`; each `create()` call produces an independent closure.

**Raw `commands` bag is NOT on the public ctx** — `addCommand` is the only public push path. The bag still exists internally for `Processor.execute(commands)` at shard end. `Commands.unclaimedKeys()` tracks keys whose commands nobody drained, used by the runner to warn-once.

**Each processor contributes a SLICE of helpers** via its `extendContext(base)` method. The runner spreads all processor slices over the base ctx per-record. Effective ctx = `BaseTransformContext ∧ MergeSlices<TProcessors>`. Slice key collision → TS rejects at the `pipelineBuilderFactory.create({...})` call site via `DisjointKeys<...>`.

Slice inventory:

- **`DdbProcessor` slice**: `putRecord(record)`, `querySourceRecord<T>(pk, sk?)`, `queryTargetRecord<T>(pk, sk?)` → emits PutRecord targeting DDB primary; source/target table lookups.
- **`OsProcessor` slice**: `putRecord(record)`, `querySourceRecord<T>(pk, sk?)`, `queryTargetRecord<T>(pk, sk?)` → emits PutRecord targeting OS DDB table (same slice keys as DdbProcessor → mutually exclusive in one pipeline).
- **`S3Processor` slice**: `copyFile(src, tgt)`, `getFile(key)` → PushQueue S3Copy / sync read from source bucket.

Type aliases `DdbTransformContext` (= Base ∧ DdbProcessorSlice ∧ S3ProcessorSlice) and `OsTransformContext` (= Base ∧ OsProcessorSlice) are exported for transformer authors who want typed ctx parameters.

**Removed from context (do not reintroduce):** `executePipeline(pipeline, records)` — nested-pipeline helper, dropped 2026-04-19.

### Scanner / Processor / Executor

- **Scanner** = source iterator. Yields records per shard. `DynamoDbClient.scan<T>` is generic so scanners can narrow the raw row type.
- **Processor** = per-command-type unit implementing `Processor.Interface<TBase, TSlice>`. Required: `checkAccess() → Promise<AccessCheck.Entry[]>` (pre-flight access validation), `execute(commands) → Promise<void>` (drains its command keys). Optional: `extendContext(base) → slice` (context helpers), `onEnd(ctx) → void | Promise<void>` (per-record terminal hook, replaces legacy auto-put magic), `afterShard({ segment, totalSegments }) → void | Promise<void>` (per-shard persistence hook for processors that carry state across the worker→orchestrator boundary — only OsProcessor implements it today, to write `<segment>-indexes.json`).
- Per-record orchestration: filters run first (`pipeline.accepts(record)` in the shard loop) → runner builds base ctx → spreads each processor's slice → runs transformers → runs each processor's `onEnd?` SEQUENTIALLY IN ARRAY ORDER.
- Per-shard orchestration: each processor's `execute()` runs SEQUENTIALLY IN ARRAY ORDER. After all processors drain, runner checks `Commands.unclaimedKeys()` and warns once per unmatched key ("transformer pushed X but no processor drained X").
- **`DdbExecutor`** is a SHARED primitive (not a Processor) — `batchPut` against a target DDB table. Both `DdbProcessor.execute` and `OsProcessor.execute` compose it. OS adds gzip + ensureIndex preamble before delegating.
- **"Record carries everything"** is a house invariant — do NOT add pre-transform snapshot queues, metadata side-channels, or "executor derives X" logic. If transformers destroyed something a processor needs, users write a transformer that preps it.

### MigrationConfig tuning

Optional `tuning` section on `MigrationConfig`:

```typescript
tuning?: {
    flushEvery?: number;  // records per shard flush (default 500); bounds peak memory
    ddb?: { maxRetries?: number; initialBackoffMs?: number; requestTimeoutMs?: number };
    s3?:  { concurrency?: number; maxRetries?: number; initialBackoffMs?: number; requestTimeoutMs?: number };
    os?:  { maxRetries?: number; retryScheduleMs?: number[]; gzipConcurrency?: number };
}
```

**Debug options** on `MigrationConfig`:

```typescript
debug?: {
    logLevel?: "debug" | "info" | "warn" | "error";  // default "info"; also overridable via --log-level CLI flag
    logFile?: boolean | string;   // true → per-process JSONL; string → shared path
    snapshot?: boolean | { dir?: string; compress?: boolean };
}
```

Fields flow to the respective client/executor; absent = module-level defaults. `BATCH_SIZE = 25` in DDB is AWS-enforced, NOT a user knob.

`flushEvery` caps peak per-shard memory: at default 500 × 10 KB avg = ~5 MB/shard. For tables with very large records (approaching the 400 KB DDB max) lower this to 100. Set via `tuning: { flushEvery: numberFromEnv("FLUSH_EVERY", 500) }` in the config.

### AWS retry + error classification

All AWS-facing code shares one classifier: `src/base/isRetryableAwsError.ts` (duck-typed, no SDK import). Retry path per client:

- **DDB + S3**: AWS SDK clients are created with `retryMode: "adaptive"` (self-tuning token bucket inside the SDK). The outer `executeWithRetry` loop in `DynamoDbClientImpl` / `S3ClientImpl` uses the classifier to gate retries: non-retryable errors throw immediately; retryable errors retry up to `tuning.{ddb,s3}.maxRetries` with exponential backoff. Loop bounds: `attempt <= maxRetries` ⇒ 1 initial + N retries.
- **OpenSearch**: `opensearch-js` `Client` receives `maxRetries` from `tuning.os.maxRetries` (default 3). `OsProcessor.withRetry` is classifier-gated; `ensureIndex` **fails the transfer** on retry-exhaustion (no silent continuation).

No custom token-bucket pacing — the AWS SDK's adaptive mode handles remote-signal-based backoff. See `project_rate_limits_todo.md` memory for the design history.
