# AI Agent Guidelines

This document is read by AI agents when working on this codebase. It describes the current architecture, hard-won decisions, and conventions that must be followed.

**This document is updated as the codebase evolves.** Treat anything that contradicts the current code as stale — the code is the source of truth.

---

## 1. Project at a glance

**Package:** `@webiny/data-transfer`.

**What it does:** a generic data-transfer tool for Webiny environments. The flagship use case is v5→v6 migration, but the infrastructure is storage-agnostic and transformer-optional — **"copy prod data into dev with zero transformation"** is a first-class use case.

**Runtime flow (when deployed):**

1. User writes a config file: `createDdbTransfer({ source, target, pipeline })` or `createOsTransfer(...)`.
2. CLI `transfer` command bootstraps a DI container, loads the named preset, spawns worker processes per segment.
3. Each worker runs one or more shards: scans source → for each record, first-match-wins pipeline runs: filters → transformers → each processor's `onEnd?` hook (sequential, array order) → commands accumulate in a shared shard buffer. At shard end, each processor's `execute()` drains its own keys from that buffer (sequential, array order). `Commands.unclaimedKeys()` surfaces commands no processor claimed.

**Read before big refactors:**

- `docs/design/generic-pipeline-framework.md` — long-term design (pipeline-centric model, merge groups keyed by scanner, first-match-wins).
- `docs/superpowers/specs/2026-04-18-*.md` — recent design docs (transformer-library, preset-migration).

---

## 2. Public API surface

Everything users import lives in `src/index.ts`. The surface is **infrastructure-only** — no built-in transformers or pipelines are re-exported. The package ships two built-in presets: **`v5-to-v6-ddb`** (full DDB + S3 migration) and **`v5-to-v6-os`** (OpenSearch companion table migration). `PresetLoader` scans `src/presets/` (resolved relative to its own `import.meta.url`, works from source or `node_modules/`) — convention is **filename = preset name**, drop a `.ts` file in there and it ships, no other code change. The authoring reference lives in `templates/presets/example.ts` (scaffolded into user projects by `init`).

- **Config builders:** `createDdbTransfer`, `createOsTransfer`
- **Env helpers:** `loadEnv` (dotenv loader), `fromEnv(name, default?)` (required string env, throws on missing), `numberFromEnv(name, default?)` (typed numeric, throws on parse failure). Empty string counts as missing in both — `.env`'s `KEY=` is almost always a forgotten value, not an intentional empty override.
- **AWS credential helpers:** re-exports from `@aws-sdk/credential-providers` so users don't need the direct dep. `fromAwsProfile` (= `fromIni`) binds an explicit profile from `~/.aws/credentials` — best for local dev where a stray env var shouldn't hijack auth. `fromAwsCredentialChain` (= `fromNodeProviderChain`) runs the AWS SDK default chain (env → ini → SSO → EC2/ECS IAM) — best for CI / cloud. `credentials` in config also accepts a literal `{accessKeyId, secretAccessKey, sessionToken?}`; the union is schema-validated at `createDdbTransfer` / `createOsTransfer` time.
- **Snapshot (debugging):** `config.debug.snapshot` (boolean or `{dir?, compress?}`) dumps per-record JSONL files at `<dir>/<pipeline>/segment-<n>.{source,post-transform,commands}.jsonl[.gz]` + `<dir>/dropped/segment-<n>.jsonl[.gz]`. Default dir: `.transfer/<runId>/snapshot`, gzipped. Opt-in, no-op when disabled — PipelineRunner depends on SnapshotWriter unconditionally so the hot path has no branching.
- **Log file (debugging):** `config.debug.logFile` (boolean or string). `true` → each process writes raw pino JSONL to `.transfer/<runId>/logs/<orchestrator|segment-N>.log` (per-process files so parallel appends can't interleave). String → shared path across all processes. Bootstrap resolves the path; `detectProcessKind()` reads `--segment N` from argv to distinguish workers from the orchestrator.
- **Transformer factories:** `createTransformer`, `createDdbTransformer`, `createOsTransformer`
- **Filter factory:** `createFilter` + `Filter` type
- **Scanner tokens:** `DdbScanner`, `OsScanner`
- **Processor tokens:** `DdbProcessor`, `OsProcessor`, `S3Processor` (slice-merging; see below)
- **Processor abstraction:** `Processor` — users implementing custom processors use this.
- **Pipeline construction:** `PipelineBuilderFactory` — injected into `preset.configure({...})` as `pipelineBuilderFactory`.
- **MigrationPreset type** + `PresetConfigureContext` (the `{runner, pipelineBuilderFactory, container}` arg bag).
- **Context types:** `BaseTransformContext`, `DdbTransformContext`, `OsTransformContext` (type aliases = base ∩ processor slices; see below)
- **Transformer type:** `Transformer` (namespace with `.Interface`)
- **Utility types:** `NonEmptyArray<T>` (for typed processor arrays)
- **Setup helper:** `initDataTransfer` + `InitDataTransferContext` (user-side custom DI wiring — see "setup.ts" below)

**Pipeline construction:** inside a preset's `configure({ runner, pipelineBuilderFactory, container })` callback, users call `pipelineBuilderFactory.create({ name, scanner, processors: [...] })`. `processors` is a `NonEmptyArray<ProcessorImpl>` — TS rejects empty arrays AND rejects processors whose slice keys collide (`DisjointKeys<...>`). Returns a typed `PipelineBuilder` whose `ctx` is `BaseTransformContext & (union of processor slices)`. Chain `.filter()` / `.use()` / `.beforeExecuteCommands()` / `.afterExecuteCommands()` in any order; `.build()` takes no arguments (terminal behavior comes from each processor's `onEnd?` hook). Pass the built pipeline to `runner.register(...pipelines)` (variadic, chainable, throws on duplicate name). The legacy `createPipeline` / `createDdbPipeline` / `createOsPipeline` factories were deleted on 2026-04-20; `runner.pipeline()` was moved to `PipelineBuilderFactory.create()` shortly after.

