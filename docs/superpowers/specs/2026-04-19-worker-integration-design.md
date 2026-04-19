# Worker Integration Design

**Date:** 2026-04-19
**Package:** `@webiny/data-transfer`
**Closes:** the longstanding "processSegment / processOsSegment handlers throw" gap.
**Context:** `docs/design/generic-pipeline-framework.md` laid out the shard-per-worker model + `.transfer/<runId>/` state-file convention. This spec implements the minimum viable runner-side + handler-side wiring for that model.

---

## Goal

Re-enable `yarn transfer --config=...` so it actually runs end-to-end against mocked or real AWS clients. A user can scaffold via `init`, fill in credentials, run, and data moves.

After this lands:
- `PipelineRunner.run` accepts an optional shard slice.
- `process-segment` + `process-os-segment` worker handlers load config, bootstrap, load preset, process their shard, write per-shard state, exit.
- `run` handler (orchestrator) collects per-worker status via `Promise.allSettled`, still runs global after-hooks on partial failure, exits non-zero if any worker failed.
- Existing single-process `runner.run()` path keeps working unchanged (tests rely on it).

## Scope

### In

- `IPipelineRunner.run(opts?: RunOptions)` — new optional parameter.
- `IPipelineRunner.getProcessors(): Processor.Interface[]` — new method.
- `processSegment/handler.ts` — real implementation (DDB).
- `processOsSegment/handler.ts` — real implementation (OS). Two near-duplicate files by deliberate choice (refactor to a shared helper is a later cleanup).
- `run/handler.ts` — switch workers aggregation from `Promise.all` to `Promise.allSettled`; preserve after-hook execution on partial failure.
- Unit tests for: shard-mode runner, multi-merge-group guard, totalSegments/scanner-shards mismatch, `getProcessors()` deduplication, both handler bodies (mocked deps).
- Integration test case for `run({ segment: 0, totalSegments: 1 })` on a single-shard scanner — confirms shard mode is a strict subset of full-run.

### Out

- Pipeline-level merge-group hooks (`beforeExecuteCommands` / `afterExecuteCommands`). In shard mode these do NOT run — followup design required.
- Resume-from-failure / state.json tracking across runs.
- Interactive CLI, progress bars, `cli-progress` integration.
- Multi-merge-group distributed runs. `run(opts)` throws if >1 merge group is registered; in-process `run()` still handles multi-merge-group.
- Token-bucket rate limiting (memory-tracked separately).
- Subprocess end-to-end tests. Handler tests mock `bootstrap` + `writeFile` + runner.

---

## Architecture

Preserves the existing three-layer split (orchestrator → workers → runner). The new API verb is the shard slice.

### `RunOptions`

```typescript
export interface RunOptions {
    /** Zero-based index of the shard this runner invocation should process. */
    segment: number;
    /** Total number of shards. Must match the scanner's reported shard count. */
    totalSegments: number;
}
```

Exported from the `PipelineRunner` namespace (`PipelineRunner.RunOptions`) so consumers can type their own wrappers (worker handlers, custom orchestrators).

### `IPipelineRunner.run`

```typescript
run(opts?: RunOptions): Promise<void>;
```

**`run()` (no opts)** — loops every registered merge group, then every shard within that group. Pipeline-level hooks fire per merge group wrapping its shards. Matches the current in-process behavior exactly; tests and single-process users see no change.

**`run(opts)` (opts given)**:
1. If the runner has >1 merge group registered, throw `PipelineRunner.run({...}): shard mode is only supported with a single merge group; got N`. Multi-merge-group distributed runs are a follow-up design.
2. Resolve the merge group's scanner from the container.
3. Call `scanner.listShards()`. If `shards.length !== opts.totalSegments`, throw `PipelineRunner.run({segment, totalSegments}): scanner "<name>" reported <len> shards but caller declared totalSegments=<total>`.
4. Process `shards[opts.segment]` through the merge group's pipelines using the existing `runShard` private method.
5. Pipeline-level merge-group hooks are SKIPPED in this mode. Global after-transfer hooks continue to run at the orchestrator.

