# AI Agent Guidelines

This document is read by AI agents (Claude Code, Copilot, Codex, etc.) when working on this codebase. It describes architecture patterns, conventions, and rules that must be followed.

**This document is updated as the codebase evolves.**

## Project Context

This tool transfers Webiny data between environments. Current use case is v5-to-v6 migration, but it will also support production-to-dev data transfer for testing/development. Name things generically ("transfer" not "migration") where possible.

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

## DI Architecture Patterns (`@webiny/di`)

This project uses `@webiny/di` for dependency injection with SOLID principles.

### Foundation: `src/base/`

The `src/base/` module provides wrappers and utilities on top of `@webiny/di`:

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
- Never export interfaces directly from abstraction files
- Abstraction name uses domain prefix (`"Core/"`, `"Transfer/"`)

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
// Abstraction
export const BeforeTransferHook = createAbstraction<IBeforeTransferHook>("Transfer/BeforeTransferHook");

// Composite collects all registered implementations
class BeforeTransferHookCompositeImpl implements BeforeTransferHook.Interface {
  public constructor(private readonly hooks: BeforeTransferHook.Interface[]) {}
  public async execute(): Promise<void> {
    for (const hook of this.hooks) {
      await hook.execute();
    }
  }
}

export const BeforeTransferHookComposite = BeforeTransferHook.createComposite({
  implementation: BeforeTransferHookCompositeImpl,
  dependencies: [[BeforeTransferHook, { multiple: true }]]
});

// Feature registers composite
container.registerComposite(BeforeTransferHookComposite);

// Other features register their hook implementations
container.register(DisableRefreshHook); // implements BeforeTransferHook
```

### Bootstrap

`src/bootstrap.ts` creates and configures the DI container. Both CLI (main process) and workers call it:

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
| Cache | `Cache` | Singleton | InMemoryCache, shared across records |
| GzipCompression | `GzipCompression` | Transient | Stateless compress/decompress |
| DynamoDbClient | `SourceDynamoDbClient`, `TargetDynamoDbClient` | Singleton (instance) | Separate clients per region/credentials |
| DynamoDbClientConfig | `DynamoDbClientConfig` | Instance | Source + target connection details |
| OpenSearchClient | `OpenSearchClient` | Singleton (instance) | OS mode only. Also registers lifecycle hooks |
| OpenSearchClientConfig | `OpenSearchClientConfig` | Instance | OS mode only |
| MigrationConfig | `MigrationConfig` | Instance | Loaded async, registered before bootstrap |
| ModelProvider | `ModelProvider` | Singleton (instance) | Loads from DDB + JSON files |
| TenantLocales | `TenantLocales` | Singleton (instance) | Preloads tenant/locale map |
| TransferLifecycle | `BeforeTransferHook`, `AfterTransferHook` | Composite | Collects all registered hooks |

## Architecture Decisions

- **Two storage modes**: `"ddb"` (DynamoDB only) and `"os"` (OpenSearch DDB table)
- **Separate configs**: users run DDB transfer first, then OS transfer with separate config files
- **Workers are separate processes**: each worker loads config and bootstraps its own container
- **OS flow**: decompress gzipped records → run through same pipeline as DDB → gzip in parallel → write to target OS DDB table
- **Index creation**: OS executor creates missing indexes with retry (5/10/20/30/30s schedule)
- **Lifecycle hooks**: composite pattern — OpenSearch feature registers disable/enable refresh hooks, orchestrator just calls the composite
- **Credentials required**: AWS credentials are mandatory in all config schemas (not optional)
- **No `put` method**: DynamoDbClient only has `scan`, `query`, `batchPut` — use `batchPut` even for single records

## Files to Delete (after full DI migration)

These files contain old code that's been replaced by features but still used by `process-segment.ts` and `process-os-segment.ts`:

- `src/config/` — replaced by `MigrationConfig` feature
- `src/database/` — replaced by `DynamoDbClient` feature
- `src/utils/logger.ts` — replaced by `Logger` feature
- `src/utils/gzip-compression.ts` — replaced by `GzipCompression` feature
- `src/utils/tenants.ts` — replaced by `TenantLocales` feature
- `src/models/` — replaced by `ModelProvider` feature
- `src/opensearch/client.ts` — replaced by `OpenSearchClient` feature
- `src/opensearch/lifecycle.ts` — replaced by `TransferLifecycle` + OS hooks
- `__tests__/mocks/database-client.ts` — replaced by `MockDynamoDbClient` in `__tests__/features/DynamoDbClient/`
