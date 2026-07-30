# Project structure

```
src/
├── cli.ts                    # Entry point — yargs router
├── bootstrap.ts              # Creates DI container, registers all features
├── index.ts                  # Public API (imported as @webiny/data-transfer)
├── base/                     # createAbstraction, createFeature, Result, BaseError,
│                             # formatError (CLI error formatter), isRetryableAwsError
│                             # (unified AWS retry classifier)
├── commands/                 # Self-registering CLI commands
│   ├── init/                 # Scaffolds a new standalone transfer project from templates/
│   ├── initProject/          # Adds a project folder to projects/ in the current repo
│   ├── run/                  # Main orchestrator ($0)
│   │   ├── register.ts       # --config is optional; no --config → TransferWizard.run()
│   │   ├── handler.ts        # Unchanged — runs a resolved config path
│   │   └── wizard/           # Guided .env setup + config selection
│   │       ├── TransferWizard.ts    # Orchestrator: project select → JSON extract → write .env
│   │       │                        # OR (re-run, .env exists, no JSON) → preset select → return WizardResult
│   │       ├── projectDiscovery.ts  # Scans projects/, returns sorted names
│   │       ├── configDiscovery.ts   # Finds config.ts in project dir; returns path or null
│   │       ├── presetDiscovery.ts   # listAvailablePresets(presetsDir?) — names only (sync)
│                        # listAvailablePresetsWithDescriptions(presetsDir?) — async,
│                        # dynamically imports each preset to read .description
│   │       ├── envWriter.ts         # {{TOKEN}} substitution from .env.example → writes .env
│   │       ├── types.ts             # RawOutputValues + EnvValues + WizardResult interfaces
│   │       ├── sources/
│   │       │   ├── WebinyOutputSource.ts  # Reads source/target.webiny.json → RawOutputValues
│   │       │   └── PulumiStateSource.ts   # Reads source/target.pulumi.json → RawOutputValues
│   │       └── schemas/
│   │           ├── webinyOutput.schema.ts  # Zod schema for flat outputs object (shared)
│   │           └── pulumiState.schema.ts   # Zod schema for full Pulumi state file wrapper
│   └── processSegment/       # Worker — calls PipelineRunner.run({ segment, totalSegments })
│                             # (storage-agnostic; OsProcessor.afterShard handles OS state)
├── domain/
│   ├── pipeline/             # Pipeline abstractions
│   │   ├── abstractions/
│   │   │   ├── Processor.ts  # checkAccess + extendContext? + onEnd? + execute + afterShard?; slice type parameter.
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
│   ├── DdbProcessor/                # slice: { putRecord, querySourceRecord, queryTargetRecord }; onEnd auto-puts; execute via DdbExecutor
│   ├── OsProcessor/                 # slice: { putRecord, querySourceRecord, queryTargetRecord }; onEnd auto-puts; execute = gzip +
│   │                                # ensureIndex + delegate to DdbExecutor
│   ├── S3Processor/                 # slice: { copyFile, getFile }; NO onEnd (no default); execute drains S3Copy
│   │                                # No abstractions/ subdir — uses shared Processor token like all processors
│   ├── AuditLogProcessor/           # slice: { putAuditLog }; onEnd auto-puts to audit log table; no-op when target.auditLog is null
│   ├── DdbExecutor/                 # Shared primitive: PutRecord[] → TargetDynamoDbClient.batchPut.
│   │                                # DdbProcessor + OsProcessor both compose this.
│   ├── TouchedIndexes/              # per-worker singleton: index → original refresh_interval
│   ├── PipelineRunner/              # register(...) + run() + getProcessors() + getShardStats(); per-record slice merge + onEnd; shard-end execute
│   ├── PipelineCustomizer/           # Abstraction-only (no feature.ts). Users implement
│   │                                # PipelineCustomizer.Interface via config.register or setup.ts
│   │                                # preset pipelines by name (add filters/transformers).
│   ├── PipelineBuilderFactory/      # Injects all Processor + Scanner + PipelineCustomizer instances (multiple: true deps); .create({name, scanner, processors})
│   │                                # finds each instance by constructor identity → PipelineBuilder (carries instances)
│   ├── TransformContext/     # Single BaseTransformContextFactory; factory returns { ctx, commands }
│   ├── MigrationConfig/      # createConfig (Zod-validated, unified)
│   ├── ModelProvider/        # Loads CMS model definitions from DB + modelsDir JSON files.
│   │                         # Accepted JSON shapes (auto-detected, mixed OK in same dir):
│   │                         #   single model:  { modelId, fields: [...], ... }
│   │                         #   array of models: [{ modelId, fields, ... }, ...]
│   │                         #   Webiny export:  { groups: [...], models: [...] }
│   │                         # Disambiguation guard: object must have fields[] to be treated
│   │                         # as a model definition (CMS entry records also have modelId but
│   │                         # no fields[] — this prevents entries from being loaded as models).
│   ├── SnapshotWriter/              # Per-record JSONL debug dumps (opt-in via config.debug.snapshot)
│   ├── DroppedRecordLog/            # Writes segment-N-unmatched.log + segment-N-blackholed.log
│   ├── TransferredRecordLog/        # Writes segment-N-transferred.log
│   ├── AccessChecker/               # Aggregates checkAccess() across all processors; AccessCheck.Status
│   ├── PresetLifecycle/             # BeforeLoadPresetHook / AfterLoadPresetHook composites + ModelPreloaderHook
│   ├── TenantLocales/ PresetLoader/ WorkerSpawner/
│   └── TransferLifecycle/    # BeforeTransferHookComposite / AfterTransferHookComposite
├── transformers/             # ~30 built-in transformers (user-land examples)
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
│                             # copy-ddb: verbatim DDB + S3 copy.
│                             # copy-os: verbatim OpenSearch copy.
│                             # copy-files: S3-only file copy.
└── utils/
    ├── findPackageRoot.ts    # Walks up to find package.json with @webiny/data-transfer name
    ├── slugify.ts            # Slugify project names (lowercase, hyphens, no spaces)
    ├── load-env.ts           # loadEnv(import.meta.url) — dotenv loader, public API
    └── fromEnv.ts            # fromEnv + numberFromEnv — public API, used in user configs
```