### `IPipelineRunner.getProcessors`

```typescript
getProcessors(): Processor.Interface<unknown, Processor.Context>[];
```

Returns the deduplicated set of processor instances attached to currently-registered pipelines. Dedup is by instance reference (two pipelines sharing the same processor token both resolve to the same singleton → one returned entry). Worker handlers use this to retrieve `getShardState()` results after `run({...})` completes.

### Worker handlers

Two near-duplicate files — `processSegment/handler.ts` and `processOsSegment/handler.ts`. Both follow the same skeleton:

```typescript
export interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function handler(argv: ProcessSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    const container = bootstrap({ config });
    container.registerInstance(TransferContext, { runId: argv.runId });

    const logger = container.resolve(Logger).child(`[segment ${argv.segment}]`);
    const runner = container.resolve(PipelineRunner);
    const presetLoader = container.resolve(PresetLoader);

    const preset = await presetLoader.load(config.pipeline.preset);
    preset.configure(runner);

    logger.info(`Processing shard ${argv.segment + 1}/${argv.total}...`);

    try {
        await runner.run({ segment: argv.segment, totalSegments: argv.total });
    } catch (error) {
        await writeErrorFile(argv.runId, argv.segment, error);
        throw error;
    }

    // Mode-specific state write (DDB: no-op; OS: <segment>-indexes.json).
    await writeShardStateFile(argv.runId, argv.segment, runner.getProcessors());

    logger.info("Shard complete.");
}
```

The DDB and OS handlers differ only in the `writeShardStateFile` implementation:

- **DDB handler**: writes nothing. `DdbProcessor.getShardState()` returns `{}`; there's no hook that reads DDB shard state.
- **OS handler**: the one registered processor has shape `{ touchedIndexes: Record<string, string> }`. Handler writes `touchedIndexes` directly to `.transfer/<runId>/<segment>-indexes.json` — the exact format `EnableRefreshHook` already reads. Zero hook changes needed.

### Orchestrator (`run` handler)

Two refinements, no structural change:

1. Swap `await Promise.all(workers)` → `await Promise.allSettled(workers)`. Collect results, log per-worker status with a summary line (`3 of 4 shards succeeded`).
2. Even if some rejected, proceed to `AfterTransferHook.execute()` (current try/catch around the hook already swallows failures — preserve that). After-hook cleanup like index refresh restore runs best-effort on partial state.
3. `process.exit(1)` if any worker rejected; `exit(0)` if all succeeded.

---

## State file contract

One file per worker per run. Files live under `.transfer/<runId>/`.

| File | Mode | Shape | Producer | Consumer |
|---|---|---|---|---|
| `<segment>-indexes.json` | OS | `Record<string, string>` — indexName → original refreshInterval | OS worker handler | `EnableRefreshHook` (AfterTransferHook) |
| `<segment>-error.json` | both | `{ segment: number; error: string }` | Any worker on throw | Operator (inspection only, no code reads it) |

DDB mode writes no files for (a)-scope.

`EnableRefreshHook` already cleans the `.transfer/<runId>/` directory after restoring; that behavior is unchanged.

---

## Data flow — OS run with `segments: 4`

1. Orchestrator: `loadConfig` → `bootstrap` → `BeforeTransferHook.execute()` → spawn 4 workers (`process-os-segment --segment N --total 4 --runId R --config C`).
2. Each worker (parallel):
   - `loadConfig(configPath)` → `bootstrap(config)` → `container.registerInstance(TransferContext, { runId })`
   - `presetLoader.load(config.pipeline.preset)` → `preset.configure(runner)` — same pipelines registered as in orchestrator.
   - `runner.run({ segment: N, totalSegments: 4 })` — scanner yields shard N's records → pipeline chain → auto-put → `OsCommandExecutor` writes to target OS DDB table (and disables refresh on first index touch).
   - On success: worker writes `.transfer/R/N-indexes.json`. Exits 0.
   - On failure: worker writes `.transfer/R/N-error.json` with the error, re-throws. Exits non-zero.
