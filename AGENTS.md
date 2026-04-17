# AI Agent Guidelines

This document is read by AI agents (Claude Code, Copilot, Codex, etc.) when working on this codebase. It describes architecture patterns, conventions, and rules that must be followed.

**This document is updated as the codebase evolves.**

## Project Context

This tool transfers Webiny data between environments. Current use case is v5-to-v6 migration, but it will also support production-to-dev data transfer for testing/development. Name things generically ("transfer" not "migration") where possible.

**Long-term vision:** `docs/design/generic-pipeline-framework.md` captures an exploration of making the tool source-agnostic (MySQL, S3-direct, etc.) rather than hardcoded to DDB+OS. Read it before any big refactor to scanner/preprocessor/executor abstractions.

**Package name:** `@webiny/data-transfer`

**User installation:** `npm install @webiny/data-transfer` (published to npm)

**User config files** import builder functions from the package:

```typescript
import { createDdbTransfer } from "@webiny/data-transfer";
export default createDdbTransfer({ source: {...}, target: {...}, pipeline: {...} });
```

**Scaffolding:** `npx @webiny/data-transfer init my-transfer-folder`

**Running:** `yarn transfer --config=./projects/example/ddb.transfer.config.ts`

**Public API** (exported from `src/index.ts` via `package.json` `exports` field):

- `createDdbTransfer(input)` — validates with Zod, returns config with `storage: "ddb"`
- `createOsTransfer(input)` — validates with Zod, returns config with `storage: "os"`
- `loadEnv(import.meta.url)` — loads `.env` from the calling file's directory (cross-platform)

**Config builder functions** (`createDdbTransfer`, `createOsTransfer`):

- Live in `src/features/MigrationConfig/`
- Validate input with Zod at creation time
- Add `storage: "ddb"` or `storage: "os"` internally
- User never sets `storage` manually
- Config field is `pipeline: { preset, segments?, modelsDir? }` (not `migration`)

## Verification Steps

After completing any task, **always run these in order before committing**:

1. `yarn format:fix` — format all source and test files (oxfmt)
2. `yarn ts-check` — verify TypeScript compiles with no errors
3. `yarn test:coverage` — run full test suite with coverage
4. `git status` — check for ALL modified files (including prettier changes) and stage them all

All steps must pass and all changes must be included in the commit.

## Code Style

- Always wrap `if`/`for`/`while` bodies in curly braces, even for single statements
- Use `yarn` for package management, never `npm`
- File extensions in imports: use `.ts` in source files
- Always use `public`/`private`/`protected` on class methods and properties
- Abstractions index files only export const tokens (no type exports) — use namespaces for types
- Use `createImplementation` + `container.register` for stateless services (no constructor config)
- Use `registerInstance` only when runtime config is needed to construct the instance
- Implementation classes should NOT be exported — resolve from container in tests

## Project Structure

