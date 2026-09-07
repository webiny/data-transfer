---
name: pipelineRuntime
description: How the pipeline runtime dispatches records — merge groups, first-match-wins, unmatched-record drops, onEnd/afterShard hook ordering, flushEvery buffering, and segment/worker parallelism.
category: Guides
---

# Pipeline runtime

How records flow through the transfer pipeline at runtime, and the exact ordering of every hook the runner invokes. Source: `docs/guides/pipeline-runtime.md`, `src/features/PipelineRunner/PipelineRunner.ts`, `src/commands/transfer/handler.ts`, `src/commands/processSegment/handler.ts`.

## Merge groups (keyed by scanner)

`PipelineRunner` keys pipelines by their `scanner` instance:

```typescript
private mergeGroups: Map<Scanner.Interface<unknown, unknown>, AnyPipeline[]> = new Map();
```

`runner.register(...)` pushes each pipeline onto the array for its `pipeline.scanner`. All pipelines built with `scanner: DdbScanner` land in one merge group; all pipelines built with `scanner: OsScanner` land in another. Each merge group's scanner runs its scan **once**; every record it yields is offered to that group's pipelines in **registration order** — the order `runner.register(...)` was called (or the order pipelines appear within one variadic call).

## First-match-wins dispatch

Inside a shard's record loop, the runner walks the merge group's pipeline list and stops at the first one that accepts the record:

```typescript
for (const pipeline of pipelines) {
    if (!(await pipeline.accepts(record))) {
        continue;
    }
    matched = true;
    // ...run filters already passed; run transformers, onEnd, buffer commands...
    break; // no other pipeline in this merge group sees the record
}
```

`pipeline.accepts(record)` is true when every filter attached via `.filter(...)` passes (AND-composed). Once one pipeline claims a record, the loop `break`s — later pipelines in the same merge group never see it, regardless of whether their filters would also have matched. This makes **registration order semantically significant**: put more specific pipelines first, catch-alls last.

## Unmatched records are dropped

If no pipeline in the merge group accepts a record, `matched` stays `false` and the record is **not written anywhere** — dropped, not an error:

```typescript
if (!matched) {
    const { PK, SK, TYPE } = record as any;
    const typeKey = TYPE && TYPE !== "unknown" ? TYPE : `${PK}:${SK}`;
    unmatchedByType.set(typeKey, (unmatchedByType.get(typeKey) ?? 0) + 1);
    this.logger.warn(`unmatched record — TYPE=${typeKey} PK=${PK} SK=${SK}`);
    // ... snapshot to dropped/segment-N.jsonl if debug.snapshot is on ...
    this.droppedLog.add(record, new RecordDisposition.Unmatched());
}
```

Observability for unmatched records:

- A `warn` log line per unmatched record (`unmatched record — TYPE=... PK=... SK=...`; falls back to `PK:SK` when `TYPE` is absent/`"unknown"`).
- An `info`-level shard summary line: `[<mergeGroupId> shard N/M] scanned ..., transferred ..., blackholed ..., unmatched 14 (pb.page=4, ...)`.
- A per-worker dropped-record log flushed at shard end (`this.droppedLog.flush(shardCtx.segment)`), and, if `debug.snapshot` is enabled, a `dropped/segment-N.jsonl(.gz)` file with the full record.

To transfer **every** record, register a zero-filter catch-all pipeline last in the merge group — see `writingPresets.md` and `filters.md`.

## Record processing: filters → transformers → onEnd

For each record a pipeline claims, `runRecord()` runs, in this exact order:

1. **Slice merge** — each processor's `extendContext(ctx)` (if defined) is `Object.assign`-ed onto the shared `ctx`, contributing helpers like `ctx.putRecord`/`ctx.copyFile`.
2. **Transformers** — `pipeline.transformerFns`, in `.use(...)` registration order, each mutating `ctx.record` in place.
3. **`onEnd` hooks** — each processor's `onEnd(ctx)` (if defined) runs **sequentially, in the pipeline's `processors` array order** — e.g. `processors: [DdbProcessor, S3Processor]` runs `DdbProcessor.onEnd` (auto-`putRecord`) then `S3Processor.onEnd` (a no-op — `S3Processor` defines none). This is what gives zero-transformer pipelines their "verbatim copy" behavior: `DdbProcessor`/`OsProcessor`/`AuditLogProcessor` each auto-emit a put in `onEnd`; `S3Processor` never does.
4. **Blackhole check** — if `pipeline.isBlackhole` or `ctx.isBlackholed` (set via `ctx.blackhole()` inside a transformer), every command this record emitted is discarded here; nothing reaches the shard buffer.
5. **Fold into shard buffer** — otherwise, every command in the record's local `commands` bag is added to the shared `shardCommands` buffer for later flushing.

## `flushEvery` — bounded peak memory

Commands don't hit the target after every record — they accumulate in a shared `Commands` buffer for the whole shard, and that buffer is drained periodically:

```typescript
const flushEvery = this.config.tuning?.flushEvery ?? 500; // tuning.flushEvery, default 500

// ...inside the per-record loop...
recordCount++;
if (recordCount % flushEvery === 0) {
    await this.flushShard(pendingCommands, processorOrder);
    pendingCommands = new Commands();
    periodicFlushCount++;
}

// ...after the loop, a final flush for any remainder...
if (pendingCommands.size() > 0 || periodicFlushCount === 0) {
    await this.flushShard(pendingCommands, processorOrder);
}
```

