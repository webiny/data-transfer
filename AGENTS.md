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
3. Each worker runs one or more shards: scans source → pipeline chain (filter + transformer list + auto-put) → processor buffers commands → executor writes to target.

**Read before big refactors:**

- `docs/design/generic-pipeline-framework.md` — long-term design (pipeline-centric model, merge groups keyed by scanner, first-match-wins).
- `docs/superpowers/specs/2026-04-18-*.md` — recent design docs (transformer-library, preset-migration).

---

## 2. Public API surface

Everything users import lives in `src/index.ts`. The surface is **infrastructure-only** — no built-in transformers, pipelines, or presets are re-exported. The package ships no built-in presets today; `PresetLoader` does scan `src/presets/` (resolved relative to its own `import.meta.url`, works from source or `node_modules/`) — convention is **filename = preset name**, drop a `.ts` file in there and it ships, no other code change. `src/presets/example.ts` is the canonical reference for "how to write a preset" and is excluded from discovery by exact filename match.

- **Config builders:** `createDdbTransfer`, `createOsTransfer`, `loadEnv`
- **Transformer factories:** `createTransformer`, `createDdbTransformer`, `createOsTransformer`
- **Filter factory:** `createFilter` + `Filter` type
- **Scanner / processor tokens:** `DdbScanner`, `DdbProcessor`, `OsScanner`, `OsProcessor`
- **MigrationPreset type**
- **Context types:** `BaseTransformContext`, `DdbTransformContext`, `OsTransformContext`
- **Transformer type:** `Transformer` (namespace with `.Interface`)

**Pipeline construction:** users call `runner.pipeline({ name, scanner, processor })` inside their preset's `configure(runner)` callback. Returns a typed `PipelineBuilder` (record + context types inferred from the scanner/processor pair). Chain `.filter()` / `.use()` / `.beforeExecuteCommands()` / `.afterExecuteCommands()` in any order, then `.build()` for an immutable `Pipeline`. Pass to `runner.register(...pipelines)` (variadic, chainable, throws on duplicate name). The legacy `createPipeline` / `createDdbPipeline` / `createOsPipeline` factories were deleted on 2026-04-20.

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
│   ├── processSegment/       # DDB worker — calls PipelineRunner.run({ segment, totalSegments })
│   └── processOsSegment/     # OS worker — calls PipelineRunner.run({ segment, totalSegments })
├── domain/
│   ├── pipeline/             # Pipeline abstractions
│   │   ├── abstractions/     # Scanner, Processor, Hook, Transformer
│   │   ├── Pipeline.ts       # Immutable Pipeline (returned by builder.build())
│   │   ├── PipelineBuilder.ts# Fluent builder — typed via runner.pipeline(); .filter() + .use() chain freely
│   │   └── Filter.ts         # createFilter
│   └── transform/            # Primitives still used by runner + features
│       ├── types/            # BaseRecord (PK/SK/_et/_ct/_md/TYPE + index sig)
│       ├── commands/         # Commands + PutRecord + S3Copy
│       ├── filters.ts        # byType, isCmsEntry, isFmFile, ... (filter predicates)
│       └── Preset.ts         # MigrationPreset interface (name, description, configure(runner))
├── tools/                    # Generic utilities
│   ├── Cache/ GzipCompression/ DirectoryTool/ FileTool/ Logger/
├── services/                 # External API wrappers
│   ├── DynamoDbClient/       # Source + Target; scan<T> is generic
│   ├── OpenSearchClient/     # OS mode only
│   └── S3Client/             # DDB mode only; has concurrency knob via tuning
├── features/                 # Domain logic combining tools + services
│   ├── DdbScanner/ DdbProcessor/
│   ├── OsScanner/ OsProcessor/ OsRecordDecompressor/
│   ├── PutDynamoDbRecordExecutor/   # PutRecord[] → TargetDynamoDbClient.batchPut
│   ├── S3CopyExecutor/              # S3Copy[]   → TargetS3Client.batchCopy
│   ├── PutOsDynamoDbRecordExecutor/ # gzip + ensureIndex + delegate to PutDdb
│   ├── TouchedIndexes/              # per-worker singleton: index → original refresh_interval
│   ├── PipelineRunner/       # Runs merge groups; auto-puts ctx.record per record
│   ├── TransformContext/     # Ddb + Os context factories; exposes ctx.original (frozen)
│   ├── MigrationConfig/      # createDdbTransfer / createOsTransfer (Zod-validated)
│   ├── ModelProvider/ TenantLocales/ PresetLoader/ WorkerSpawner/
│   └── TransferLifecycle/    # BeforeTransferHook / AfterTransferHook composites
├── transformers/             # 19 built-in transformers (user-land examples)
│   ├── createTransformer.ts createDdbTransformer.ts createOsTransformer.ts
│   ├── global/ cms/ file-manager/ folders/ mailer/ security/
│   │   └── (cms/ also has fieldUtils.ts, fieldVisitor.ts, lexicalRenderer.ts,
│   │       modelTypes.ts — helpers local to CMS transformers)
│   └── index.ts              # Top-level barrel
├── presets/                  # Built-in presets — auto-discovered by PresetLoader
│                             # (filename = preset name). Empty today aside from
│                             # example.ts (canonical reference; excluded from
│                             # discovery by exact filename match).
└── utils/
    └── load-env.ts           # loadEnv(import.meta.url) — exposed as public API
