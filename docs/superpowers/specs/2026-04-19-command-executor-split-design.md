# Command Executor Split — Design

**Date:** 2026-04-19
**Author:** Bruno Zorić (design), Claude (drafting)

## Goal

Split the god-executors (`DdbCommandExecutor`, `OsCommandExecutor`) into per-command executors. Move `touchedIndexes` shard-scoped state out of `OsProcessor` into a dedicated `TouchedIndexes` abstraction. End state: each AWS operation has its own single-responsibility executor; processors dispatch by command key; OS executor composes the DDB put executor internally.

## Motivation

- `DdbCommandExecutor` knows about both `PutRecord` and `S3Copy` — adding a new command type requires editing this file. SRP violation.
- `OsCommandExecutor` has a non-`Commands`-based signature (`execute(records[], touchedIndexes)`). Inconsistent with `DdbCommandExecutor`.
- `OsProcessor` manually unwraps `PutRecord` commands and maintains `touchedIndexes` as a private field then serializes it via `getShardState()`. Cross-cutting state leaks through the processor layer.
- The "unknown key warning" logic on `DdbCommandExecutor` is a smell — the executor shouldn't know what it doesn't handle; the dispatcher (processor) should.

## End shape

```
DdbProcessor
  ├─ PutDynamoDbRecordExecutor  (writes PutRecord[] to target DDB table)
  └─ S3CopyExecutor             (processes S3Copy[] via TargetS3Client)

OsProcessor
  └─ PutOsDynamoDbRecordExecutor (gzip → ensure OS index → delegate DDB write)
     └─ PutDynamoDbRecordExecutor (reused for the final put)

TouchedIndexes  (singleton in OS container; shared between PutOsDynamoDbRecordExecutor and OsProcessor.getShardState)
```

## Design decisions (grilled with user)

| Decision | Choice | Rationale |
|---|---|---|
| Executor granularity | One per target + command type tuple (`PutDynamoDbRecordExecutor`, `S3CopyExecutor`, `PutOsDynamoDbRecordExecutor`) | Matches existing service boundary, one responsibility each |
| OS composition | `PutOsDynamoDbRecordExecutor` internally uses `PutDynamoDbRecordExecutor` for the final write | Avoids duplicating DDB put logic; OS-specific work (gzip, ensureIndex) layers on top |
| Executor input | Pre-filtered typed array (`execute(puts: PutRecord[])`, `execute(copies: S3Copy[])`) | Kills unknown-key handling inside executors; processor owns dispatch |
| `touchedIndexes` | Dedicated `TouchedIndexes` abstraction, singleton in OS container | Cross-cutting concern (executor writes, processor reads for shard state); explicit; testable |
| Dispatch | Direct named-executor calls in processor (no registry) | Two command types today; registry premature. Acceptable to refactor when command count grows |
| Unknown keys | Processor warns once per unknown key per worker lifetime | Catches typos early, non-blocking, matches today |
| ensureIndex parallelism | Sequential (one at a time) | Parallel risks hammering OS cluster on wide-index batches. Operational safety > speed |
| Tests | Fresh per-executor test files | Existing tests deeply coupled to god-executor shape |

## API surfaces

### `TouchedIndexes` abstraction

```typescript
// src/features/TouchedIndexes/abstractions/TouchedIndexes.ts

interface ITouchedIndex {
    indexName: string;
    originalRefresh: string;
}

interface ITouchedIndexes {
    has(indexName: string): boolean;
    record(indexName: string, originalRefresh: string): void;
    all(): ITouchedIndex[];
}

export const TouchedIndexes = createAbstraction<ITouchedIndexes>("Core/TouchedIndexes");

export namespace TouchedIndexes {
    export type Interface = ITouchedIndexes;
    export type Item = ITouchedIndex;
}
```

Impl: Map-backed, `all()` returns sorted array of `{ indexName, originalRefresh }` entries.

### `PutDynamoDbRecordExecutor` abstraction

