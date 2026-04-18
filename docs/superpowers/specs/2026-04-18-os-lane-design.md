# OS Lane (`OsScanner` + `OsProcessor`) — Design

**Status:** Approved spec / pending implementation plan
**Date:** 2026-04-18
**Implements:** the OS-side mirror of the DDB lane shipped in `docs/superpowers/specs/2026-04-17-runner-integration-design.md`. Reuses the existing `OsCommandExecutor`, `OsRecordDecompressor`, `OsTransformContextFactory` features without modification.
**Builds on:** the runner-integration plan (PipelineRunner, Scanner/Processor abstractions, hook lifecycle).

---

## Goal

Wire the OS source/target plumbing into the new pipeline-centric architecture by adding two thin adapter features: `OsScanner` (decompresses raw OS DDB rows into a flat `OsRecord` shape) and `OsProcessor` (delegates command execution + context creation to the existing OS infrastructure). After this lands, the only blocker for migrating the `v5-to-v6-os` preset to the new builder API is writing OS-specific transformers — all the surrounding infrastructure is in place.

---

## Scope

### In scope

- `OsScanner` feature mirroring `DdbScanner`'s shape (`Scanner.Interface<OsRecord, OsShard>`).
- `OsProcessor` feature mirroring `DdbProcessor`'s shape (`Processor.Interface<OsRecord, OsTransformContext.Interface<OsRecord>>`), holding `touchedIndexes` as instance state.
- Both features registered in the `if (config.storage === "os")` branch of `bootstrap.ts`.
- Both features registered in `__tests__/containers/os.ts` so OS-mode tests can resolve them.
- Unit tests per feature against mocked services (`MockDynamoDbClient` for the source scan, mocked executor for write delegation).

### Out of scope (deferred)

