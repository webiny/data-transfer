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

## Pipeline-centric refinement (from `src/presets/example.ts`)

After the above was written, Bruno sketched `src/presets/example.ts` to make the ergonomics concrete. That sketch clarifies a better decomposition than "preset owns one source/target":

**One preset can register multiple pipelines, each with its OWN source and processor.** Scanner/processor binding moves from preset level to pipeline level.

```typescript
export const example: MigrationPreset = {
    name: "example",
    description: "Example complex preset",
    configure(runner: PipelineRunner.Interface): void {
        const regularPipeline = new PipelineBuilder({
            processor: RegularProcessor,
            scanner: RegularDynamoDbTableScanner
        })
            .filter(someFilterWhichOnlyWorksOnDynamoDbRegularRecord)
            .use(someTransformation)
            .use(someOtherTransformation)
            .build();

        const s3Pipeline = new PipelineBuilder({
            processor: S3Processor,
            scanner: S3Scanner
        })
            .filter(filterFile)
            .use(someS3Transformation)
            .build();

        const osPipeline = new PipelineBuilder({
            processor: OSProcessor,
            scanner: OSTableScanner
        })
            .filter(filterOsRecord)
            .use(someOsTransformation)
            .beforeExecuteCommands(DisableOsIndexesWhichAreGettingTouched)
            .afterExecuteCommands(ReenableOsIndexes)
            .build();

        runner.register(regularPipeline)
              .register(s3Pipeline)
              .register(osPipeline);
    }
};
```

### Why this is better

1. **Type safety through scanner binding.** `PipelineBuilder({ scanner: OSTableScanner })` fixes `TRecord` to `OsRecord`. Filters and transformers attached after that point are statically typechecked against `OsRecord`. Can't accidentally put a DDB-only filter on an OS pipeline.

2. **Multi-source presets become trivial.** A single "v5-to-v6 full migration" preset can register:
   - DDB regular records pipeline
   - OS records pipeline
   - S3 file copy pipeline
   - (future) MySQL backup pipeline

   These run in parallel (or staged) under one preset — no need to split into three presets that the user has to invoke separately.

3. **Per-pipeline lifecycle hooks.** `beforeExecuteCommands` / `afterExecuteCommands` attach to the pipeline that needs them — OS pipeline disables indexes; DDB pipeline doesn't care. No shared "strategy.finalize" surface area that has to know about every pipeline's quirks.

4. **`Source`/`Target` abstractions collapse into `Scanner` + `Processor`.** The pipeline is the unit that binds them. Preset is just a registration shell.

### Implications for the generic framework

- `Preset<TRecord, TShard>` from the earlier section becomes `Pipeline<TRecord, TShard>`. The preset-level generics go away — it's just a list of pipelines, each with its own generics.
- `preset.source` / `preset.target` → `pipeline.scanner` / `pipeline.processor`.
- `preset.filter` → per-pipeline `.filter()` on the builder (already there in the example).
- `preset.finalize` → per-pipeline `.afterExecuteCommands()` (already there).
- `preset.preload` → still useful at preset level, since multiple pipelines often share preloaded state (tenant locales, model definitions).

### Pipeline merging & filter validation

When a preset registers multiple pipelines with the **same scanner + same processor** combination, the runner should merge them into a single scan pass. Scanning a DDB table twice to run two separate pipelines is wasted I/O — one scan can feed both pipelines, with each pipeline's filter selecting the records it cares about.

**Validation rule (enforced at `.build()` / `runner.register()` time, not at runtime):**

> If two or more pipelines share the same `{ scanner, processor }` combination, **every** pipeline in that group MUST declare a `.filter(...)`. If any pipeline in the group lacks a filter, `runner.register()` throws with a clear error.

Reason: a filter-less pipeline is a catch-all. If a catch-all coexists with a filtered pipeline on the same source, every record matches both — the runner cannot decide which pipeline's transforms to apply. That's a silent data corruption bug waiting to happen. Fail loudly at configuration time.