```typescript
interface IPutDynamoDbRecordExecutor {
    execute(puts: PutRecord[]): Promise<void>;
}
```

Impl:
- `execute([])` → no-op.
- Groups `puts` by `table`, calls `TargetDynamoDbClient.batchPut(table, records)` per group in parallel.
- No retry wrapper; `DynamoDbClient.batchPut` has `executeWithRetry` internally.

### `S3CopyExecutor` abstraction

```typescript
interface IS3CopyExecutor {
    execute(copies: S3Copy[]): Promise<void>;
}
```

Impl:
- `execute([])` → no-op.
- Maps `copies` to `batchCopy` operations, calls `TargetS3Client.batchCopy(operations)`.
- Concurrency knob lives in `TargetS3Client` already.

### `PutOsDynamoDbRecordExecutor` abstraction

```typescript
interface IPutOsDynamoDbRecordExecutor {
    execute(puts: PutRecord[]): Promise<void>;
}
```

Impl (see flow below):
- Constructor deps: `PutDynamoDbRecordExecutor`, `OpenSearchClient`, `GzipCompression`, `TouchedIndexes`, `Logger`, `MigrationConfig`.
- `execute([])` → no-op.
- Step 1: Gzip each `put.record.data`, build new `PutRecord[]` with gzipped data.
- Step 2: Collect unique `indexName` across puts; call `ensureIndex(indexName)` sequentially for each.
- Step 3: `await this.putDdb.execute(gzippedPuts)`.
- `ensureIndex`:
  - Short-circuit if `touchedIndexes.has(indexName)`.
  - `await withRetry(() => indexExists ? disableRefreshOnExisting : createNewIndex)`.
  - After success, `touchedIndexes.record(indexName, originalRefresh)`.
  - Retry exhaust → throw (fail-fast per earlier AWS retry work).
- `withRetry`: classifier-gated, uses `config.tuning.os.retryScheduleMs` with 5-entry default (`[5000, 10000, 20000, 30000, 30000]`).

## Processor changes

### `DdbProcessor`

```typescript
class DdbProcessorImpl {
    private readonly warnedKeys: Set<string> = new Set();

    public constructor(
        private readonly logger: Logger.Interface,
        private readonly putExecutor: PutDynamoDbRecordExecutor.Interface,
        private readonly s3CopyExecutor: S3CopyExecutor.Interface,
        private readonly contextFactory: DdbTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        this.warnOnUnknownKeys(commands);

        const puts = commands.get<PutRecord>(PutRecord.key);
        const copies = commands.get<S3Copy>(S3Copy.key);

        await Promise.all([
            this.putExecutor.execute(puts),
            this.s3CopyExecutor.execute(copies)
        ]);
    }

    private warnOnUnknownKeys(commands: Commands): void {
        const known = new Set<string>([PutRecord.key, S3Copy.key]);
        for (const key of commands.keys()) {
            if (!known.has(key) && !this.warnedKeys.has(key)) {
                this.warnedKeys.add(key);
                this.logger.warn(`DdbProcessor does not handle command key "${key}" — ignored`);
            }
        }
    }

    // createContext + getShardState unchanged
}
```

### `OsProcessor`

```typescript
class OsProcessorImpl {
    private readonly warnedKeys: Set<string> = new Set();

    public constructor(
        private readonly logger: Logger.Interface,
        private readonly putOsExecutor: PutOsDynamoDbRecordExecutor.Interface,
        private readonly contextFactory: OsTransformContextFactory.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        this.warnOnUnknownKeys(commands);
        const puts = commands.get<PutRecord>(PutRecord.key);
        await this.putOsExecutor.execute(puts);
    }

    public getShardState(): OsShardState {
        return { touchedIndexes: this.touchedIndexes.all() };
    }

    // warnOnUnknownKeys similar to DdbProcessor, known = [PutRecord.key]
    // createContext unchanged
}
```

`OsShardState.touchedIndexes` type flips from `Record<string, string>` to `TouchedIndexes.Item[]`. Callers (after-transfer hook) adapt.