```
src/
├── cli.ts                    # Entry point — thin yargs router (14 lines)
├── bootstrap.ts              # Creates DI container, registers all features
├── base/                     # Foundation: createAbstraction, createFeature, Result, BaseError
├── commands/                 # CLI commands (self-registering)
│   ├── index.ts              # Exports all register functions
│   ├── init/                 # Scaffold a new transfer project
│   │   ├── handler.ts        # Copies templates, writes package.json
│   │   └── register.ts       # Registers "init <folder>" on yargs
│   ├── run/                  # Main orchestrator command ($0)
│   │   ├── handler.ts        # Logic: bootstrap, hooks, spawn workers
│   │   └── register.ts       # Registers on yargs
│   ├── processSegment/       # DDB worker command
│   │   ├── handler.ts
│   │   └── register.ts
│   └── processOsSegment/     # OS worker command
│       ├── handler.ts
│       └── register.ts
├── domain/                   # Plain domain primitives (not DI)
│   └── transform/
│       ├── types/            # BaseRecord, DdbRecord, OsRecord
│       ├── commands/         # Command interface, PutRecord, S3Copy, Commands collection
│       ├── Transformer.ts    # Transformer<TCtx> interface (generic over context)
│       ├── Pipeline.ts       # TransformPipeline class with run(record, contextFactory)
│       ├── PipelineBuilder.ts
│       ├── filters.ts        # byType, isCmsEntry, isCmsModel, etc.
│       └── Preset.ts         # MigrationPreset interface (configure(runner))
├── tools/                    # Infrastructure utilities — simple, composable building blocks
│   ├── Cache/                # InMemoryCache (Map wrapper with get/set/has/delete/clear/size)
│   ├── DirectoryTool/        # Sync directory operations (create, readDir, remove, copy)
│   ├── FileTool/             # Sync file operations (readFile, writeFile, remove, copy)
│   ├── GzipCompression/      # compress / decompress / canDecompress
│   └── Logger/               # Pino-backed. Has child(prefix) for scoped log prefixes
├── services/                 # External API wrappers — still simple, typed AWS/OS clients
│   ├── DynamoDbClient/       # SourceDynamoDbClient + TargetDynamoDbClient
│   ├── OpenSearchClient/     # indexExists, createIndex, getIndexSettings, putIndexSettings, listIndexes
│   └── S3Client/             # SourceS3Client + TargetS3Client (ddb mode only)
├── features/                 # Domain logic combining tools + services
│   ├── DdbCommandExecutor/   # Executes PUT/S3_COPY commands (ddb mode only)
│   ├── MigrationConfig/      # User-facing API: createDdbTransfer, createOsTransfer, loadEnv
│   ├── ModelProvider/        # Loads CMS models from DDB + JSON files
│   ├── OsCommandExecutor/    # Gzips + ensures indexes + batch-writes to OS DDB (os mode only)
│   ├── OsRecordDecompressor/ # Decompresses OS DDB records, derives TYPE/locale (os mode only)
│   ├── PipelineRunner/       # Registers pipelines, processes records (first-match wins)
│   ├── PresetLoader/         # Loads built-in or custom presets by name/path
│   ├── TenantLocales/        # Preloads tenant → default locale map
│   ├── TransferLifecycle/    # BeforeTransferHook + AfterTransferHook composites
│   ├── TransformContext/     # DdbTransformContextFactory + OsTransformContextFactory
│   └── WorkerSpawner/        # Spawns child processes for parallel segment processing
├── transformers/             # Record transformers (wrapInData, removeLocale, etc.)
├── presets/                  # Migration presets (v5-to-v6-ddb, v5-to-v6-os)
├── utils/
│   └── load-env.ts           # loadEnv(import.meta.url) — exported for user config files
├── core/                     # Legacy pipeline/runner/executor — pending deletion
├── database/                 # Legacy DDB client — replaced by services/DynamoDbClient
├── config/                   # Legacy config loader — replaced by features/MigrationConfig
├── models/                   # Legacy model loader — replaced by features/ModelProvider
├── storage/                  # Legacy S3 client — replaced by services/S3Client
└── opensearch/               # Legacy OS helpers — replaced by services/OpenSearchClient +
                              #   features/OsCommandExecutor + features/OsRecordDecompressor
templates/                    # Scaffolded by `init` command
├── package.json.tpl          # Template with {{PROJECT_NAME}} placeholder
├── README.md
├── .gitignore
├── .env.example
├── projects/example/         # Example project configs
│   ├── ddb.transfer.config.ts
│   ├── os.transfer.config.ts
│   └── .env.example
├── transformers/.gitkeep
├── presets/.gitkeep
└── features/.gitkeep
```

## Command Structure

Each CLI command is a self-registering folder:

```
src/commands/commandName/
├── handler.ts     # The actual logic
└── register.ts    # Registers command on yargs
```

**Adding a new command:**

1. Create folder in `src/commands/`
2. Add `handler.ts` with the logic
3. Add `register.ts` with `registerXCommand(yargs: Argv): Argv`
4. Export from `src/commands/index.ts`
5. Register in `src/cli.ts`

```typescript
// register.ts
import type { Argv } from "yargs";
import { handler } from "./handler.ts";

export function registerMyCommand(yargs: Argv): Argv {
  return yargs.command(
    "my-command",
    "Description",
    (yargs) => { return yargs.option(...); },
    async (argv) => { await handler(argv); }
  );
}
```