**Example — valid:**
```typescript
// Both filtered → unambiguous
new PipelineBuilder({ scanner: DdbScanner, processor: DdbProcessor })
    .filter(isRegularRecord)
    .use(transformRegular)
    .build();

new PipelineBuilder({ scanner: DdbScanner, processor: DdbProcessor })
    .filter(isReferenceRecord)
    .use(transformReference)
    .build();
```

**Example — invalid:**
```typescript
// Second pipeline is filter-less → throws at register()
new PipelineBuilder({ scanner: DdbScanner, processor: DdbProcessor })
    .filter(isRegularRecord)
    .use(transformRegular)
    .build();

new PipelineBuilder({ scanner: DdbScanner, processor: DdbProcessor })
    // no .filter() — which records does this apply to? ambiguous
    .use(transformEverything)
    .build();
```

**Single-pipeline case:** A filter is still optional when only one pipeline uses a given scanner+processor combo — "all records from this scanner go through this pipeline" is unambiguous.

**Implementation sketch:**
- `PipelineRunner.register(pipeline)` groups pipelines by `{ scannerToken, processorToken }` key.
- A finalization step (either on each `register` call or on a later `.freeze()` / first `.scan()`) walks the groups: for each group with `size > 1`, assert `every(p => p.hasFilter)`.
- On execution: scanner yields records once; the runner evaluates filters in order and routes each record to the first matching pipeline's transform chain. (Alternative: run all matching pipelines' transforms — but that contradicts the "unambiguous" goal. First-match is safer.)

**Open question:** what if two filters both match the same record? That's a filter overlap, different concern from the filter-less catch-all. Two reasonable policies:
1. **Strict (first-match wins):** document the rule, tell authors to write disjoint filters. Cheap, no runtime cost.
2. **Detection (runtime):** runner logs a warning when a record matches >1 filter in a group. Costs one extra filter eval per record.

Recommendation: strict first-match. Detection adds cost for a class of bug that careful filter authoring avoids. Can always add `--strict-filters` mode later if it turns out to bite.

### What `PipelineBuilder` does NOT commit to

The builder from the example suggests an API shape, not a full type contract. Open questions:

- Does `scanner: OSTableScanner` pass a class (DI token) or an instance? Probably a DI token, resolved via `container.resolve()` inside `.build()` so the pipeline ends up holding a concrete scanner.
- Does `processor` mean "command executor" (DDB/OS-flavored flusher) or "preprocessor" (decompress raw record)? In the example they're distinct concepts — in the current codebase `OsRecordDecompressor` does preprocessing, `DdbCommandExecutor`/`OsCommandExecutor` does flushing. Likely both roles merge into the scanner+processor pair: scanner yields domain records, processor owns flush + hooks.
- How do `.beforeExecuteCommands` / `.afterExecuteCommands` fire? Once per batch? Once per segment? Once per run? Probably per-segment (matching current OS `touchedIndexes` persist lifecycle), but this needs pinning down.
- What identity test decides "same scanner/processor"? DI token equality is simplest — `scanner: DdbScanner` refers to the token, two pipelines passing the same token are in the same group. Works as long as presets don't pass different configured instances of conceptually the same scanner.

---

## Interactive orchestration & resume

The pipeline-centric model unlocks a user-facing workflow that's not possible today: **a preset with N pipelines can be guided, paused, and resumed.**

### Problem

Realistic Webiny customer migrations will have 10+ presets (per environment, per tenant slice), each with 1–5 pipelines. Running everything in one `yarn start run` invocation means:

- No visibility into which pipeline is at what progress.
- A failure at pipeline 4 of 5 in preset 3 of 10 throws the entire run away.
- No way to cherry-pick "just rerun the OS pipeline from preset 7".

The user wants an inquirer-driven CLI that guides through this interactively and resumes cleanly from partial state.

### User-facing flow sketch

