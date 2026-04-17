# Generic Pipeline Framework — Design Exploration

**Status:** Exploration / not implemented
**Date:** 2026-04-17
**Motivation:** The tool today is Webiny-specific (DDB + OS pipelines). We want it to be a generic data-transfer framework where any source (MySQL, S3, APIs) and any target can be plugged in via a preset.

---

## The tension

The current codebase treats `BaseRecord` (PK/SK/_et/_ct/_md/TYPE) and `Command` keys (`PUT_RECORD`, `S3_COPY`) as baseline primitives. Two worker commands exist — `processSegment` and `processOsSegment` — each with ~90% identical preamble (config → bootstrap → preload tenants → preload models → load preset → configure runner → scan loop). The loop then diverges.

Real-world divergence points (from a parallel explorer agent's diff):

1. **Table name** — `config.source.dynamodb.tableName` vs `config.source.opensearch.tableName`
2. **Preprocessor** — NoOp (DDB) vs `OsRecordDecompressor.decompress` (OS)
3. **Flush protocol** — `DdbCommandExecutor.execute(commands)` vs `OsCommandExecutor.execute(items, touchedIndexes)` with per-item `{ metadata, locale }`
4. **Finalizer** — nothing (DDB) vs persist `touchedIndexes` to `.transfer/<runId>/segment-N-indexes.json` (OS)

That's the entire set of runtime differences between the two handlers.

## Short-term unification (Webiny-only scope)

If we stay within DDB+OS, the minimal design is a `SegmentStrategy` domain interface returned by the preset:

```typescript
export interface SegmentStrategy {
    readonly sourceTableName: string;
    preprocess(rawRecord: BaseRecord): Promise<BaseRecord | null>;
    executeCommands(commands: Commands, sourceRecord: BaseRecord): Promise<void>;
    finalize?(runId: string, segment: number): Promise<void>;
}

export interface MigrationPreset {
    name: string;
    description: string;
    configure(runner: PipelineRunner.Interface): void;
    createStrategy(container: Container): SegmentStrategy;
}
```

Handler unifies into one file. `OsSegmentStrategy` owns its own `touchedIndexes: Map` and persists it in `finalize()` via injected `FileTool`. `processOsSegment` command gets deleted.

**Concerns raised by reviewer agent:**

- `touchedIndexes` is a cross-process contract (later consumed by the AfterTransferHook). If strategy owns it and writes the `.transfer/` file itself, the concern neutralizes.
- Per-record aux data: OS needs `{ metadata, locale }` paired with each record. Addressed by `executeCommands(commands, sourceRecord)` — strategy can look up aux data from the source record. OS strategy keeps an internal WeakMap or similar.
- `storage: "ddb" | "os"` config discriminator stays — it still gates which services `bootstrap.ts` registers (S3Client ddb-only, OpenSearchClient os-only). Preset relies on these being available when `createStrategy(container)` runs.
- Bootstrap ordering (config → bootstrap → preset load) is preserved. Preset doesn't drive service registration; it consumes services already registered by bootstrap.

This unification is achievable in a focused PR. Biggest risk is interface bloat — three abstractions to hide one decision.

## Long-term: fully generic framework

The bigger ambition is to support **any source + any target**. Examples the user raised:

- MySQL source: reads rows via `SELECT ... LIMIT/OFFSET`, records are schema-defined rows
- S3-direct source: reads file bytes directly from a bucket, records are `{ key, bytes, metadata }`
- MongoDB target: writes via `insertMany`
- HTTP API target: POSTs transformed records to an endpoint

To support these, the abstractions in this codebase need to widen.

### What has to change

1. **`BaseRecord` is Webiny-specific.** A MySQL row doesn't have PK/SK. Pipeline, `Transformer`, `TransformContext` must be generic over `<TRecord>`. Today `TransformPipeline<TInput extends Record<string, unknown>>` is already generic — the only baked-in assumption is that the auto-put at end of `pipeline.run()` writes a `PutRecord` command. Make the auto-put opt-in (or preset-driven) and the pipeline is truly generic.

2. **Commands are target-specific.** `PutRecord` and `S3Copy` presume DDB + S3. MySQL needs `InsertRow`/`UpdateRow`/`DeleteRow`. HTTP needs `HttpPost`. The `Command` interface is already abstract (just `key` + optional `dedupKey`) — each target ecosystem registers its own concrete commands.

3. **`TenantLocales.preload()` + `ModelProvider.preloadModels()` are Webiny-specific preamble.** They move into the preset's `preload()` hook. The generic handler doesn't know about them.

4. **Segmentation is source-specific.** DDB has native parallel scan. MySQL needs ID-range or LIMIT/OFFSET stripes. S3 listing needs prefix splitting. Sequential DB exports don't segment at all. The `{ segment, total }` params become source-specific — maybe `source.scan(shard)` where `shard` is opaque to the handler.

5. **Filter is preset-specific.** `TenantLocales.isDefaultLocaleRecord` is a Webiny concept. Most pipelines won't need it. Filter belongs on the preset, not the handler.

6. **Config schema becomes user-defined.** DDB config has `{ dynamodb, s3 }`. MySQL config has `{ host, port, database, username, password }`. The `storage` discriminator dies; the preset declares its own config slice and validates it.

### Proposed generic preset shape

```typescript
export interface Preset<TRecord = unknown, TShard = unknown> {
    name: string;
    description: string;

    // Source
    source: Source<TRecord, TShard>;

    // Target (per-preset; handles its own commands)
    target: Target;

    // Context factory — creates per-record context for transformers
    contextFactory: ContextFactory<TRecord>;

    // Transformations
    pipelines: TransformPipeline<TRecord>[];

    // Optional lifecycle
    preload?: () => Promise<void>;
    filter?: (record: TRecord) => boolean;
    finalize?: (args: FinalizeArgs) => Promise<void>;
}

export interface Source<TRecord, TShard> {
    /** List available shards for parallel processing (or [null] if non-segmentable) */
    listShards(): Promise<TShard[]>;
    /** Stream records in a given shard */
    scan(shard: TShard): AsyncIterable<TRecord>;
}

export interface Target {
    /** Flush accumulated commands */
    execute(commands: Commands): Promise<void>;
    /** Optional post-segment work (e.g., persist state for after-hooks) */
    finalize?(args: FinalizeArgs): Promise<void>;
}

export interface ContextFactory<TRecord> {
    create(params: { record: TRecord }): TransformContext<TRecord>;
}
```

### Generic handler pseudocode

```typescript
export async function handler(argv: ProcessShardArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    const container = bootstrap({ config });
    const logger = container.resolve(Logger).child(`[shard ${argv.shard}] `);

    const presetLoader = container.resolve(PresetLoader);
    const preset = await presetLoader.load(config.pipeline.preset);

    await preset.preload?.();

    const runner = container.resolve(PipelineRunner);
    for (const pipeline of preset.pipelines) {
        runner.register(pipeline);
    }

    for await (const raw of preset.source.scan(argv.shard)) {
        if (preset.filter && !preset.filter(raw)) { continue; }
        const commands = await runner.processRecord(raw, preset.contextFactory);
        batch.merge(commands);
        if (batch.size() >= BATCH_SIZE) {
            await preset.target.execute(batch);
            batch.reset();
        }
    }

    await preset.target.execute(batch);
    await preset.target.finalize?.({ runId: argv.runId, shard: argv.shard });
}
```

### Webiny v5-to-v6 as the first user

Once generic, the existing v5-to-v6 work becomes preset code:

- `V5ToV6DdbPreset.source` = new `DdbScanner(config.source.dynamodb.tableName)`
- `V5ToV6DdbPreset.target` = new `DdbTarget(TargetDynamoDbClient, TargetS3Client)`
- `V5ToV6DdbPreset.contextFactory` = `DdbTransformContextFactory`
- `V5ToV6DdbPreset.preload` = `() => tenantLocales.preload().then(() => modelProvider.preloadModels(tenantLocales.getMap()))`
- `V5ToV6DdbPreset.filter` = `record => tenantLocales.isDefaultLocaleRecord(record)`

OS variant uses `OsScanner`, `OsTarget` (owns gzip + ensureIndex + touchedIndexes + finalize-write-file internally), and a different contextFactory.

### Orchestrator changes

The main `run` command currently spawns one worker process per segment with `--segment N --total T`. In the generic model, it spawns one per shard: `source.listShards()` returns the list, orchestrator maps each to a worker. For non-segmentable sources (sequential MySQL export), `listShards()` returns `[null]` and there's one worker.

### Config

Two options for config:

**A) Generic envelope + preset-defined payload**
```typescript
{
    preset: "mysql-to-postgres",
    source: { host, port, database, user, password },
    target: { host, port, database, user, password },
    pipeline: { segments, modelsDir }
}
```
Preset validates its own `source`/`target` slices via Zod.