## DI Architecture Patterns (`@webiny/di`)

This project uses `@webiny/di` for dependency injection with SOLID principles.

### Foundation: `src/base/`

- `createAbstraction<T>(name)` — creates a typed DI token (`Abstraction<T>`)
- `createFeature({ name, register })` — defines a feature module that registers implementations into a `Container`
- `createImplementation` / `createDecorator` / `createComposite` — re-exported from `@webiny/di`
- `Result<TValue, TError>` — functional ok/fail type for typed error handling
- `ResultAsync<TValue, TError>` — async version of Result
- `BaseError` — typed error base class with `code` and `data`

### Feature Structure

Each feature follows this directory layout:

```
src/features/FeatureName/
├── abstractions/
│   ├── FeatureName.ts    # Interface + abstraction token + namespace
│   └── index.ts          # Re-exports (only const tokens, no types)
├── FeatureName.ts        # Implementation class + createImplementation
├── feature.ts            # createFeature — registers into container
└── index.ts              # Public API (re-exports abstraction tokens + feature)
```

### Abstraction Pattern

```typescript
import { createAbstraction } from "@/src/base/index.ts";

interface IFeatureName {
  doSomething(input: string): Promise<void>;
}

export const FeatureName = createAbstraction<IFeatureName>("Domain/FeatureName");

export namespace FeatureName {
  export type Interface = IFeatureName;
}
```

**Key rules:**

- All types accessible only via namespace (`FeatureName.Interface`, `FeatureName.Record`, etc.)
- Never export interfaces directly from abstraction index files
- Abstraction name uses domain prefix (`"Core/"`, `"Transfer/"`, `"Base/"`)

### Implementation Pattern

```typescript
import { FeatureName as FeatureNameAbstraction } from "./abstractions/FeatureName.ts";

class FeatureNameImpl implements FeatureNameAbstraction.Interface {
  public constructor(private readonly someDep: SomeDep.Interface) {}

  public async doSomething(input: string): Promise<void> {
    // implementation
  }
}

// For stateless services (no constructor config):
export const FeatureName = FeatureNameAbstraction.createImplementation({
  implementation: FeatureNameImpl,
  dependencies: [SomeDep]
});

// For services needing runtime config: use registerInstance in feature.ts
```

### Composite Pattern (for hooks/events)

Used when multiple implementations of the same abstraction should all be executed:

```typescript
export const BeforeTransferHookComposite = BeforeTransferHook.createComposite({
  implementation: BeforeTransferHookCompositeImpl,
  dependencies: [[BeforeTransferHook, { multiple: true }]]
});

// Feature registers composite
container.registerComposite(BeforeTransferHookComposite);

// Other features register their hook implementations
container.register(SomeHook); // implements BeforeTransferHook
```

### Bootstrap

`src/bootstrap.ts` creates and configures the DI container:

```typescript
const config = await loadConfig(argv.config);
const container = bootstrap({ config });
const logger = container.resolve(Logger);
```

Features registered conditionally (e.g., OpenSearchClient only in "os" mode).

## Registered Features

Grouped by category. Tools and services are simple building blocks; features combine them to implement domain behavior.

### Tools (`src/tools/`)

| Feature         | Abstraction       | Scope     | Notes                                                                               |
| --------------- | ----------------- | --------- | ----------------------------------------------------------------------------------- |
| Logger          | `Logger`          | Singleton | PinoLogger with pretty/json transport. `.child(prefix)` for scoped prefixes         |
| Cache           | `Cache`           | Singleton | InMemoryCache (Map wrapper). Shared across records within a run                     |
| GzipCompression | `GzipCompression` | Singleton | compress / decompress / canDecompress                                               |
| DirectoryTool   | `DirectoryTool`   | Singleton | Sync dir ops: create, readDir, remove, copy. Depends on Logger                      |
| FileTool        | `FileTool`        | Singleton | Sync file ops: readFile, writeFile, remove, copy. Depends on Logger + DirectoryTool |