### Build infrastructure

```
config/                       # TypeScript configs
├── tsconfig.build.json       # Emit config: composite, declaration, nodenext, outDir=dist
├── tsconfig.check.json       # Type-check config: extends build + checkmode (noEmit)
├── tsconfig.checkmode.json   # Overlay: composite=false, noEmit=true, no declarations
└── tsconfig.check.scripts.json  # Type-check for scripts/ only

scripts/                      # Build scripts (run via node scripts/X.ts)
├── buildPackages.ts          # Entry: clean → compile → rewrite aliases → copy artifacts
├── cleanPackages.ts          # rm -rf dist
├── packPackages.ts           # npm pack --dry-run from dist/
├── bin.ts                    # Platform-aware .cmd suffix for Windows
└── features/BuildPackages/   # DI-based build pipeline (mirrors @webiny/stdlib)
    ├── abstractions/         # ProjectConfig, Cleaner, Compiler, ArtifactCopier,
    │                         # PathAliasRewriter, BuildOrchestrator
    ├── index.ts              # DI composition root
    └── *.ts                  # Implementations

.changeset/config.json        # Changesets versioning config
.verdaccio.yaml               # Verdaccio local registry config (listen port, storage)

.github/workflows/
├── ci.yml                    # Format, lint, typecheck, build, test, pack, scaffold smoke test
└── publish.yml               # Changesets version + publish (triggered after CI on main)
```

### Import conventions

- `~/` path-alias imports use `.js` extensions (`from "~/foo/bar.js"`)
- Relative imports use `.ts` extensions (`from "./foo.ts"`)
- `rewriteRelativeImportExtensions` handles relative `.ts` → `.js` during build
- `PathAliasRewriter` handles `~/` → relative path in compiled output

Dirs that are **gone** (deleted in the 2026-04-19 cleanup): `src/core/`, `src/database/`, `src/config/`, `src/storage/`, `src/opensearch/`, `src/models/`, `src/utils/{logger,tenants,record-guards,gzip-compression,field-visitor,LexicalRenderer}.ts`. The transformer-adjacent helpers that lived under `src/models/` and `src/utils/` now live in `src/transformers/cms/` (they're CMS-transformer-only). Don't expect to find them elsewhere.