**B) Preset-defined entire config**
```typescript
createMysqlTransfer({ ... })  // user imports from preset package
```
Per-preset builder functions. No generic config shape.

**Recommendation:** (A) for the core, (B) on top (builder functions live in preset packages and produce (A)-shaped objects).

### Open questions

- How does the preset access container services from inside `source` / `target` / `contextFactory`? Likely: preset is loaded AFTER bootstrap, so it resolves services from the container at construction time (the approach in the short-term unification plan).
- What about presets that need their own DI services (e.g., a MySQLClient)? The preset file could register its own feature in bootstrap BEFORE the handler resolves anything. Requires a preset lifecycle hook `registerServices(container)`.
- Testing story — today `createDdbContainer` / `createOsContainer` give us a full container for tests. A generic framework needs per-preset test containers, OR a builder that composes them.

## Recommendation

**Short-term (Webiny only):** Either unify now via `SegmentStrategy` OR accept the small duplication between the two handlers and extract only the preamble into `__tests__/containers`-style shared helpers in `src/commands/`. Either is defensible.

**Long-term (generic framework):** Do this AFTER v5-to-v6 ships and we have real user feedback. Premature generalization before even one non-Webiny user exists is a big risk — the abstractions designed today will be wrong tomorrow.

**Concrete next step:** if the user writes an `example-preset.ts` that targets MySQL or S3-direct, that's the input needed to validate this design. Let that preset drive which abstractions are actually needed, rather than designing in the abstract.

---

## Parallel agent reports (raw)

Three agents produced independent analyses that fed into this doc — diff of current handlers, proposed unification design, adversarial critique. Their full reports are not preserved here; re-run if needed. The concerns from the critique (stateful side-channel, bootstrap ordering, config schema validity) are baked into the "Concerns raised by reviewer agent" section above.