### Services (`src/services/`)

| Feature                | Abstraction(s)                                 | Scope                | Notes                                            |
| ---------------------- | ---------------------------------------------- | -------------------- | ------------------------------------------------ |
| DynamoDbClient         | `SourceDynamoDbClient`, `TargetDynamoDbClient` | Singleton (instance) | Separate clients per region/credentials          |
| DynamoDbClientConfig   | `DynamoDbClientConfig`                         | Instance             | Source + target connection details               |
| S3Client               | `SourceS3Client`, `TargetS3Client`             | Singleton (instance) | DDB mode only. Retry + batch concurrency         |
| S3ClientConfig         | `S3ClientConfig`                               | Instance             | DDB mode only                                    |
| OpenSearchClient       | `OpenSearchClient`                             | Singleton            | OS mode only. Also registers after-transfer hook |
| OpenSearchClientConfig | `OpenSearchClientConfig`                       | Instance             | OS mode only                                     |

### Features (`src/features/`)

| Feature              | Abstraction(s)                                            | Scope     | Notes                                                                               |
| -------------------- | --------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| MigrationConfig      | `MigrationConfig`                                         | Instance  | Loaded async, registered before bootstrap. Validates via Zod in builder functions   |
| ModelProvider        | `ModelProvider`                                           | Singleton | Loads from DDB + JSON files. Deps: SourceDynamoDbClient, Logger, MigrationConfig    |
| TenantLocales        | `TenantLocales`                                           | Singleton | Preloads tenant/locale map. Deps: SourceDynamoDbClient, Logger, MigrationConfig     |
| PresetLoader         | `PresetLoader`                                            | Singleton | Loads built-in or custom presets. Deps: Logger                                      |
| WorkerSpawner        | `WorkerSpawner`                                           | Singleton | Spawns child processes via execa. Deps: Logger                                      |
| TransferLifecycle    | `BeforeTransferHook`, `AfterTransferHook`                 | Composite | Collects all registered hooks                                                       |
| TransferContext      | `TransferContext`                                         | Instance  | Holds runId, registered by CLI before hooks                                         |
| TransformContext     | `DdbTransformContextFactory`, `OsTransformContextFactory` | Singleton | Mode-conditional. Also registers active factory under `BaseTransformContextFactory` |
| PipelineRunner       | `PipelineRunner`                                          | Singleton | Registers pipelines, processes records via `BaseTransformContextFactory`            |
| DdbCommandExecutor   | `DdbCommandExecutor`                                      | Singleton | DDB mode only. Dispatches PUT_RECORD and S3_COPY commands in parallel               |
| OsCommandExecutor    | `OsCommandExecutor`                                       | Singleton | OS mode only. Gzips, ensures indexes w/ retry, batch-writes to target OS DDB        |
| OsRecordDecompressor | `OsRecordDecompressor`                                    | Singleton | OS mode only. Decompresses OS DDB records, derives TYPE/locale. Deps: Logger, Gzip  |

## Architecture Decisions

- **Two storage modes**: `"ddb"` (DynamoDB only) and `"os"` (OpenSearch DDB table)
- **Separate configs**: users run DDB transfer first, then OS transfer with separate config files
- **Workers are separate processes**: each worker loads config and bootstraps its own container
- **OS flow**: decompress gzipped records → run through same pipeline as DDB → gzip in parallel → write to target OS DDB table
- **Index management**: OS executor creates missing indexes with retry (5/10/20/30/30s schedule). Disables refresh just-in-time when first encountering an index. Stores original refresh_interval in `.transfer/<runId>/segment-N-indexes.json`. After-hook reads files and restores original values.
- **Lifecycle hooks**: composite pattern — features register hooks, orchestrator calls composites without knowing implementations
- **Credentials required**: AWS credentials are mandatory in all config schemas (not optional)
- **No `put` method**: DynamoDbClient only has `scan`, `query`, `batchPut` — use `batchPut` even for single records
- **Self-registering commands**: each command folder has handler.ts + register.ts, CLI just chains registrations
- **Init command**: `init <folder>` scaffolds a new project by copying `templates/` directory, replaces `{{PROJECT_NAME}}` in `package.json.tpl`, removes the `.tpl` file. Fails if folder exists.
- **loadEnv helper**: exported for user config files — loads `.env` relative to the config file's location using `import.meta.url`. Uses `dotenv` internally. Each project folder has its own `.env` for credential isolation.
- **Template structure**: `templates/` contains real files (not inline strings) that get copied verbatim. `package.json.tpl` is the only templated file.
- **Scaffolded project**: `"type": "module"`, `"private": true`, single `"transfer"` script pointing to the `webiny-data-transfer` binary. Users can have multiple project folders under `projects/` with isolated `.env` files.