`flushShard` calls `processor.execute(commands)` for **every distinct processor across the merge group's pipelines, in the order they were first encountered** (`collectProcessorOrder`) — not just the processors of the pipeline that produced the commands. Each processor's `execute()` drains only the command keys it owns (`commands.get(key)`, which marks that key "claimed"); any key nobody claims surfaces via `Commands.unclaimedKeys()` and triggers a one-time-per-key runner warning.

Net effect: peak memory is bounded to roughly `flushEvery × average_record_size` (≈ 5 MB at the 500-record default with a 10 KB average record), not the whole shard's worth of pending writes. Lower `flushEvery` (e.g. to 100) for tables with unusually large records; see `configReference.md` for the `tuning` block.

## Parallelism: segments, shards, and worker processes

`pipeline.segments` (optional in the schema; the orchestrator falls back to `1` if unset — `config.pipeline?.segments || 1` in `src/commands/transfer/handler.ts`. The example config in `configReference.md` sets `numberFromEnv("SEGMENTS", 4)`, but that `4` is a user-chosen convention, not a schema default) sets **both**:

- how many shards each scanner's `listShards()` reports (`{ segment: i, total: segments }`, passed straight through to DynamoDB's native parallel-`Scan` `Segment`/`TotalSegments` parameters), and
- how many **child worker processes** the orchestrator spawns.

The orchestrator (`src/commands/transfer/handler.ts`) resolves `segmentsToRun` (all segments, or a filtered subset via `--segments=1,3`), then spawns one worker per segment **concurrently**:

```typescript
const workers = segmentsToRun.map(segment =>
    spawnWorker(segment, segments, runId, configPath, presetName, logLevel, dryRun)
);
const results = await Promise.allSettled(workers);
```

Each worker is a separate `node bin.js process-segment --segment N --total M ...` child process (via `execa`) — workers share nothing except the target table/bucket/index they write to. Inside a worker (`src/commands/processSegment/handler.ts`), `runner.run({ segment, totalSegments })` runs exactly **one shard** for exactly **one merge group** (a worker only handles one preset/merge-group at a time; `PipelineRunner.run({...})` throws if more than one merge group is registered when shard options are passed).

A partial failure can be re-run without rescanning everything: `--segments=1,3` reruns only those two workers; each still receives the original `totalSegments`, so it scans the identical slice of the table it would have scanned in a full run.

## Hook ordering

There are four independent hook layers, each with its own scope and ordering:

| Layer | Registered via | Scope | Runs in | Order |
| --- | --- | --- | --- | --- |
| Transfer lifecycle | `BeforeTransferHook` / `AfterTransferHook` (`config.register`) | Whole transfer, once | Orchestrator process, around spawning all workers | Registration order (`{ multiple: true }` abstraction) |
| Preset lifecycle | `BeforeLoadPresetHook` / `AfterLoadPresetHook` (`config.register`) | Once per worker, around preset loading | Each worker process, before/after `preset.configure(...)` | Registration order |
| Pipeline-level | `.beforeExecuteCommands(token)` / `.afterExecuteCommands(token)` on the builder | Once per merge group | Only in `PipelineRunner.runMergeGroup` — see caveat below | Before-hooks: pipeline/registration order (deduped). After-hooks: **reverse** of that order |
| Per-record / per-shard | Processor `onEnd(ctx)` / `afterShard(ctx)` | Every record / once per shard | Inside `runRecord()` / end of `runShard()` | Sequential, `processors` array order (not reversed) |

**Before-hooks run forward, after-hooks run in reverse:**

```typescript
// before: forward order
for (const hookToken of beforeHookTokens) {
    await this.container.resolve(hookToken).run(hookParams);
}
// ...shards run...
// after: REVERSE order
for (let i = afterHookTokens.length - 1; i >= 0; i--) {
    await this.container.resolve(afterHookTokens[i]!).run(hookParams);
}
```

This mirrors a typical setup/teardown stack: the last pipeline's `afterExecuteCommands` hook runs first on the way out.

**Caveat — pipeline-level hooks only fire without shard options:** `.beforeExecuteCommands`/`.afterExecuteCommands` are wired into `runMergeGroup`, which only executes when `PipelineRunner.run()` is called with **no** `{ segment, totalSegments }` argument. The real segmented CLI flow always calls `runner.run({ segment, totalSegments })` from each worker (`runSingleShard` path), which never calls `runMergeGroup` and therefore never invokes these hooks. In practice, reach for the whole-transfer `BeforeTransferHook`/`AfterTransferHook` (documented in `configReference.md`) for cross-cutting setup/teardown instead; treat `.beforeExecuteCommands()`/`.afterExecuteCommands()` as an advanced/internal extension point until this is reconciled (see the same caveat in `writingPresets.md`).

**Processor `onEnd` vs `afterShard`:** `onEnd` is per-record (step 3 of the record pipeline above); `afterShard` is per-shard, called once at the very end of `runShard()` — after the final flush — for processors that persist shard-level side-effect state (e.g. `OsProcessor` recording which indexes it touched, for a later orchestrator-side hook to restore `refresh_interval` on). Both run sequentially in the same `processors` array order.

## Blackholing

`.blackhole(condition?)` on the pipeline builder, or `ctx.blackhole()` per-record inside a transformer, suppress writes without skipping the pipeline: filters, transformers, and `onEnd` all still run — only the final "fold commands into the shard buffer" step is skipped. Combine with `debug.snapshot` to inspect what *would* have been written. See `writingPresets.md` and `writingTransformers.md` for usage examples.