```
$ yarn start run --config migration.json

Loaded config: 10 presets, 27 pipelines total.

? Previous run detected (run-2026-04-17-143022). What do you want to do?
  > Resume failed pipelines only (3 failed, 24 done)
    Resume from specific preset
    Restart everything (fresh run)
    Inspect state without running

? Select preset to resume: (Use arrow keys)
  > [✓] preset-1-tenant-roots       (3/3 pipelines done)
    [✓] preset-2-tenant-security    (5/5 pipelines done)
  > [✗] preset-3-content-records    (2/4 pipelines done, 1 failed)
    [⏸] preset-4-media               (0/5 pipelines, pending)
    ...

? Preset "preset-3-content-records" — what to run?
    [✓] pipeline-ddb-regular         (done — shard 7/8)
    [✓] pipeline-ddb-refs            (done)
  > [✗] pipeline-os-content          (failed at shard 3/8 — "OS index full")
    [⏸] pipeline-s3-assets           (pending)

  > Resume failed pipeline from shard 3
    Rerun failed pipeline from scratch
    Skip this pipeline, run pending ones
    Abort

Running pipeline-os-content on shard 3... [####      ] 37%
```

### State model

Persisted to `.transfer/<runId>/state.json`:

```typescript
interface RunState {
    runId: string;
    configHash: string;          // invalidate if config changed mid-run
    startedAt: string;
    presets: PresetState[];
}

interface PresetState {
    name: string;
    status: "pending" | "running" | "done" | "failed" | "partial";
    pipelines: PipelineState[];
}

interface PipelineState {
    name: string;
    status: "pending" | "running" | "done" | "failed";
    startedAt?: string;
    finishedAt?: string;
    error?: { message: string; shard?: unknown };
    shards: ShardState[];            // populated after scanner.listShards()
    touchedIndexes?: Record<string, number>;  // OS-specific, merged from workers
}

interface ShardState {
    shard: unknown;                  // opaque — scanner defines
    status: "pending" | "running" | "done" | "failed";
    recordsProcessed?: number;
    startedAt?: string;
    finishedAt?: string;
}
```

Written atomically after each state change (file-per-segment worker writes its shard state; orchestrator merges into root `state.json` on worker exit). This is the same pattern as `segment-N-indexes.json` today — already proven.

### Resume granularity — the one real decision

**Pipeline-level (recommended first):**
- Pipeline either completed or didn't. Failed = rerun the whole pipeline.
- State flag per pipeline: `done | failed | pending`.
- Simple to implement: orchestrator reads state, skips `done` pipelines.
- Idempotency requirement: transforms must be idempotent at the pipeline level, which the current DDB+OS work already assumes (target PK/SK overwrites).

