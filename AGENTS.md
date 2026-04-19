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

Everything users import lives in `src/index.ts`:

- **Config builders:** `createDdbTransfer`, `createOsTransfer`, `loadEnv`
- **Transformer factories:** `createTransformer`, `createDdbTransformer`, `createOsTransformer`
- **Pipeline factories:** `createPipeline`, `PipelineDefinition`, `createDdbPipeline`, `createOsPipeline`
- **Filter factory:** `createFilter` _(re-exported from `domain/pipeline`)_
- **Context types:** `BaseTransformContext`, `DdbTransformContext`, `OsTransformContext`
- **Transformer type:** `Transformer` (namespace with `.Interface`)
- **Built-in transformers:** 19 named exports grouped by domain (global / cms / file-manager / folders / mailer / security) — considered **user-land examples**, will be rewritten when the rest of the infra is stable.
- **Built-in pipeline definitions:** `cmsEntryPipeline`, `cmsModelPipeline`, `fmFilePipeline` (DDB), plus more internal ones under `src/presets/v5-to-v6/pipelines/` (not all publicly exported).

When tightening the public surface: audit `src/index.ts` line-by-line before shipping.

---

## 3. Project structure (current)

```
src/
├── cli.ts                    # Entry point — yargs router
├── bootstrap.ts              # Creates DI container, registers all features
├── index.ts                  # Public API (imported as @webiny/data-transfer)
├── base/                     # createAbstraction, createFeature, Result, BaseError
├── commands/                 # Self-registering CLI commands
│   ├── init/                 # Scaffolds a new transfer project from templates/
│   ├── run/                  # Main orchestrator ($0)
│   ├── processSegment/       # DDB worker — CURRENTLY STUBBED (throws)
│   └── processOsSegment/     # OS worker — CURRENTLY STUBBED (throws)
├── domain/
│   ├── pipeline/             # New (post-Plan-A) pipeline abstractions
│   │   ├── abstractions/     # Scanner, Processor, Hook, Transformer
│   │   ├── Pipeline.ts       # Pipeline class (filters + transformerFns + hooks)
│   │   ├── PipelineBuilder.ts# Fluent builder; .filter() and .use() BOTH optional
│   │   ├── Filter.ts         # createFilter
│   │   ├── createPipeline.ts # PipelineDefinition + createPipeline (accepts Abstraction | impl class)
│   │   ├── createDdbPipeline.ts
│   │   └── createOsPipeline.ts
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
│   ├── DdbScanner/ DdbProcessor/ DdbCommandExecutor/
│   ├── OsScanner/ OsProcessor/ OsCommandExecutor/ OsRecordDecompressor/
│   ├── PipelineRunner/       # Runs merge groups; auto-puts ctx.record per record
│   ├── TransformContext/     # Ddb + Os context factories; exposes ctx.original (frozen)
│   ├── MigrationConfig/      # createDdbTransfer / createOsTransfer (Zod-validated)
│   ├── ModelProvider/ TenantLocales/ PresetLoader/ WorkerSpawner/
│   └── TransferLifecycle/    # BeforeTransferHook / AfterTransferHook composites
├── transformers/             # 19 built-in transformers (user-land examples)
│   ├── createTransformer.ts createDdbTransformer.ts createOsTransformer.ts
│   ├── global/ cms/ file-manager/ folders/ mailer/ security/
│   └── index.ts              # Top-level barrel
├── presets/                  # Built-in presets (v5-to-v6-ddb, v5-to-v6-os)
│   └── v5-to-v6/pipelines/   # 9 pipeline definition files (camelCase)
├── models/                   # ModelField / Template / field-utils (used by CMS transformers)
└── utils/
    ├── LexicalRenderer.ts    # Used by transformRichText
    ├── field-visitor.ts      # Used by several CMS transformers
    ├── gzip-compression.ts   # Legacy gzip helper — tools/GzipCompression/ is the DI version
    └── load-env.ts           # loadEnv(import.meta.url) — exposed as public API
```