**User-side custom DI — `setup.ts`:** CLI looks for `setup.ts` next to the user's config file. If present, dynamic-imports its default export and awaits `fn({ container })` BEFORE `preset.configure({...})` runs. Use the `initDataTransfer` typed helper to export it. Optional — pure-config users skip the file entirely.

**Rule:** when adding something to `src/index.ts`, it must be infra (something a user building their own transformers/pipelines/presets genuinely needs). Built-ins stay internal until the transformer rewrite; re-exporting them encourages users to depend on examples that will change.

---

## 3. Project structure (current)

```
src/
├── cli.ts                    # Entry point — yargs router
├── bootstrap.ts              # Creates DI container, registers all features
├── index.ts                  # Public API (imported as @webiny/data-transfer)
├── base/                     # createAbstraction, createFeature, Result, BaseError,
│                             # formatError (CLI error formatter), isRetryableAwsError
│                             # (unified AWS retry classifier)
├── commands/                 # Self-registering CLI commands
│   ├── init/                 # Scaffolds a new transfer project from templates/
│   ├── run/                  # Main orchestrator ($0)
│   └── processSegment/       # Worker — calls PipelineRunner.run({ segment, totalSegments })
│                             # (storage-agnostic; OsProcessor.afterShard handles OS state)
├── domain/
│   ├── pipeline/             # Pipeline abstractions
│   │   ├── abstractions/
│   │   │   ├── Processor.ts  # extendContext? + onEnd? + execute + afterShard?; slice type parameter.
│   │   │   ├── Scanner.ts    # Scanner.Interface<TRecord, TShard>
│   │   │   ├── Hook.ts       # per-merge-group hook
│   │   │   └── Transformer.ts
│   │   ├── Pipeline.ts       # Immutable Pipeline — holds scanner + processors[] + filters + transformers + hooks.
│   │   ├── PipelineBuilder.ts# Fluent builder — ctx typed via EffectiveContext = BaseCtx ∧ MergeSlices<TProcessors>.
│   │   └── Filter.ts         # createFilter
│   └── transform/            # Primitives still used by runner + features
│       ├── types/            # BaseRecord (PK/SK/_et/_ct/_md/TYPE + index sig)
│       ├── commands/         # Commands (bag w/ claim tracking + unclaimedKeys) + PutRecord + S3Copy
│       ├── filters.ts        # byType, isCmsEntry, isFmFile, isOsBackgroundTask,
│       │                     # isOsMailerSettings, ... (filter predicates).
│       │                     # OS-specific filters check data.modelId (inside decompressed
│       │                     # payload) rather than the top-level modelId used by DDB filters.
│       └── Preset.ts         # MigrationPreset: { name, description, configure({runner, pipelineBuilderFactory, container}) }
├── tools/                    # Generic utilities
│   ├── Cache/ GzipCompression/ DirectoryTool/ FileTool/ Logger/
├── services/                 # External API wrappers
│   ├── DynamoDbClient/       # Source + Target; scan<T> is generic
│   ├── OpenSearchClient/     # OS mode only
│   └── S3Client/             # DDB mode only; has concurrency knob via tuning
├── features/                 # Domain logic combining tools + services
│   ├── DdbScanner/                  # AsyncIterable<BaseRecord> from DDB primary
│   ├── OsScanner/ OsRecordDecompressor/   # OS companion table + decompression
│   ├── DdbProcessor/                # slice: { putRecord }; onEnd auto-puts; execute via DdbExecutor
│   ├── OsProcessor/                 # slice: { putRecord }; onEnd auto-puts; execute = gzip +
│   │                                # ensureIndex + delegate to DdbExecutor
│   ├── S3Processor/                 # slice: { copyFile, getFile }; NO onEnd (no default); execute drains S3Copy
│   ├── DdbExecutor/                 # Shared primitive: PutRecord[] → TargetDynamoDbClient.batchPut.
│   │                                # DdbProcessor + OsProcessor both compose this.
│   ├── TouchedIndexes/              # per-worker singleton: index → original refresh_interval
│   ├── PipelineRunner/              # register(...) + run() + getProcessors(); per-record slice merge + onEnd; shard-end execute
│   ├── PipelineBuilderFactory/      # Stateless DI singleton; .create({name, scanner, processors}) → PipelineBuilder
│   ├── TransformContext/     # Single BaseTransformContextFactory; factory returns { ctx, commands }
│   ├── MigrationConfig/      # createDdbTransfer / createOsTransfer (Zod-validated)
│   ├── ModelProvider/        # Loads CMS model definitions from DB + modelsDir JSON files.
│   │                         # Accepted JSON shapes (auto-detected, mixed OK in same dir):
│   │                         #   single model:  { modelId, fields: [...], ... }
│   │                         #   array of models: [{ modelId, fields, ... }, ...]
│   │                         #   Webiny export:  { groups: [...], models: [...] }
│   │                         # Disambiguation guard: object must have fields[] to be treated
│   │                         # as a model definition (CMS entry records also have modelId but
│   │                         # no fields[] — this prevents entries from being loaded as models).
│   ├── TenantLocales/ PresetLoader/ WorkerSpawner/
│   └── TransferLifecycle/    # BeforeTransferHook / AfterTransferHook composites
├── transformers/             # 21 built-in transformers (user-land examples)
│   ├── createTransformer.ts createDdbTransformer.ts createOsTransformer.ts
│   ├── global/ cms/ file-manager/ folders/ mailer/ security/
│   │   └── (cms/ also has fieldUtils.ts, fieldVisitor.ts, lexicalRenderer.ts,
│   │       modelTypes.ts, addLiveField.ts, updateOsIndex.ts — helpers local to
│   │       CMS transformers; addLiveField uses ctx.cache + querySourceRecord;
│   │       updateOsIndex uses configurations.es from @webiny/api-headless-cms-ddb-es)
│   ├── cmsEntryTransformers.ts  # Shared stacks: cmsEntryTransformers (DDB) +
│   │                            # osCmsEntryTransformers (OS — no wrapInData, adds updateOsIndex).
│   │                            # addLiveField is NOT in either stack — applied explicitly only
│   │                            # on the CmsEntries pipeline (files cannot be published).
│   └── index.ts              # Top-level barrel
├── presets/                  # Built-in presets — auto-discovered by PresetLoader
│                             # (filename = preset name).
│                             # v5-to-v6-ddb: full DDB + S3 Webiny migration.
│                             # v5-to-v6-os: OpenSearch companion table migration.
│                             # example.ts excluded from discovery by exact filename match.
└── utils/
    ├── load-env.ts           # loadEnv(import.meta.url) — dotenv loader, public API
    └── fromEnv.ts            # fromEnv + numberFromEnv — public API, used in user configs
```