## DI wiring (`bootstrap.ts`)

**DDB mode container:**
- Register: `PutDynamoDbRecordExecutor`, `S3CopyExecutor`, `DdbProcessor`.
- Remove: `DdbCommandExecutor`.

**OS mode container:**
- Register: `PutDynamoDbRecordExecutor`, `PutOsDynamoDbRecordExecutor`, `TouchedIndexes`, `OsProcessor`.
- Remove: `OsCommandExecutor`.

## File structure

**Delete:**
- `src/features/DdbCommandExecutor/` (entire dir)
- `src/features/OsCommandExecutor/` (entire dir)
- `__tests__/features/DdbCommandExecutor/`
- `__tests__/features/OsCommandExecutor/`

**Create:**
- `src/features/PutDynamoDbRecordExecutor/` (standard feature layout: `abstractions/`, impl, `feature.ts`, `index.ts`)
- `src/features/S3CopyExecutor/` (same)
- `src/features/PutOsDynamoDbRecordExecutor/` (same)
- `src/features/TouchedIndexes/` (same)
- `__tests__/features/PutDynamoDbRecordExecutor/PutDynamoDbRecordExecutor.test.ts`
- `__tests__/features/S3CopyExecutor/S3CopyExecutor.test.ts`
- `__tests__/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.test.ts`
- `__tests__/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.classifier.test.ts`
- `__tests__/features/TouchedIndexes/TouchedIndexes.test.ts`

**Modify:**
- `src/bootstrap.ts` — swap registrations.
- `src/features/DdbProcessor/DdbProcessor.ts` — new deps, direct dispatch, warn-on-unknown.
- `src/features/OsProcessor/OsProcessor.ts` — new deps, remove `touchedIndexes` field, delegate to `TouchedIndexes` abstraction.
- `src/features/OsProcessor/abstractions/OsProcessor.ts` — `OsShardState.touchedIndexes` type change.
- Any consumer of `OsShardState.touchedIndexes` (after-transfer hook, tests reading shard state) — array instead of object.

## Testing strategy

Fresh tests per executor. Each uses DI containers (`__tests__/containers/...`) to resolve the executor under test; dependencies mocked via existing mock clients.

- `PutDynamoDbRecordExecutor.test.ts` — empty array short-circuit, grouping by table, delegates to `TargetDynamoDbClient.batchPut` per table.
- `S3CopyExecutor.test.ts` — empty array short-circuit, passes operations to `TargetS3Client.batchCopy`.
- `PutOsDynamoDbRecordExecutor.test.ts` — empty short-circuit, gzip applied, ensureIndex called per unique index, delegates to `PutDynamoDbRecordExecutor` with gzipped records, touchedIndexes populated, ensureIndex skipped when already touched.
- `PutOsDynamoDbRecordExecutor.classifier.test.ts` — non-retryable OS error fails fast; retryable retries per schedule; retry-exhausted bubbles up.
- `TouchedIndexes.test.ts` — has/record/all; array contents stable order (deterministic for tests).
- `DdbProcessor` + `OsProcessor` tests — warn-on-unknown dedup, dispatch wiring.

## Non-goals

- No changes to `Command` / `Commands` / `PutRecord` / `S3Copy` domain objects.
- No changes to `PipelineRunner`, scanner features, transformer factories.
- No new command types introduced.
- No dispatcher/registry pattern — direct calls per Q4(a).
- No parallel ensureIndex — sequential per Q10(a).
- No observability hooks on executors.

## Risk / open questions

- After-transfer hook currently reads `Record<string, string>`. Confirm location(s) and update — if it iterates entries, the switch to `{ indexName, originalRefresh }[]` is a mechanical rewrite.
- Tests in `__tests__/features/OsProcessor/` may assert `getShardState()` shape. Update to new array type.
- No behavior regressions expected. Integration test (`PipelineRunner.integration.test.ts`) is the canary.