Dirs that are **gone** (deleted in the 2026-04-19 cleanup): `src/core/`, `src/database/`, `src/config/`, `src/storage/`, `src/opensearch/`, `src/models/model-provider.ts`, `src/utils/{logger,tenants,record-guards}.ts`. Don't expect to find them.

---

## 4. Architecture patterns

### DI via `@webiny/di`

- `createAbstraction<T>(name)` → `Abstraction<T>` (has `.token: symbol`).
- `Abstraction.createImplementation({ implementation, dependencies })` → an Implementation class (`I & { __abstraction: A }`). **The Implementation class is NOT an Abstraction at runtime** — it has no `.token`. `container.resolve(ImplClass)` would fail, but `container.register(ImplClass)` works (reads abstraction via `Metadata`).
- For this reason, `PipelineDefinition.register(runner, scannerTokenOrImpl, processorTokenOrImpl)` accepts **either** an Abstraction or an Implementation class — `createPipeline` resolves the abstraction via `Metadata.getAbstraction()` at runtime. See `src/domain/pipeline/createPipeline.ts`.
- Similarly, `PipelineRunner.register` is generic over `Pipeline<TRecord, TContext, TShard>` — narrow types flow through and get erased at the storage boundary.

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
- **Processor** = context factory + command→action adapter. `createContext(record)` makes a ctx; `execute(commands)` drains the buffer into the executor.
- **Executor** = the actual write-to-target. Trusts the record entirely — every field on `ctx.record` (PK, SK, GSI_TENANT, index, \_et/\_ct/\_md, etc.) lands on target verbatim. The executor's only transformation is gzip for OS.
- **"Record carries everything"** is a house invariant — do NOT add pre-transform snapshot queues, metadata side-channels, or "executor derives X" logic. If transformers destroyed something the executor needs, users write a transformer that preps it. See the 2026-04-19 `refactor(os)` commit for the canonical simplified shape.

### MigrationConfig tuning

Optional `tuning` section on `MigrationConfig`:

```typescript
tuning?: {
    ddb?: { maxRetries?: number; initialBackoffMs?: number };
    s3?:  { concurrency?: number; maxRetries?: number; initialBackoffMs?: number };
    os?:  { retryScheduleMs?: number[] };
}
```

Fields flow to the respective client/executor; absent = module-level defaults. `BATCH_SIZE = 25` in DDB is AWS-enforced, NOT a user knob.

**Still TODO**: cross-call token-bucket pacing — see `project_rate_limits_todo.md` memory.

---

## 5. Testing

- Tests live in `__tests__/` mirroring `src/` structure.
- **Shared containers**: `__tests__/containers/{ddb,os}.ts` expose `createDdbContainer({ sourceRecords?, modelsDir?, logLevel? })` / `createOsContainer(...)`. Use these — don't hand-roll DI containers in tests.
- **Mock clients**: `__tests__/services/DynamoDbClient/MockDynamoDbClient.ts` + `OpenSearchClient/MockOpenSearchClient.ts` + `S3Client/MockS3Client.ts`.
- **Transformer unit tests** use `__tests__/transformers/fakeContext.ts` → `makeFakeBaseContext<T>(record, overrides?)`. For DDB-specific fields, cast at the test site.
- **Preset/pipeline tests** under `__tests__/presets/v5-to-v6/pipelines/` — each pipeline has a `.name` + `.register` + duplicate-throws test.
- **End-to-end integration** in `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` — includes a zero-transformer passthrough case.
- `vitest.config.ts` excludes: **empty** (aside from `**/node_modules/**`). All excluded-legacy-tests from the old refactor were ported during Plan B.

Verification before any commit:

```bash
yarn format:fix    # oxfmt
yarn ts-check      # expect 0 errors
yarn test          # expect all green
git status         # include ALL modified files
```