## Testing Patterns

- Tests live in `__tests__/features/FeatureName/` mirroring the feature structure
- **Shared container factories** in `__tests__/containers/`:
  - `createDdbContainer({ sourceRecords?, modelsDir?, logLevel? })` — full DDB mode container with mocks
  - `createOsContainer({ sourceRecords?, modelsDir?, logLevel? })` — full OS mode container with mocks
  - Tests resolve the feature under test from these containers — never manually construct implementations
- Mock implementations: `MockDynamoDbClient` (in `__tests__/features/DynamoDbClient/`), `MockOpenSearchClient` (in `__tests__/features/OpenSearchClient/`)
- `registerInstance` only for mocks that replace real AWS clients, never for the feature being tested
- Do NOT import `reflect-metadata` — `@webiny/di` loads it internally
- Integration tests in `__tests__/integration/` use dynalite (local DDB) and local OpenSearch
- OS record mocker in `__tests__/utils/os-record-mocker.ts` generates configurable test data

## Files to Delete (after full DI migration)

These files contain legacy code pending removal (see "Next Steps" for order):

- `src/config/` — replaced by `MigrationConfig` feature (currently still re-exports)
- `src/database/` — replaced by `DynamoDbClient` feature
- `src/core/` — pipeline, runner, context, executor, transformer, types, preset-loader (replaced by `~/domain/transform/` + `PipelineRunner` + `DdbCommandExecutor`)
- `src/utils/logger.ts` — replaced by `Logger` feature
- `src/utils/gzip-compression.ts` — replaced by `GzipCompression` feature
- `src/utils/tenants.ts` — replaced by `TenantLocales` feature
- `src/utils/test-helpers.ts` — legacy test helper, should become unused after test migration
- `src/models/` — replaced by `ModelProvider` feature
- `src/storage/` — replaced by `S3Client` feature
- `src/opensearch/client.ts` — replaced by `OpenSearchClient` feature
- `src/opensearch/lifecycle.ts` — replaced by `TransferLifecycle` + OS hooks
- `src/opensearch/executor.ts` — replaced by `OsCommandExecutor` feature
- `src/opensearch/decompress-record.ts` — replaced by `OsRecordDecompressor` feature
- `__tests__/mocks/database-client.ts`, `__tests__/mocks/storage-client.ts` — replaced by mocks under `__tests__/services/*/`

## Next Steps (for future agents)

### Priority 1: Legacy tests migration

The following tests are excluded from vitest runs (see `vitest.config.ts`):
`batch-processing`, `cms-entries`, `cms-model-field-attributes`, `file-manager-metadata`, `file-manager-settings`, `folder-records`, `full-table-migration`, `global-transformations`, `mailer-settings`, `nested-pipeline`, `os-table-migration`, `preset-pipelines`, `record-filtering`, `security-groups-to-roles`, `security-teams`, `integration/os-migration`.

They depend on:

- Legacy `MigrationRunner` (`src/core/runner.ts`) — incompatible with new `TransformPipeline.run(record, factory)` signature
- Legacy `executeCommands` (`src/core/executor.ts`)
- Legacy `MigrationConfig` type (`src/core/types.ts`)
- Legacy `MockDatabaseClient` / `MockStorageClient` (`__tests__/mocks/`)
- `createTestRunner` helper (`src/utils/test-helpers.ts`)