**Shard-level (future, if needed):**
- Pipeline's shards individually checkpointed.
- Resumes mid-pipeline at the last completed shard boundary.
- Costs:
  - Shard cursor written to `state.json` on every worker completion (already happens today for segments, just not exposed).
  - Partial-batch semantics: what if pipeline failed mid-batch inside shard 5? Either (a) re-process shard 5 fully (idempotent assumption stronger), or (b) checkpoint inside shards (major complexity — per-record cursor).
  - Retry classification: was the failure transient (network blip, retry same shard) or fatal (bad data, don't retry)?

**Record-level (reject):** Not worth it. Per-record cursors explode state size, retries get ambiguous, and users don't actually want this granularity — they want "don't redo the 6 hours that already worked".

Recommendation: ship pipeline-level resume. Promote to shard-level only when real customer feedback shows pipelines running long enough (>1h) that pipeline-level reruns are unacceptable.

### Orchestrator changes

Today: `run` command = spawn N workers with `--segment` / `--total`, wait for all, done.

With interactive orchestration:

1. **Plan phase.** Load config → load all presets → for each preset, invoke `configure(runner)` in a dry-run mode that collects pipelines without running them. Build the initial `RunState`.
2. **Resume detection.** If `.transfer/<mostRecentRunId>/state.json` exists and `configHash` matches, offer to resume. Otherwise fresh run.
3. **Interactive selection** (inquirer). User picks preset → pipeline → action. Or `--non-interactive` flag auto-chooses "resume all failed + pending".
4. **Execution.** For the selected pipeline(s), call `scanner.listShards()` → spawn worker per shard → workers update their `ShardState` via segment-file writes → orchestrator polls and renders progress (existing `cli-progress` integrates).
5. **State update.** On worker exit, orchestrator merges shard state into pipeline state. On all shards done, pipeline marked `done`. On any failure, pipeline marked `failed` with error details.
6. **Loop back to step 3** until user exits or all pipelines `done`.

### Non-interactive mode

For CI / scripted usage, flags that bypass prompts:

- `--resume-failed` — rerun only pipelines in `failed` state
- `--resume-from <preset>[:<pipeline>]` — start here, run everything after
- `--only <preset>[:<pipeline>]` — run just this one
- `--fresh` — ignore existing state, start from scratch (confirmation required)

These mirror the inquirer choices so any interactive session can be replayed as a non-interactive command.

### Progress display

Each pipeline gets its own progress row. The existing `cli-progress` + `TransferLifecycle` machinery supports this — just needs to emit events per-pipeline, not globally.

```
preset-3-content-records
  pipeline-ddb-regular  [##########] 100%  12,432 records
  pipeline-os-content   [####      ] 37%    4,811 records
  pipeline-s3-assets    [          ] 0%     pending
```

### What has to be wired up

- `MigrationPreset.configure(runner)` already registers pipelines — that's the plan phase primitive we need. No preset change required.
- `Pipeline` needs a `name` field so state can reference it.
- `Scanner.listShards()` becomes a public method (today `segments` is a top-level config option — needs to move onto the scanner).
- `.transfer/` directory convention stays; `state.json` is a new file alongside the per-segment files.
- Inquirer is a new dependency (`@inquirer/prompts`). Small addition.
- Orchestrator rewrites its main loop around the state machine above.

### What this does NOT require

- No changes to `PipelineRunner` record processing.
- No changes to filter / transformer / command code.
- No changes to DI container wiring.
- No changes to worker command internals — workers still get `--shard` / `--runId`, just with state-file side effects added.

---

## Recommendation

**Short-term (Webiny only):** Either unify now via `SegmentStrategy` OR accept the small duplication between the two handlers and extract only the preamble into `__tests__/containers`-style shared helpers in `src/commands/`. Either is defensible.

**Medium-term (pipeline-centric refactor):** Move to `PipelineBuilder` API from Bruno's example. This is a real refactor — the payoff is type safety, multi-source presets, and it unblocks interactive orchestration. Do this BEFORE the interactive-CLI work, because the pipeline-as-unit-of-progress assumption is what makes the state model clean.

**Long-term (interactive orchestration & resume):** Build once the pipeline-centric refactor lands. Start with pipeline-level resume; defer shard-level until customer feedback shows it's needed.

**Long-term (fully generic framework):** Do this AFTER v5-to-v6 ships and we have real non-Webiny user feedback. Premature generalization before even one non-Webiny user exists is a big risk — the abstractions designed today will be wrong tomorrow.

**Concrete next step:** keep `src/presets/example.ts` as the API target. Next PR after DI stabilization is introducing `PipelineBuilder` in `src/domain/transform/` with scanner/processor binding, then migrating one existing preset (v5-to-v6-ddb is the obvious pilot) to the new API.

---

## Parallel agent reports (raw)

Three agents produced independent analyses that fed into this doc — diff of current handlers, proposed unification design, adversarial critique. Their full reports are not preserved here; re-run if needed. The concerns from the critique (stateful side-channel, bootstrap ordering, config schema validity) are baked into the "Concerns raised by reviewer agent" section above.