3. Orchestrator: `Promise.allSettled` returns → log summary → `AfterTransferHook.execute()`.
4. `EnableRefreshHook`: reads all `.transfer/R/*-indexes.json` files → unions into one `Map<string, string>` → calls `osClient.putIndexSettings(indexName, { index: { refresh_interval: original } })` for each → `rm .transfer/R/` recursively.
5. Orchestrator exits (0 on all-success, 1 on any failure).

---

## Testing strategy

### New files

- `__tests__/features/PipelineRunner/PipelineRunner.shard.test.ts`:
  - "runs only the requested shard when opts given" — seed N records in a MockDynamoDbClient, register one pipeline, `runner.run({ segment: 1, totalSegments: 4 })`. Assert target has roughly N/4 records (exact count depends on MockDynamoDbClient's `segment % totalSegments` semantics).
  - "throws when totalSegments mismatches scanner's listShards length" — a scanner configured for 2 shards, call `run({ segment: 0, totalSegments: 4 })` → expect throw matching the error message.
  - "throws when multiple merge groups registered and opts given" — register two pipelines under different scanner tokens, call `run({ segment: 0, totalSegments: 1 })` → expect throw.

- `__tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts`:
  - "returns one entry per distinct processor token" — register two pipelines sharing `DdbProcessor`, expect one entry.
  - "returns multiple entries for distinct processor tokens" — register two pipelines with different processor tokens, expect two entries.
  - "returns empty list when no pipelines registered" — expect `[]`.

- `__tests__/commands/processSegment.test.ts`:
  - Mock `bootstrap`, `loadConfig`, `PresetLoader`, `runner`. Verify: handler resolves PipelineRunner, loads preset, calls `runner.run({ segment: N, totalSegments: T })`, writes no state file for DDB.
  - On runner throw: handler writes `<segment>-error.json`, re-throws.

- `__tests__/commands/processOsSegment.test.ts`:
  - Same as above but asserts `<segment>-indexes.json` is written with the processor's `touchedIndexes` contents.

### Updated files

- `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`:
  - Add one `it`: `run({ segment: 0, totalSegments: 1 })` on a single-shard scanner produces identical target writes to `run()`. Confirms shard mode is a strict subset of full-run.

---

## Risks / follow-ups

1. **Pipeline-level merge-group hooks are a no-op in shard mode.** The `beforeExecuteCommands` / `afterExecuteCommands` builder methods still exist but pipelines registered with them won't see those hooks fire during a distributed run. Needs a follow-up design — likely moves these hooks to the orchestrator layer and runs them once per merge group wrapping all worker spawns.

2. **Multi-merge-group distributed runs unsupported.** `run(opts)` throws. Real use cases for this (e.g., "transfer DDB primary + OS companion in one process") would need (a) a way for the orchestrator to know total shard count across groups, (b) a way for workers to know which merge group + shard they own. Probably one worker command per storage mode is still the right shape; just documenting that this spec doesn't cover it.

3. **State file naming is OS-specific today.** `<segment>-indexes.json` hard-codes the expectation that OS mode is the only one producing shard state. A more general contract (`<segment>-state.json` with typed content) would be cleaner but requires changing `EnableRefreshHook`'s reader. Deferred with the "hooks revisit" work.

4. **Worker startup cost.** Each worker does a full config-load + bootstrap + preset-load. For small tables with `segments: 4`, this overhead dominates the actual scan time. Fine for the v5→v6 migration use case (records in the millions). For small prod-to-dev seeds, consider adding a `--in-process` flag to `run` that bypasses worker spawning — deferred follow-up.

5. **Partial writes on mid-shard failure.** If a worker fails 50% into its shard, the records it already wrote stay on target. Re-running with the same config re-writes them (puts are idempotent), so not usually catastrophic — but worth documenting for ops. Full resume-from-failure is (b)-scope work.