Port pattern: replace `createTestRunner(config, database)` with `createDdbContainer({ sourceRecords: {...} })` from `__tests__/containers/`, resolve `PipelineRunner` + `DdbCommandExecutor`, and configure the preset.

### Priority 2: Delete legacy files

After legacy tests are ported (or excluded+removed), delete:

- `src/core/` — all of it (pipeline, runner, context, executor, transformer, types, preset-loader)
- `src/database/` — replaced by `services/DynamoDbClient`
- `src/config/` — replaced by `features/MigrationConfig`
- `src/utils/logger.ts`, `src/utils/gzip-compression.ts`, `src/utils/tenants.ts`, `src/utils/test-helpers.ts`
- `src/models/` — replaced by `features/ModelProvider`
- `src/storage/s3-client.ts`, `src/storage/interface.ts` — replaced by `services/S3Client`
- `src/opensearch/client.ts`, `src/opensearch/lifecycle.ts`, `src/opensearch/executor.ts`, `src/opensearch/decompress-record.ts` — replaced by `services/OpenSearchClient` + `features/OsCommandExecutor` + `features/OsRecordDecompressor`
- `__tests__/mocks/database-client.ts`, `__tests__/mocks/storage-client.ts`

### Priority 3: Production-to-dev data transfer

- Extend the tool to support production-to-dev data transfer (not just v5-to-v6 migration)
- May need new presets, new config options, possibly new storage modes
- The DI architecture makes this extensible — add features, register hooks, create new presets

### Important conventions to follow

- Read the full AGENTS.md before starting work
- Always run verification steps before committing (format:fix, ts-check, test:coverage, git status)
- Use yarn, never npm
- Use namespaces for types, never export interfaces directly
- Use `public`/`private`/`protected` on all class members
- Always wrap if/for/while in curly braces
- Config field is `pipeline` (not `migration`) — holds `preset`, `segments`, `modelsDir`
- Public API exports live in `src/index.ts`: `createDdbTransfer`, `createOsTransfer`, `loadEnv`
- Template files in `templates/` are real files that get copied — keep them valid and up to date when changing config schemas or the public API
- The `.env` files must never be committed — `.gitignore` in templates blocks `**/.env`
- Path alias: use `~/tools/X`, `~/services/X`, `~/features/X`, `~/domain/X` — configured in tsconfig and vitest.config.ts. Old code uses `@/src/` — update as you touch files
- **Semantic category**: pick carefully. `tools/` for generic infrastructure (Logger, FileTool, Cache). `services/` for external API wrappers (DynamoDbClient, S3Client, OpenSearchClient). `features/` for domain logic combining tools+services. `domain/` for plain data/types with no DI.
- Do NOT import `reflect-metadata` anywhere — `@webiny/di` handles it
- Use `createImplementation` + `container.register().inSingletonScope()` — never manually `new` + `registerInstance` for DI-managed services
- Implementation classes must be private (not exported) — tests resolve from shared container factories
- Use `FileTool` / `DirectoryTool` for all file system operations in DI code — never import `node:fs` directly in features
- `modelsDir` is resolved relative to the config file location by `loadConfig` — users write `"./models"` not absolute paths
- Transform domain types (`BaseRecord`, `Command`, `Commands`, `Transformer`, `TransformPipeline`, filters, `MigrationPreset`) live in `~/domain/transform/` — plain data, not DI. Features consume them.
- Context factories are mode-conditional. `BaseTransformContextFactory` resolves to the active factory (`registerFactory` in `TransformContext` feature) — dep on it for mode-agnostic code
- Logger supports `child(prefix: string)` — use for scoped prefixes like `[segment #N]`. Child reuses parent pino instance
- `DynamoDbClient.scan()` returns `AsyncIterable<BaseRecord>` (stronger type — all Webiny records have PK/SK/\_et/\_ct/\_md/TYPE). `query()`/`batchPut()` keep the lighter `DatabaseRecord` shape.
- `Commands` collection has `.size()` / `.get(key)` / `.all()` / `.keys()` — no `.length` property
- Bootstrap registers in order: Config → Tools → Services → Features. Keep this order when adding new pieces.