Dirs that are **gone** (deleted in the 2026-04-19 cleanup): `src/core/`, `src/database/`, `src/config/`, `src/storage/`, `src/opensearch/`, `src/models/`, `src/utils/{logger,tenants,record-guards,gzip-compression,field-visitor,LexicalRenderer}.ts`. The transformer-adjacent helpers that lived under `src/models/` and `src/utils/` now live in `src/transformers/cms/` (they're CMS-transformer-only). Don't expect to find them elsewhere.

---

## 4. Architecture patterns

### DI via `@webiny/di`

- `createAbstraction<T>(name)` → `Abstraction<T>` (has `.token: symbol`).
- `Abstraction.createImplementation({ implementation, dependencies })` → an Implementation class (`I & { __abstraction: A }`). **The Implementation class is NOT an Abstraction at runtime** — it has no `.token`. `container.resolve(ImplClass)` would fail, but `container.register(ImplClass)` works (reads abstraction via `Metadata`).
- For this reason, `PipelineBuilderFactory.create({ name, scanner, processors })` accepts Implementation classes (not just abstractions). It uses `new Metadata(impl).getAbstraction()` at runtime to recover the abstraction token, while the type system infers `TRecord` / `TContext` / `TShard` from the Impl class instance types.
- `runner.register(...pipelines: Pipeline<any, any, any>[])` widens the parameter type intentionally — TRecord is invariant in `Pipeline` (because `Filter<TRecord>` is contravariant), so a strict signature would force every caller to cast. The runner doesn't introspect type params at this boundary.

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

- **Merge group** = set of pipelines sharing the same scanner abstraction. Runner iterates one merge group at a time.
- **First-match-wins** per record: within a merge group, the first pipeline whose filters all pass is the one that runs. Subsequent pipelines skip that record.
- **Unmatched records are dropped per design**: if NO pipeline in the merge group accepts a record, it's skipped. Per-record log is at `debug` (noisy), but `runShard` emits an `info`-level summary at shard end: `"[<mergeGroupId> shard N/M] scanned X, transferred Y (pipeline-a=10, pipeline-b=3), dropped Z"` — so a prod run at the default log level surfaces the dropped count prominently. If users want exhaustive transfer, register a catch-all passthrough pipeline last.
- **Filter order matters**: register more-specific pipelines before catch-alls.
- **Blackhole pipelines** (`builder.blackhole()`): filters + transformers + `onEnd` run exactly as usual; the fold-to-shard step in `runRecord` is what's skipped, so every emitted command is dropped before any processor drains. Use for observe-only pipelines (validation, dry-run-one-pipeline, shadow runs). Snapshot still records source/post-transform/commands — diffing a blackholed pipeline's intended writes is the whole point. `PipelineConfig.blackhole` is `?: boolean`; `Pipeline.isBlackhole` getter normalizes missing → `false`.
- **Per-record `onEnd` hooks replace magic auto-put**: after filters + transformers run, the runner invokes each processor's `onEnd?(ctx)` sequentially in array order. `DdbProcessor.onEnd` and `OsProcessor.onEnd` call `ctx.putRecord(ctx.record)` via their slice helpers — so pipelines containing either get the "auto-put" behavior by virtue of the processor. `S3Processor` has no `onEnd` (no derivable per-record default). Pipelines with zero transformers still produce writes as long as a writer processor is in the list. See `src/features/PipelineRunner/PipelineRunner.ts:runRecord`.
- **Hooks**: per merge group. Before-hooks run (dedup'd by token, in registration order) before any shards. After-hooks run (dedup'd, in REVERSE order) after all shards succeed. After-hooks are SKIPPED on shard failure. Each hook gets `{ runId, mergeGroupId }`.

### Context surface (slice-merged)

`BaseTransformContext.Interface<TRecord>` (slim — target-agnostic) exposes:

- `record: TRecord` — mutable, transformers change this.
- `original: Readonly<TRecord>` — **frozen snapshot of the pre-transform record, always present**. Users may consume it for gate-checks, audits, etc. — do NOT remove even if no built-in code uses it.
- `addCommand(cmd: Command)` — push a command to the (internal) bag. Canonical primitive; slice helpers are sugar over it.
- `modelProvider`, `cache`, `logger` — shared singletons. Use `ctx.logger` instead of `console.*` inside transformers — it's bound to the current worker and respects the configured log level.
- `replace(newRecord)` — replaces `ctx.record`.
- `queryRecord<T>(pk, sk?)` — source-table lookup, generic return type, Promise-returning.

**Raw `commands` bag is NOT on the public ctx** — `addCommand` is the only public push path. The bag still exists internally for `Processor.execute(commands)` at shard end. `Commands.unclaimedKeys()` tracks keys whose commands nobody drained, used by the runner to warn-once.

**Each processor contributes a SLICE of helpers** via its `extendContext(base)` method. The runner spreads all processor slices over the base ctx per-record. Effective ctx = `BaseTransformContext ∧ MergeSlices<TProcessors>`. Slice key collision → TS rejects at the `pipelineBuilderFactory.create({...})` call site via `DisjointKeys<...>`.

Slice inventory:

- **`DdbProcessor` slice**: `putRecord(record)` → emits PutRecord targeting DDB primary.
- **`OsProcessor` slice**: `putRecord(record)` → emits PutRecord targeting OS DDB table (same key as DdbProcessor → mutually exclusive in one pipeline).
- **`S3Processor` slice**: `copyFile(src, tgt)`, `getFile(key)` → PushQueue S3Copy / sync read from source bucket.

Type aliases `DdbTransformContext` (= Base ∧ DdbProcessorSlice ∧ S3ProcessorSlice) and `OsTransformContext` (= Base ∧ OsProcessorSlice) are exported for transformer authors who want typed ctx parameters.

**Removed from context (do not reintroduce):** `executePipeline(pipeline, records)` — nested-pipeline helper, dropped 2026-04-19.

### Scanner / Processor / Executor

- **Scanner** = source iterator. Yields records per shard. `DynamoDbClient.scan<T>` is generic so scanners can narrow the raw row type.
- **Processor** = per-command-type unit implementing `Processor.Interface<TBase, TSlice>`. Has optional `extendContext(base) → slice` (context helpers), optional `onEnd(ctx) → void | Promise<void>` (per-record terminal hook, replaces legacy auto-put magic), `execute(commands) → Promise<void>` (drains its command keys), optional `afterShard({ segment, totalSegments }) → void | Promise<void>` (per-shard persistence hook for processors that carry state across the worker→orchestrator boundary — only OsProcessor implements it today, to write `<segment>-indexes.json`).
- Per-record orchestration: runner builds base ctx → spreads each processor's slice → applies filters → runs transformers → runs each processor's `onEnd?` SEQUENTIALLY IN ARRAY ORDER.
- Per-shard orchestration: each processor's `execute()` runs SEQUENTIALLY IN ARRAY ORDER. After all processors drain, runner checks `Commands.unclaimedKeys()` and warns once per unmatched key ("transformer pushed X but no processor drained X").
- **`DdbExecutor`** is a SHARED primitive (not a Processor) — `batchPut` against a target DDB table. Both `DdbProcessor.execute` and `OsProcessor.execute` compose it. OS adds gzip + ensureIndex preamble before delegating.
- **"Record carries everything"** is a house invariant — do NOT add pre-transform snapshot queues, metadata side-channels, or "executor derives X" logic. If transformers destroyed something a processor needs, users write a transformer that preps it.

### MigrationConfig tuning

Optional `tuning` section on `MigrationConfig`:

```typescript
tuning?: {
    ddb?: { maxRetries?: number; initialBackoffMs?: number };
    s3?:  { concurrency?: number; maxRetries?: number; initialBackoffMs?: number };
    os?:  { maxRetries?: number; retryScheduleMs?: number[]; gzipConcurrency?: number };
}
```

Fields flow to the respective client/executor; absent = module-level defaults. `BATCH_SIZE = 25` in DDB is AWS-enforced, NOT a user knob.

### AWS retry + error classification

All AWS-facing code shares one classifier: `src/base/isRetryableAwsError.ts` (duck-typed, no SDK import). Retry path per client:

- **DDB + S3**: AWS SDK clients are created with `retryMode: "adaptive"` (self-tuning token bucket inside the SDK). The outer `executeWithRetry` loop in `DynamoDbClientImpl` / `S3ClientImpl` uses the classifier to gate retries: non-retryable errors throw immediately; retryable errors retry up to `tuning.{ddb,s3}.maxRetries` with exponential backoff. Loop bounds: `attempt <= maxRetries` ⇒ 1 initial + N retries.
- **OpenSearch**: `opensearch-js` `Client` receives `maxRetries` from `tuning.os.maxRetries` (default 3). `OsProcessor.withRetry` is classifier-gated; `ensureIndex` **fails the transfer** on retry-exhaustion (no silent continuation).

No custom token-bucket pacing — the AWS SDK's adaptive mode handles remote-signal-based backoff. See `project_rate_limits_todo.md` memory for the design history.

---

## 5. Testing

- Tests live in `__tests__/` mirroring `src/` structure.
- **Shared containers**: `__tests__/containers/{ddb,os}.ts` expose `createDdbContainer({ sourceRecords?, modelsDir?, logLevel? })` / `createOsContainer(...)`. Use these — don't hand-roll DI containers in tests.
- **Mock clients**: `__tests__/services/DynamoDbClient/MockDynamoDbClient.ts` + `OpenSearchClient/MockOpenSearchClient.ts` + `S3Client/MockS3Client.ts`.
- **Transformer unit tests** use `__tests__/transformers/fakeContext.ts` → `makeFakeBaseContext<T>(record, overrides?)`. For DDB-specific fields, cast at the test site.
- **PipelineRunner tests** under `__tests__/features/PipelineRunner/` cover register dedup, multi-pipeline merge groups, shard slicing.
- **Pipeline dataflow integration** in `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` — Mock-client-based, exercises a zero-transformer passthrough case. Does NOT hit the AWS SDK.
- **Real-SDK integration tests** live under `__tests__/integration/` and run against a local **dynalite** HTTP server. Harness: `__tests__/integration/dynalite.ts` → `startDynalite()` returns `{ endpoint, port, stop() }`. Container: `createDdbIntegrationContainer({ endpoint, sourceTable, targetTable, segments?, useRealS3Client? })` wires the real `DynamoDbClientFeature`; `useRealS3Client: true` adds the real `S3ClientFeature` so tests can intercept via `aws-sdk-client-mock` (GetObject / CopyObject). See:
  - `dynalite.smoke.test.ts` — harness sanity-check.
  - `pipeline.dataTransfer.test.ts` — 4-record end-to-end (no preset).
  - `pipeline.bulkAndRetry.test.ts` — 10k faker records + SDK-middleware throttle injection against `BatchWriteCommand`.
  - `pipeline.realData.test.ts` — byte-exact roundtrip of 314 real v5 records (no preset).
  - `pipeline.preset.test.ts` — **golden-file correctness** of the full `v5-to-v6-ddb` preset over the same 314 records. Target deep-equaled against `__tests__/data/small-one.expected.json`. Regenerate via `UPDATE_EXPECTED=1 yarn test ...` after intentional preset/transformer changes and code-review the diff before committing. Frozen clock (`vi.useFakeTimers({toFake:["Date"]}) + vi.setSystemTime`) keeps `createMetadata`'s timestamps stable.

  Patterns + gotchas (ambient.d.ts naming, region-separation for source/target so `getDocumentClient`'s config-hash cache doesn't collide, `getInternalDocClient` private-field reach, S3 mocking via `aws-sdk-client-mock`, golden-file workflow) documented in memory `project_integration_tests.md`.

- `vitest.config.ts` excludes: **empty** (aside from `**/node_modules/**`). All excluded-legacy-tests from the old refactor were ported during Plan B.

Verification before any commit:

```bash
yarn format:fix    # oxfmt
yarn ts-check      # expect 0 errors
yarn test          # expect all green
git status         # include ALL modified files
```

---

## 6. Hard-won decisions (read before changing)

These are one-line summaries. Each links to a spec or PR if fuller context is needed.

- **Zero transformers must work** — infra supports pure data-transfer (prod→dev seeding). `PipelineBuilder.build()` never throws for missing `.filter()`; if the pipeline includes a processor with `onEnd` (e.g. `DdbProcessor`), the terminal put fires via that hook for every matching record.
- **Record carries everything** — processors + executors trust `ctx.record` at execute time; no side-channel queues or pre-transform snapshot passing. The OS refactor on 2026-04-19 made this explicit.
- **`ctx.original` always present** — frozen pre-transform snapshot, on every context, permanently. Don't remove even if no built-in code consumes it.
- **Transformers + presets are user-land** — the `src/transformers/` files are examples. They will be revisited when the core infra is stable. Don't design the infra around them; if a refactor breaks them, update the examples or flag for rewrite. The authoring reference lives in `templates/presets/example.ts`. The package ships one built-in preset (`v5-to-v6-ddb`); users may otherwise pass a path to their own preset file.
- **First-match-wins + scanner-keyed merge groups** — registration order is semantic. More-specific pipelines before catch-alls. Different scanners = different merge groups.
- **Impl-class-as-token accepted** — `pipelineBuilderFactory.create({ scanner: DdbScanner, processors: [DdbProcessor, S3Processor] })` works even though each token is an Implementation (not an Abstraction). Runtime extracts abstraction via `Metadata`; the type system infers `TRecord` from scanner + slice union from processors. Don't reintroduce an "abstraction-only" signature.
- **PutRecord target is baked in by the processor** — `ctx.putRecord(record)` (slice helper contributed by `DdbProcessor` or `OsProcessor`) emits a PutRecord command with the target table resolved by that processor's config. Transformers shouldn't need to know table names.
- **Unified AWS retry classifier** — every outer retry loop goes through `isRetryableAwsError` (see `src/base/isRetryableAwsError.ts`). The SDK clients use `retryMode: "adaptive"` for internal self-tuning. Don't introduce per-client classifiers or hardcoded per-second rate caps — considered and rejected (limits vary per account).
- **OS `ensureIndex` fails the transfer on retry-exhaustion** — the old swallow-and-continue path masked real schema / mapping bugs. If index prep exhausts retries, the whole run aborts so the user sees and fixes it.
- **`@webiny/aws-sdk` wrapper** — AWS imports come from `@webiny/aws-sdk/client-{dynamodb,s3}` + helpers `getDocumentClient`, `createS3Client`. Don't import `@aws-sdk/client-*` directly. One exception: `QueryCommand` still comes from `@aws-sdk/lib-dynamodb` because the wrapper's re-export expects pre-marshalled AttributeValues — flagged for Webiny team to fix.
- **Slice-merging processors** (2026-04-20) — pipelines take `processors: NonEmptyArray<ProcessorImpl>`. Each processor contributes a **slice** of context helpers (via `extendContext(base)`), owns a **terminal hook** (`onEnd?`), and **drains its own commands** (`execute(commands)`). Slice-key collision = mutually exclusive in a pipeline (DdbProcessor + OsProcessor both contribute `putRecord` → TS rejects); `DisjointKeys<>` catches at compile time. Slice + execute run sequentially in array order (don't hammer services). `Commands.unclaimedKeys()` reports commands no processor drained. **No more god-processors**; `DdbProcessor` writes DDB records, `S3Processor` copies S3 objects, `OsProcessor` writes OS records (gzip + ensureIndex + delegate to shared `DdbExecutor`). Adding a new command type = new processor file + add to relevant pipelines. Shared primitive `DdbExecutor` (the raw batchPut) is composed, not a Processor.
  - **Command-key coupling**: `DdbProcessor` and `OsProcessor` both drain `PutRecord.key`. If both ever land in one pipeline they'd double-write (same record to DDB and OS). Prevented at compile time via `DisjointKeys<>` (both contribute the `putRecord` slice key); at runtime via a `storage`-mode guard inside each processor's `extendContext` (throws if the wrong mode). The coupling is documented on `src/domain/transform/commands/PutRecord.ts` so future command-sharing scenarios remain visible.
- **Pipeline construction lives in a dedicated factory** — `PipelineBuilderFactory.create({ name, scanner, processors })` is the only entry point. Originally lived on the runner (`runner.pipeline(...)`), extracted 2026-04-20 because construction isn't runner state. Runner's public surface shrank to `register(...) + run(opts?) + getProcessors()`. `.create()` infers `TRecord` from scanner + `EffectiveContext = BaseCtx ∧ MergeSlices<TProcessors>` from processors. `.build()` takes no args. The factory is a stateless DI singleton injected into `preset.configure({...})`. Don't reintroduce a `pipeline()` method on the runner.
- **`preset.configure` takes an object arg bag** — signature is `configure({ runner, pipelineBuilderFactory, container }): void | Promise<void>`. Async returns allowed. `container` exposed so users can resolve custom services they registered in `setup.ts`. Object shape is forward-compat — add fields without breaking existing presets.
- **User-side custom DI via `setup.ts`** — CLI looks for `setup.ts` sibling of the config file; loads `await fn({ container })` BEFORE `preset.configure({...})`. Use the `initDataTransfer` typed helper. Optional — pure-config users skip it. Canonical location for registering user-authored processors, transformers, or overriding defaults. Don't reintroduce auto-registration-via-inspection magic.
- **Built-in presets are auto-discovered** — `PresetLoader` scans `src/presets/` (relative to its own `import.meta.url`, so dev / installed layouts both work). Convention: **filename === preset name**. `example.ts` is excluded by exact filename match. Adding a built-in is a file drop, not a code change. Don't reintroduce a hardcoded `BUILT_IN_PRESETS` map or a "register your preset here" registry.
- **`v5-to-v6-os` pipeline ordering is load-bearing** — `BackgroundTasks` and `MailerSettings` are blackholed and registered BEFORE `CmsEntries` because both are CMS entries in the OS table (same `TYPE` prefix `cms.entry.*`) and would otherwise be claimed by the catch-all. `FileManagerFiles` must also precede `CmsEntries` for the same reason. Mailer settings are blackholed because v6 stores them in the KV store — the DDB preset handles that migration; the OS record has no v6 target.
- **DDB parallel scan guarantees same-PK records land in the same segment** — the scan divides by hash range, so all revisions of the same CMS entry (L, P, REV#...) always go to the same worker. This means an in-process `ctx.cache` keyed by PK is sufficient for per-entry deduplication — no cross-worker shared cache is needed. Queries for sibling records within the same entry are deduplicated by the cache; the first record encountered does the query, subsequent siblings hit the cache.
- **`addLiveField` cache+sentinel pattern** — the transformer uses `ctx.cache` keyed by `ctx.original.PK`. Sentinel value `-1` means "queried, no published revision found" — avoids re-querying. P records skip the query entirely (they ARE the published revision) and populate the cache for siblings. The sentinel must be non-zero (versions start at 1) and truthy (so `if (cached)` correctly identifies a prior miss). Don't use `null` or `undefined` as the sentinel — those are cache misses.
- **`isModel` guard requires `fields[]`** — `ModelProvider.extractModels` distinguishes model definitions from CMS entry records by requiring `Array.isArray(value.fields)`. Both have a `modelId` field, but only model definitions carry `fields[]`. Without this guard, CMS entry records (which have `modelId` as a reference field) would be loaded as models and crash downstream transformers (`visitFields` would receive `undefined` instead of an array).
- **OS transformer context typing** — `createOsTransformer` binds `OsTransformContext.Interface<OsScanner.Record>`. `OsScanner.Record` has non-optional `index: string` and `data: Record<string, unknown>` — both are always present (OsScanner skips records where decompression fails). Don't add absent-data guards in OS transformers; trust the scanner contract. Test stubs for OS transformers use `makeFakeOsContext` from `__tests__/transformers/fakeContext.ts`.
- **Processors persist their own state via `afterShard`** (2026-04-21) — the previous `getShardState()` + handler-side collection/serialization was the worker handler pulling state OUT of processors, then writing it. `afterShard({ segment, totalSegments })` inverts the direction: the processor owns its state AND its persistence end-to-end, injecting `TransferContext` / `FileTool` / `DirectoryTool` directly. The `processOsSegment` handler is now identical to `processSegment` (bootstrap → configure → run). Runner fires `afterShard` sequentially in array order after `execute()`, before `warnUnclaimedKeys`. Optional hook — DdbProcessor / S3Processor skip it (no cross-boundary state). When `touchedIndexes` is empty, OsProcessor writes nothing — `EnableRefreshHook` tolerates a missing `.transfer/<runId>/` dir. Don't reintroduce a handler-side state-collection loop.

---

## 7. Known open work (in priority order)

### Branch `bruno/feat/di-features` (unmerged)

The slice-merging-processors refactor landed here in April 2026 plus follow-ups (afterShard hook, ctx-by-reference runner fix, unified process-segment command, dynalite-backed integration suite, v5-to-v6-ddb golden-file preset test). Tests green, ts-check clean, oxfmt clean. Ready to merge but NOT yet on `main`.

### Branch `bruno/feat/os-transfer` (unmerged)

Built on top of `bruno/feat/di-features`. Adds: `v5-to-v6-os` built-in preset (`OsScanner` + `OsProcessor`, 4 pipelines with correct first-match-wins ordering), `addLiveField` transformer (DDB source query + `ctx.cache` + `-1` sentinel), `updateOsIndex` transformer (uses `configurations.es` from `@webiny/api-headless-cms-ddb-es`), `osCmsEntryTransformers` stack, OS-specific filters (`isOsBackgroundTask`, `isOsMailerSettings`), `ModelProvider` multi-format JSON support (Webiny export / array / single model), `fakeContext` fixes (record now cloned on create; default real `Map`-backed cache; `makeFakeOsContext`). Tests green, ts-check clean, oxfmt clean. NOT yet on `main`.

### Broader open work

1. **npm publish story** — the package isn't on npm yet. Needs version strategy, publish script, CI. `npx @webiny/data-transfer init` in the README won't work until this lands.
2. **Init scaffolding smoke** — `init` scaffolds from `templates/`. All three scaffold files exist (`stampMigratedAt.ts`, `presets/example.ts`, `ddb.transfer.config.ts` + optional `setup.ts`). Do a smoke run to verify a scaffolded project compiles + runs against a live sandbox.
3. **End-to-end AWS smoke** — no test has ever run against real AWS. Day-long sandbox exercise. Catches real issues mocks can't.
4. **Public API audit pass (post-refactor)** — `src/index.ts` grew with `Processor`, `NonEmptyArray`, `InitDataTransferContext`, `BaseTransformContext`, `DdbTransformContext`, `OsTransformContext`, `initDataTransfer`. Re-audit before publish to confirm the surface matches user-authoring intent (e.g., should `DdbTransformContext` stay as-is or split into the narrower `BaseTransformContext & DdbProcessorSlice` for users who don't include S3Processor?).

---

## 8. Commands / running the tool

- Install: `yarn install`
- Format: `yarn format:fix` / `yarn format:check`
- Type-check: `yarn ts-check`
- Test: `yarn test` (or `yarn test:coverage`)
- Scaffold a project: `npx @webiny/data-transfer init my-transfer-folder`
- **Dry-run the preset against real AWS (dev use, from this repo):**
  ```bash
  cp projects/v5-to-v6/.env.example projects/v5-to-v6/.env
  # edit .env — set region, DDB/S3/OS tables, optional profiles
  yarn dev --config=./projects/v5-to-v6/ddb.transfer.config.ts  # DDB + S3 first
  yarn dev --config=./projects/v5-to-v6/os.transfer.config.ts   # OS table second
  ```
  Run DDB transfer first, then OS — they don't share state. `projects/v5-to-v6/ddb.transfer.config.ts` drives `v5-to-v6-ddb`; `os.transfer.config.ts` drives `v5-to-v6-os`. Both use env vars from `.env` (shared file). `.env*` is gitignored. The OS config additionally needs `SOURCE_OS_TABLE`, `TARGET_OS_TABLE`, `TARGET_OS_ENDPOINT`, and optionally `MODELS_DIR` (defaults to `./models`).
- **Re-drive specific shards after a partial failure:** `yarn dev --config=... --segments=1,3` runs only the listed indices. The workers still receive `--total=<pipeline.segments>`, so each shard scans the same slice as in a full run. Parsing + validation live in `src/commands/run/segmentsFilter.ts`.

---

## 9. Memory files

Persistent user/project memory for agents lives in `~/.claude/projects/.../memory/` and is indexed by `MEMORY.md`. Key entries:

- `user_role.md` — Bruno, senior Webiny engineer.
- `feedback_*` files — house style rules (braces, access modifiers, namespace types, no inline structural types, camelCase file names, no reflect-metadata imports, terse responses, commit per section).
- `feedback_no_transformers_required.md` — zero-transformer rule.
- `feedback_keep_ctx_original.md` — ctx.original stays.
- `project_*` files — project context and open TODOs.

When in doubt about a preference, check `MEMORY.md` first. When adding a new hard-won decision, save it to a memory file AND surface it in section 6 of this doc.