```

Dirs that are **gone** (deleted in the 2026-04-19 cleanup): `src/core/`, `src/database/`, `src/config/`, `src/storage/`, `src/opensearch/`, `src/models/`, `src/utils/{logger,tenants,record-guards,gzip-compression,field-visitor,LexicalRenderer}.ts`. The transformer-adjacent helpers that lived under `src/models/` and `src/utils/` now live in `src/transformers/cms/` (they're CMS-transformer-only). Don't expect to find them elsewhere.

---

## 4. Architecture patterns

### DI via `@webiny/di`

- `createAbstraction<T>(name)` → `Abstraction<T>` (has `.token: symbol`).
- `Abstraction.createImplementation({ implementation, dependencies })` → an Implementation class (`I & { __abstraction: A }`). **The Implementation class is NOT an Abstraction at runtime** — it has no `.token`. `container.resolve(ImplClass)` would fail, but `container.register(ImplClass)` works (reads abstraction via `Metadata`).
- For this reason, `runner.pipeline({ name, scanner, processor })` accepts Implementation classes (not just abstractions). It uses `new Metadata(impl).getAbstraction()` at runtime to recover the abstraction token, while the type system infers `TRecord` / `TContext` / `TShard` from the Impl class instance types.
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
- **Filter order matters**: register more-specific pipelines before catch-alls.
- **Auto-put**: after the transformer chain runs, the runner calls `ctx.putRecord(ctx.record)` automatically. Pipelines with zero transformers still produce writes. See `src/features/PipelineRunner/PipelineRunner.ts:runShard`.
- **Hooks**: per merge group. Before-hooks run (dedup'd by token, in registration order) before any shards. After-hooks run (dedup'd, in REVERSE order) after all shards succeed. After-hooks are SKIPPED on shard failure. Each hook gets `{ runId, mergeGroupId }`.

### Context surface

`BaseTransformContext.Interface<TRecord>` exposes:

- `record: TRecord` — mutable, transformers change this.
- `original: Readonly<TRecord>` — **frozen snapshot of the pre-transform record, always present**. Users may consume it for gate-checks, audits, etc. — do NOT remove even if no built-in code uses it.
- `commands: Commands` — the command buffer.
- `modelProvider`, `cache` — shared singletons.
- `replace(newRecord)` — replaces `ctx.record`.
- `putRecord(record)` — emits a PutRecord command (target table baked in by factory).
- `queryRecord(pk, sk?)` — source-table lookup, Promise-returning.

DDB context adds: `copyFile(srcKey, tgtKey)` and `getFile(key)` (S3 helpers).

**Removed from context (do not reintroduce):** `executePipeline(pipeline, records)` — nested-pipeline helper, dropped 2026-04-19 for zero live consumers.

### Scanner / Processor / Executor

- **Scanner** = source iterator. Yields records of some shape per shard. `DynamoDbClient.scan<T>` is generic so scanners can narrow the raw row type.
- **Processor** = context factory + command dispatcher. `createContext(record)` makes a ctx; `execute(commands)` picks commands from the `Commands` bag by key and dispatches each subset to the owning per-command executor. Unknown keys warn once per key per worker (dedupe via a `Set<string>` on the processor instance).
- **Executor** = one per command type per target. `PutDynamoDbRecordExecutor` writes `PutRecord[]` to DDB. `S3CopyExecutor` runs `S3Copy[]` through `TargetS3Client.batchCopy`. `PutOsDynamoDbRecordExecutor` layers gzip + `ensureIndex` over a delegated `PutDynamoDbRecordExecutor`. Each trusts the record entirely — every field on `ctx.record` (PK, SK, GSI_TENANT, index, \_et/\_ct/\_md, etc.) lands on target verbatim; the only transformation is gzip for OS. Retry / classifier / `retryMode:"adaptive"` live on the underlying clients.
- **"Record carries everything"** is a house invariant — do NOT add pre-transform snapshot queues, metadata side-channels, or "executor derives X" logic. If transformers destroyed something the executor needs, users write a transformer that preps it. See the 2026-04-19 `refactor(os)` commit for the canonical simplified shape.

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
- **OpenSearch**: `opensearch-js` `Client` receives `maxRetries` from `tuning.os.maxRetries` (default 3). `OsCommandExecutor.withRetry` is classifier-gated; `ensureIndex` now **fails the transfer** on retry-exhaustion (no silent continuation).

No custom token-bucket pacing — the AWS SDK's adaptive mode handles remote-signal-based backoff. See `project_rate_limits_todo.md` memory for the design history.

---

## 5. Testing

- Tests live in `__tests__/` mirroring `src/` structure.
- **Shared containers**: `__tests__/containers/{ddb,os}.ts` expose `createDdbContainer({ sourceRecords?, modelsDir?, logLevel? })` / `createOsContainer(...)`. Use these — don't hand-roll DI containers in tests.
- **Mock clients**: `__tests__/services/DynamoDbClient/MockDynamoDbClient.ts` + `OpenSearchClient/MockOpenSearchClient.ts` + `S3Client/MockS3Client.ts`.
- **Transformer unit tests** use `__tests__/transformers/fakeContext.ts` → `makeFakeBaseContext<T>(record, overrides?)`. For DDB-specific fields, cast at the test site.
- **PipelineRunner tests** under `__tests__/features/PipelineRunner/` cover register dedup, multi-pipeline merge groups, shard slicing.
- **End-to-end integration** in `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` — includes a zero-transformer passthrough case.
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

- **Zero transformers must work** — infra supports pure data-transfer (prod→dev seeding). `PipelineBuilder.build()` never throws for missing `.filter()`; runner auto-puts when transformer chain is empty.
- **Record carries everything** — processors + executors trust `ctx.record` at execute time; no side-channel queues or pre-transform snapshot passing. The OS refactor on 2026-04-19 made this explicit.
- **`ctx.original` always present** — frozen pre-transform snapshot, on every context, permanently. Don't remove even if no built-in code consumes it.
- **Transformers + presets are user-land** — the `src/transformers/` files and `src/presets/example.ts` are examples. They will be revisited when the core infra is stable. Don't design the infra around them; if a refactor breaks them, update the examples or flag for rewrite. The package no longer ships any built-in preset; users always provide a path to their own preset file.
- **First-match-wins + scanner-keyed merge groups** — registration order is semantic. More-specific pipelines before catch-alls. Different scanners = different merge groups.
- **Impl-class-as-token accepted** — `runner.pipeline({ scanner: DdbScanner, processor: DdbProcessor })` works even though `DdbScanner` is an Implementation (not an Abstraction). Runtime extracts the abstraction via `Metadata`; the type system infers `TRecord` / `TContext` / `TShard` from the Impl class instance types. Don't reintroduce an "abstraction-only" signature.
- **PutRecord target is baked in** — `ctx.putRecord(record)` emits a PutRecord command with the target table resolved by the context factory. Transformers shouldn't need to know table names.
- **Unified AWS retry classifier** — every outer retry loop goes through `isRetryableAwsError` (see `src/base/isRetryableAwsError.ts`). The SDK clients use `retryMode: "adaptive"` for internal self-tuning. Don't introduce per-client classifiers or hardcoded per-second rate caps — considered and rejected (limits vary per account).
- **OS `ensureIndex` fails the transfer on retry-exhaustion** — the old swallow-and-continue path masked real schema / mapping bugs. If index prep exhausts retries, the whole run aborts so the user sees and fixes it.
- **`@webiny/aws-sdk` wrapper** — AWS imports come from `@webiny/aws-sdk/client-{dynamodb,s3}` + helpers `getDocumentClient`, `createS3Client`. Don't import `@aws-sdk/client-*` directly. One exception: `QueryCommand` still comes from `@aws-sdk/lib-dynamodb` because the wrapper's re-export expects pre-marshalled AttributeValues — flagged for Webiny team to fix.
- **One executor per command type** — each command-type executor is single-responsibility (`PutDynamoDbRecordExecutor`, `S3CopyExecutor`, `PutOsDynamoDbRecordExecutor`). Processors own dispatch + unknown-key warnings. Adding a new command = adding a new executor without touching existing ones. `PutOsDynamoDbRecordExecutor` composes `PutDynamoDbRecordExecutor` for the final DDB write; it does NOT duplicate put logic. Cross-cutting shard state (e.g. `TouchedIndexes`) lives in dedicated DI singletons, not on the processor.
- **Pipeline construction lives on the runner** — `runner.pipeline({ name, scanner, processor })` is the only entry point. The deleted factory triad (`createPipeline` / `createDdbPipeline` / `createOsPipeline`) drove users through three near-identical functions and split type inference across config + register time. The runner-centric API infers `TRecord` / `TContext` / `TShard` from the Impl class pair at construction. `.build()` is explicit and type-enforced (returns immutable `Pipeline`); `runner.register(...)` is variadic, chainable, and throws on duplicate names. Multiple `.filter()` calls AND-compose regardless of position; `.use()` insertion order is preserved for transformer execution. Don't reintroduce a standalone factory.
- **Built-in presets are auto-discovered** — `PresetLoader` scans `src/presets/` (relative to its own `import.meta.url`, so dev / installed layouts both work). Convention: **filename === preset name**. `example.ts` is excluded by exact filename match. Adding a built-in is a file drop, not a code change. Don't reintroduce a hardcoded `BUILT_IN_PRESETS` map or a "register your preset here" registry.

---

## 7. Known open work (in priority order)

1. **npm publish story** — the package isn't on npm yet. Needs version strategy, publish script, CI. `npx @webiny/data-transfer init` in the README won't work until this lands.
2. **Init scaffolding smoke** — `init` scaffolds from `templates/`. `templates/transformers/stampMigratedAt.ts`, `templates/presets/example.ts`, `templates/projects/example/custom.transfer.config.ts` exist now. Do a smoke run to verify a scaffolded project compiles + runs against a live sandbox.
3. **End-to-end AWS smoke** — no test has ever run against real AWS. Day-long sandbox exercise. Catches real issues mocks can't.

---

## 8. Commands / running the tool

- Install: `yarn install`
- Format: `yarn format:fix`
- Type-check: `yarn ts-check`
- Test: `yarn test` (or `yarn test:coverage`)
- Scaffold a project: `npx @webiny/data-transfer init my-transfer-folder`
- Run a transfer: `yarn transfer --config=./projects/example/ddb.transfer.config.ts`

---

## 9. Memory files

Persistent user/project memory for agents lives in `~/.claude/projects/.../memory/` and is indexed by `MEMORY.md`. Key entries:

- `user_role.md` — Bruno, senior Webiny engineer.
- `feedback_*` files — house style rules (braces, access modifiers, namespace types, no inline structural types, camelCase file names, no reflect-metadata imports, terse responses, commit per section).
- `feedback_no_transformers_required.md` — zero-transformer rule.
- `feedback_keep_ctx_original.md` — ctx.original stays.
- `project_*` files — project context and open TODOs.

When in doubt about a preference, check `MEMORY.md` first. When adding a new hard-won decision, save it to a memory file AND surface it in section 6 of this doc.
