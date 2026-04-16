# AI Agent Guidelines

This document is read by AI agents (Claude Code, Copilot, Codex, etc.) when working on this codebase. It describes architecture patterns, conventions, and rules that must be followed.

**This document is updated as the codebase evolves.**

## Project Context

This tool transfers Webiny data between environments. Current use case is v5-to-v6 migration, but it will also support production-to-dev data transfer for testing/development. Name things generically ("transfer" not "migration") where possible.

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

1. `yarn prettier:fix` — format all source and test files
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
├── features/                 # DI features (see Feature Structure below)
│   ├── Cache/
│   ├── DynamoDbClient/
│   ├── GzipCompression/
│   ├── Logger/
│   ├── MigrationConfig/
│   ├── ModelProvider/
│   ├── OpenSearchClient/
│   ├── TenantLocales/
│   └── TransferLifecycle/
├── core/                     # Pipeline, runner, executor, context (legacy, being migrated)
├── transformers/             # Record transformers (wrapInData, removeLocale, etc.)
├── presets/                  # Migration presets (v5-to-v6-ddb, v5-to-v6-os)
├── opensearch/               # OS executor, decompress (legacy, partially migrated)
├── utils/
│   └── load-env.ts           # loadEnv(import.meta.url) — exported for user config files
└── [legacy dirs]             # database/, config/, models/, utils/, storage/ — being replaced by features
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

| Feature | Abstraction(s) | Scope | Notes |
|---------|----------------|-------|-------|
| Logger | `Logger` | Singleton (instance) | PinoLogger with pretty/json transport |
| Cache | `Cache` | Singleton | InMemoryCache via createImplementation |
| GzipCompression | `GzipCompression` | Transient | Via createImplementation |
| DynamoDbClient | `SourceDynamoDbClient`, `TargetDynamoDbClient` | Singleton (instance) | Separate clients per region/credentials |
| DynamoDbClientConfig | `DynamoDbClientConfig` | Instance | Source + target connection details |
| OpenSearchClient | `OpenSearchClient` | Singleton (instance) | OS mode only. Also registers after-transfer hook |
| OpenSearchClientConfig | `OpenSearchClientConfig` | Instance | OS mode only |
| MigrationConfig | `MigrationConfig` | Instance | Loaded async, registered before bootstrap |
| ModelProvider | `ModelProvider` | Singleton (instance) | Loads from DDB + JSON files |
| TenantLocales | `TenantLocales` | Singleton (instance) | Preloads tenant/locale map |
| TransferLifecycle | `BeforeTransferHook`, `AfterTransferHook` | Composite | Collects all registered hooks |
| TransferContext | `TransferContext` | Instance | Holds runId, registered by CLI before hooks |

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
- Mock implementations live alongside tests (e.g., `MockDynamoDbClient.ts`)
- Integration tests in `__tests__/integration/` use dynalite (local DDB) and local OpenSearch
- OS record mocker in `__tests__/utils/os-record-mocker.ts` generates configurable test data
- Snapshot tests: `os-table-migration.test.ts` writes `os-table-migrated.json` (gitignored)
- Lambda simulation: spy on `batchPut` to decompress + index into OS for verification

## Files to Delete (after full DI migration)

These files contain old code still used by command handlers (not yet migrated to DI):

- `src/config/` — replaced by `MigrationConfig` feature (currently re-exports)
- `src/database/` — replaced by `DynamoDbClient` feature
- `src/utils/logger.ts` — replaced by `Logger` feature
- `src/utils/gzip-compression.ts` — replaced by `GzipCompression` feature
- `src/utils/tenants.ts` — replaced by `TenantLocales` feature
- `src/models/` — replaced by `ModelProvider` feature
- `src/opensearch/client.ts` — replaced by `OpenSearchClient` feature
- `src/opensearch/lifecycle.ts` — replaced by `TransferLifecycle` + OS hooks
- `__tests__/mocks/database-client.ts` — replaced by `MockDynamoDbClient` in `__tests__/features/DynamoDbClient/`

## Next Steps (for future agents)

### Priority 1: Migrate command handlers to DI
- `src/commands/processSegment/handler.ts` and `src/commands/processOsSegment/handler.ts` still use legacy imports (old DynamoDBClient, old logger, old tenants util, etc.)
- They should call `bootstrap({ config })` and resolve features from the container instead of creating instances manually
- Once migrated, delete all files listed in "Files to Delete" above

### Priority 2: Extract remaining concerns as features
- **WorkerSpawner** — `spawnWorker()` in `run/handler.ts` could be a feature for testability
- **PresetLoader** — `src/core/preset-loader.ts` could become a DI feature
- **S3Client** — `src/storage/s3-client.ts` needs a feature (similar to DynamoDbClient pattern)

### Priority 3: Migrate core pipeline to DI
- `src/core/` (pipeline, runner, context, executor) could use DI abstractions
- The `TransformContext` currently receives a `MigrationConfig` object — could resolve dependencies from container instead
- The `MigrationRunner` could become a feature with the `Cache` injected

### Priority 4: Production-to-dev data transfer
- Extend the tool to support production-to-dev data transfer (not just v5-to-v6 migration)
- May need new presets, new config options, possibly new storage modes
- The DI architecture makes this extensible — add features, register hooks, create new presets

### Important conventions to follow
- Read the full AGENTS.md before starting work
- Always run verification steps before committing (prettier:fix, ts-check, test:coverage, git status)
- Use yarn, never npm
- Use namespaces for types, never export interfaces directly
- Use `public`/`private`/`protected` on all class members
- Always wrap if/for/while in curly braces
- Config field is `pipeline` (not `migration`) — holds `preset`, `segments`, `modelsDir`
- Public API exports live in `src/index.ts`: `createDdbTransfer`, `createOsTransfer`, `loadEnv`
- Template files in `templates/` are real files that get copied — keep them valid and up to date when changing config schemas or the public API
- The `.env` files must never be committed — `.gitignore` in templates blocks `**/.env`