`src/presets/example.ts` used to reformat unsolicitedly under oxfmt — it's been deleted, so that's no longer a concern.

---

## 6. Hard-won decisions (read before changing)

These are one-line summaries. Each links to a spec or PR if fuller context is needed.

- **Zero transformers must work** — infra supports pure data-transfer (prod→dev seeding). `PipelineBuilder.build()` never throws for missing `.filter()`; runner auto-puts when transformer chain is empty.
- **Record carries everything** — processors + executors trust `ctx.record` at execute time; no side-channel queues or pre-transform snapshot passing. The OS refactor on 2026-04-19 made this explicit.
- **`ctx.original` always present** — frozen pre-transform snapshot, on every context, permanently. Don't remove even if no built-in code consumes it.
- **Transformers + presets are user-land** — the `src/transformers/` and `src/presets/v5-to-v6/` files are examples. They will be revisited when the core infra is stable. Don't design the infra around them; if a refactor breaks them, update the examples or flag for rewrite.
- **First-match-wins + scanner-keyed merge groups** — registration order is semantic. More-specific pipelines before catch-alls. Different scanners = different merge groups.
- **Impl-class-as-token accepted** — `PipelineDefinition.register(runner, DdbScanner, DdbProcessor)` works even though `DdbScanner` is an Implementation (not an Abstraction). Runtime extracts the abstraction via `Metadata`. Don't reintroduce an "abstraction-only" signature.
- **PutRecord target is baked in** — `ctx.putRecord(record)` emits a PutRecord command with the target table resolved by the context factory. Transformers shouldn't need to know table names.

---

## 7. Known open work (in priority order)

1. **Worker integration** (the big one). `src/commands/processSegment/handler.ts` and `processOsSegment/handler.ts` currently throw. `PipelineRunner` needs a `runShard(mergeGroupId, shard)` or equivalent per-shard entry point so a deployed worker can pick one shard off a queue. Until this lands, the tool runs only in tests. Needs a brainstorm before implementation.
2. **Public API audit** — `src/index.ts` has grown a lot through the refactors. Read-through + tighten before shipping. Check what's accidentally public (built-in transformers probably shouldn't be permanent exports).
3. **Init scaffolding health** — `init` command scaffolds from `templates/`. After the preset renames and `tuning` config addition, the template likely doesn't compile cleanly. Quick smoke run.
4. **Token-bucket rate limiting** — `tuning.{ddb,s3,os}` covers retry + batch concurrency but NOT per-second pacing. See `project_rate_limits_todo.md` memory. Low priority until throttling hurts.
5. **End-to-end AWS smoke** — no test has ever run against real AWS. Day-long sandbox exercise. Catches real issues mocks can't.

---

## 8. Commands / running the tool

- Install: `yarn install`
- Format: `yarn format:fix`
- Type-check: `yarn ts-check`
- Test: `yarn test` (or `yarn test:coverage`)
- Scaffold a project: `npx @webiny/data-transfer init my-transfer-folder`
- Run a transfer: `yarn transfer --config=./projects/example/ddb.transfer.config.ts` _(runs through `run` handler; workers will throw until item #1 above lands)_

---

## 9. Memory files

Persistent user/project memory for agents lives in `~/.claude/projects/.../memory/` and is indexed by `MEMORY.md`. Key entries:

- `user_role.md` — Bruno, senior Webiny engineer.
- `feedback_*` files — house style rules (braces, access modifiers, namespace types, no inline structural types, camelCase file names, no reflect-metadata imports, terse responses, commit per section).
- `feedback_no_transformers_required.md` — zero-transformer rule.
- `feedback_keep_ctx_original.md` — ctx.original stays.
- `project_*` files — project context and open TODOs.

When in doubt about a preference, check `MEMORY.md` first. When adding a new hard-won decision, save it to a memory file AND surface it in section 6 of this doc.
