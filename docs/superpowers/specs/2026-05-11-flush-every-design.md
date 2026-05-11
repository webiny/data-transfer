# Periodic shard flush (`flushEvery`)

**Date:** 2026-05-11
**Status:** Approved

## Problem

`PipelineRunner.runShard` accumulates a single `Commands` buffer for the entire shard before calling `processor.execute` at shard end. For a 100 GB DynamoDB table split across 20 segments, each shard holds ~5 GB of `PutRecord` commands in memory before any writes occur. This causes OOM on large tables and hammers the target table with a single write burst at the end of each shard.

## Solution

Add a `tuning.flushEvery` config field (default 500 records). Every N records scanned, `PipelineRunner` calls `processor.execute` on the pending commands buffer and resets it. This bounds memory to `N × avg_record_size` and spreads writes evenly across the scan.

## Design

### Config — `shared.schema.ts`

Add `flushEvery` to `tuningSchema`:

```typescript
tuning: z.object({
    flushEvery: z.number().int().positive().optional(),
    ddb: ...,
    s3: ...,
    os: ...
}).optional()
```

No schema-level default — the runner owns the 500 fallback. Users wire it via:

```typescript
tuning: {
    flushEvery: numberFromEnv("FLUSH_EVERY", 500)
}
```

Env var: `FLUSH_EVERY`. Integer, positive. If absent, defaults to 500.

### PipelineRunner — `PipelineRunner.ts`

`runShard` changes:

- Replace the single `shardCommands` buffer with a `pendingCommands` buffer and a `recordCount` counter.
- After every `flushEvery` records (all scanned records, matched or not), call `this.flushShard(pendingCommands, processorOrder, shardCtx)` and reset `pendingCommands = new Commands()`.
- At shard end, flush the remainder via the same helper.
- `afterShard` is unchanged — fires once after the loop and final flush.

New private helper:

```typescript
private async flushShard(
    commands: Commands,
    processors: ProcessorInstance[],
    shardCtx: Processor.AfterShardContext
): Promise<void> {
    for (const processor of processors) {
        await processor.execute(commands);
    }
    this.warnUnclaimedKeys(commands);
}
```

`warnUnclaimedKeys` moves into `flushShard` so it runs per flush. The `unclaimedWarned: Set` deduplicates warnings across calls — the first flush that sees an unclaimed key warns; subsequent flushes for the same key are silent.

`flushEvery` is read once at the top of `runShard`:

```typescript
const flushEvery = this.config.tuning?.flushEvery ?? 500;
```

### Processor interfaces — no changes

`Processor.Interface.execute(commands)` is unchanged. `DdbProcessor.execute` and `OsProcessor.execute` are stateless — they drain the commands buffer and write. Calling them multiple times per shard is safe. `afterShard` contract is unchanged.

## Files changed

| File | Change |
|---|---|
| `src/features/MigrationConfig/schemas/shared.schema.ts` | Add `flushEvery` to `tuningSchema` |
| `src/features/PipelineRunner/PipelineRunner.ts` | Periodic flush in `runShard`, private `flushShard` helper |

## Trade-offs

- **Memory ceiling:** `flushEvery × avg_record_size`. At default 500 × 10 KB = ~5 MB; worst-case (500 × 400 KB DDB max) = 200 MB. Users on large-record tables can tune down to 100.
- **Write smoothing:** Writes are spread across the scan instead of a single burst at shard end. No change to DDB batch size (still 25 items per `BatchWriteItem`).
- **Round-trips:** More `BatchWriteItem` calls vs. today's single drain. At 500 records / 25 per batch = 20 calls per flush. Negligible at DDB throughput.
- **Time-based alternative rejected:** A time-based interval doesn't bound memory — fast scans can accumulate millions of records in 30 seconds. Record-count is the only knob that directly controls buffer size.