- **OS preset migration** — `v5-to-v6-os` preset stays on the legacy API; this plan does not port it. That is Plan B.
- **Built-in `DisableOsIndexes` / `ReenableOsIndexes` hooks** — index management stays in `OsCommandExecutor` per the user's choice. `OsProcessor.getShardState()` exposes `touchedIndexes` for future hook consumers, but no such hooks ship in this plan.
- **No new Command type** — `PutRecord` is reused. Commands are deliberately neutral about the data structure inside `record`; `OsProcessor` does unchecked field access on `putCmd.record` (knows the shape from its scanner's contract).
- **Worker integration / `.transfer/<runId>/.../<shard>.json` state-file persistence** — `getShardState()` is unread by the in-process runner; the worker plan will be the consumer.
- **No changes to existing OS features** — `OsCommandExecutor`, `OsRecordDecompressor`, `OsTransformContextFactory` are unchanged. We adapt them at the new feature boundary.

### Naming-conflict cleanup

`src/domain/transform/types/records.ts` currently exports a legacy `OsRecord` type (the raw, still-gzipped DDB row shape with `data: { value, compression }`). It has zero non-self consumers (verified by grep). This plan deletes that legacy export to free the `OsRecord` name for the new decompressed shape under `src/features/OsScanner/abstractions/`. Also drops it from `src/domain/transform/types/index.ts`'s re-export.

### Accepted state

- ts-check baseline already includes the legacy `__tests__/security-teams.test.ts` etc. fallout from the runner rewrite. Adding OS features should introduce zero new errors.

---

## Architecture

Two new features under `src/features/`. Both register against the generic `Scanner` / `Processor` abstractions (mirrors how `DdbScanner` / `DdbProcessor` register), so OS pipelines select them by token reference (`scanner: OsScanner`, `processor: OsProcessor`).

| Feature | Path | Role | Wraps |
| --- | --- | --- | --- |
| `OsScanner` | `src/features/OsScanner/` | `Scanner.Interface<OsRecord, OsShard>` over `SourceDynamoDbClient` + `OsRecordDecompressor` | source DDB scan + per-record decompress |
| `OsProcessor` | `src/features/OsProcessor/` | `Processor.Interface<OsRecord, OsTransformContext.Interface<OsRecord>>` over `OsCommandExecutor` + `OsTransformContextFactory` | command flush + per-record context creation; owns `touchedIndexes` Map |

The runner is unchanged. `OsCommandExecutor`, `OsRecordDecompressor`, `OsTransformContextFactory` are unchanged.

---

## Components

### 1. `OsScanner`

#### Types (named, no inline shapes)

```typescript
// src/features/OsScanner/abstractions/OsScanner.ts
export interface OsRecord {
    PK: string;
    SK: string;
    TYPE: string;
    index: string;
    _ct: string;
    _md: string;
    locale: string;
    [key: string]: unknown; // inner Webiny fields restored from gzip
}

export interface OsShard {
    segment: number;
    total: number;
}
```

`OsRecord` is the flat shape produced by merging the decompressor's three outputs (`record`, `metadata`, `locale`) into one object. OS-specific transformers operate on this shape directly. Generic DDB transformers (`wrapInData`, `addGsiTenant`, etc.) are **not** intended for OS pipelines — OS transformers are a separate set, written against `OsRecord`.

#### Implementation

```typescript
// src/features/OsScanner/OsScanner.ts
class OsScannerImpl implements Scanner.Interface<OsRecord, OsShard> {
    public constructor(
        private readonly source: SourceDynamoDbClient.Interface,
        private readonly decompressor: OsRecordDecompressor.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public async listShards(): Promise<OsShard[]> {
        const total = this.config.pipeline.segments ?? 1;
        const shards: OsShard[] = [];
        for (let i = 0; i < total; i++) {
            shards.push({ segment: i, total });
        }
        return shards;
    }

    public async *scan(shard: OsShard): AsyncIterable<OsRecord> {
        if (this.config.storage !== "os") {
            throw new Error(
                "OsScanner: source is not in OS storage mode; check config.storage"
            );
        }
        const tableName = this.config.source.opensearch.tableName;
        for await (const raw of this.source.scan(tableName, {
            segment: shard.segment,
            totalSegments: shard.total
        })) {
            const decompressed = await this.decompressor.decompress(raw);
            if (!decompressed) {
                continue; // null = type filter rejected or decompression failed
            }
            yield {
                ...decompressed.record,
                index: decompressed.metadata.index,
                _ct: decompressed.metadata._ct,
                _md: decompressed.metadata._md,
                locale: decompressed.locale
            } as OsRecord;
        }
    }
}

export const OsScanner = Scanner.createImplementation({
    implementation: OsScannerImpl,
    dependencies: [SourceDynamoDbClient, OsRecordDecompressor, MigrationConfig]
});
```

Storage-mode guard inside `scan()` mirrors `DdbScanner`'s defensive check; OS-mode config is required to read `config.source.opensearch.tableName`.

#### Feature + barrel

Standard pattern:

```typescript
// src/features/OsScanner/feature.ts
export const OsScannerFeature = createFeature({
    name: "Core/OsScannerFeature",
    register(container) {
        container.register(OsScanner).inSingletonScope();
    }
});

// src/features/OsScanner/index.ts
export { OsScanner } from "./OsScanner.ts";
export { OsScannerFeature } from "./feature.ts";
export type { OsRecord, OsShard } from "./abstractions/OsScanner.ts";
```

### 2. `OsProcessor`

#### Types

```typescript
// src/features/OsProcessor/abstractions/OsProcessor.ts
export interface OsShardState {
    touchedIndexes: Record<string, string>;
}
```

#### Implementation

```typescript
// src/features/OsProcessor/OsProcessor.ts
class OsProcessorImpl
    implements Processor.Interface<OsRecord, OsTransformContext.Interface<OsRecord>>
{
    private readonly touchedIndexes: Map<string, string> = new Map();

    public constructor(
        private readonly executor: OsCommandExecutor.Interface,
        private readonly contextFactory: OsTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            return;
        }
        const items: OsCommandExecutor.Item[] = puts.map(put => {
            const r = put.record as OsRecord;
            return {
                record: r,
                metadata: {
                    index: r.index,
                    _ct: r._ct,
                    _md: r._md
                },
                locale: r.locale
            };
        });
        await this.executor.execute(items, this.touchedIndexes);
    }

    public createContext(record: OsRecord): OsTransformContext.Interface<OsRecord> {
        return this.contextFactory.create({ record });
    }

    public getShardState(): OsShardState {
        return { touchedIndexes: Object.fromEntries(this.touchedIndexes) };
    }
}

export const OsProcessor = Processor.createImplementation({
    implementation: OsProcessorImpl,
    dependencies: [OsCommandExecutor, OsTransformContextFactory]
});
```

`touchedIndexes` is per-instance state. Since `OsProcessor` is registered in singleton scope, all pipelines using the `Processor` token within a merge group share the same instance and therefore the same Map — which matches the design's "state per processor within group" rule.

`execute()` is permissive on `put.record`'s shape — the cast `as OsRecord` is a deliberate trust boundary because the scanner contract guarantees this shape.

#### Feature + barrel

```typescript
// src/features/OsProcessor/feature.ts
export const OsProcessorFeature = createFeature({
    name: "Core/OsProcessorFeature",
    register(container) {
        container.register(OsProcessor).inSingletonScope();
    }
});

// src/features/OsProcessor/index.ts
export { OsProcessor } from "./OsProcessor.ts";
export { OsProcessorFeature } from "./feature.ts";
export type { OsShardState } from "./abstractions/OsProcessor.ts";
```

### 3. Bootstrap wiring

Inside `src/bootstrap.ts`, in the existing `if (config.storage === "os")` branch, append the two new feature registrations after the existing OS infrastructure:

```typescript
if (config.storage === "os") {
    container.registerInstance(OpenSearchClientConfig, { /* ... */ });
    OpenSearchClientFeature.register(container);
    OsCommandExecutorFeature.register(container);
    OsRecordDecompressorFeature.register(container);
    OsScannerFeature.register(container);    // new
    OsProcessorFeature.register(container);  // new
}
```

(Verbatim placement: after `OsRecordDecompressorFeature.register(container)`.)

### 4. Test container

`__tests__/containers/os.ts` already creates an OS-mode container with mocked services. Add the two new feature registrations after the existing OS feature setup. Mirror the bootstrap order.

---

## Runtime flow (within an OS merge group)

Unchanged from the runner-integration design — all OS-specific behavior happens inside `OsScanner.scan()` and `OsProcessor.execute()`. The runner's loop is generic.

For a typical OS pipeline:

1. Runner resolves `OsScanner` once per group.
2. `listShards()` returns N shards from `config.pipeline.segments ?? 1`.
3. Per shard sequentially:
   - `for await (const osRec of scanner.scan(shard))` — scanner pulls raw OS DDB rows, decompresses, yields flat `OsRecord`.
   - For each record, runner walks pipelines in registration order; first matching pipeline runs.
   - `OsProcessor.createContext(osRec)` → `OsTransformContext.Interface<OsRecord>` (via existing factory).
   - Transformers (OS-specific, written against `OsRecord`) run sequentially, mutating `ctx.record` and emitting `PutRecord` commands via `ctx.commands.add(...)`.
   - Runner appends commands to per-processor buffer.
4. At shard end:
   - `OsProcessor.execute(buffer)` reads all `PutRecord`s, builds `OsCommandExecutor.Item[]` by extracting `index`/`_ct`/`_md`/`locale` from each `putCmd.record`, calls `OsCommandExecutor.execute(items, this.touchedIndexes)`.
   - `touchedIndexes` Map mutated by the executor; survives across shards within the group.

After all shards complete, after-hooks (none in this plan) would normally run. `getShardState()` is unread today.

---

## Testing

### `OsScanner` unit tests (`__tests__/features/OsScanner/OsScanner.test.ts`)

- Registrability: resolves through `Scanner` token from `createOsContainer()`.
- `listShards()` returns `[{ segment: 0, total: 1 }]` when `pipeline.segments` is unset.
- `listShards()` returns N shards when `pipelineOverride: { segments: N }` is set on the container helper.
- `scan(shard)` calls `SourceDynamoDbClient.scan` with `config.source.opensearch.tableName` and the shard's `segment` / `totalSegments`.
- `scan(shard)` decompresses and yields a flat `OsRecord` with `index`/`_ct`/`_md`/`locale` at top level.
- Records that fail decompression (decompressor returns null) are silently skipped.
- Throws when called with a non-OS config (defensive check).

The `createOsContainer` helper may need a `pipelineOverride` option similar to the one added to `createDdbContainer` in the prior plan. If absent, add it the same way.

### `OsProcessor` unit tests (`__tests__/features/OsProcessor/OsProcessor.test.ts`)

- Registrability: resolves through `Processor` token from `createOsContainer()`.
- `createContext(record)` returns an `OsTransformContext.Interface<OsRecord>` with `record` set and `commands` instance present.
- `execute(commands)` builds correct `OsItem[]` from a buffer of `PutRecord`s — verify each item's `record`, `metadata.index`, `metadata._ct`, `metadata._md`, `locale` come from the corresponding `putCmd.record` fields.
- `execute(commands)` delegates to `OsCommandExecutor.execute(items, touchedIndexes)` — assert via `vi.spyOn(executor, "execute")` that the spy was called with the constructed items array AND the same `touchedIndexes` Map instance held by the processor.
- `execute(commands)` is a no-op when no `PutRecord`s are present (empty buffer or only other command types).
- `getShardState()` returns `{ touchedIndexes: {} }` initially, and reflects the Map after the executor populates it.

### No integration test in this plan

The runner-integration plan already shipped one integration test against `MockDynamoDbClient` (DDB lane). An OS integration test would need a `MockOpenSearchClient` consumer wired through the executor — reasonable to add but not strictly required for this plan's value (proving that scanner + processor wire up correctly is enough). Defer to preset migration (Plan B) where the OS preset will need an integration test anyway.

---

## Implementation order (preview)

The implementation plan will sequence the work as:

1. Delete legacy `OsRecord` from `src/domain/transform/types/records.ts` + its barrel re-export. (Free the name; verified no consumers.)
2. `OsScanner` feature (5 source files + tests + container helper update).
3. `OsProcessor` feature (5 source files + tests + container helper update).
4. Wire both into `bootstrap.ts` `os` branch.
5. Final verification: format, ts-check, full test suite.

Each step is one commit. Mirrors the DDB lane plan's structure exactly — no surprises.

---

## What this enables

After this plan lands:

- Plan B (preset migration for `v5-to-v6-os`) becomes a pure transformer-writing exercise. All infrastructure is in place.
- Future hook plans (`DisableOsIndexes` / `ReenableOsIndexes`) can read `OsProcessor.getShardState().touchedIndexes` to know which indexes to restore.
- Worker integration (Plan D) can persist `getShardState()` to `.transfer/<runId>/Core-Scanner/Core-Processor/<shard>.json`-style state files without further changes to OsProcessor.
