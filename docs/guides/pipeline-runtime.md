# Pipeline runtime

How records flow through the transfer pipeline at runtime.

## Merge groups

Pipelines sharing the same scanner run together as a **merge group**. The scanner scans once; each record is offered to every pipeline in the group, in registration order.

```
DDB table scan
  └─ Record → Pipeline 1 (articles) → claimed? → yes → transform → write
              Pipeline 2 (files)     → skipped (already claimed)
              Pipeline 3 (rest)      → skipped (already claimed)
```

## First-match-wins

Within a merge group, the first pipeline whose filters all pass **claims** the record. No other pipeline sees it. This means registration order is semantically significant.

```typescript
// Articles pipeline: specific filter
runner.register(articles);   // checked first — claims TYPE=cms.entry with modelId=article
// Files pipeline: specific filter
runner.register(files);      // checked second — claims file manager records
// Catch-all: no filter
runner.register(everything); // checked last — claims everything else
```

If you swap `everything` before `articles`, the catch-all claims every record and `articles` never fires.

## Unmatched records

Records matching no pipeline in any merge group are **dropped silently** — they are not written to the target. The runner logs:
- A `warn` per unmatched record: `unmatched record — TYPE=pb.page PK=... SK=...`
- An `info`-level shard summary: `unmatched 14 (pb.page.l=4, pb.page=4, T#root#FM#f1:L#v1=2)`
- Per-worker log file: `segment-N-unmatched.log` in `.transfer/<runId>/`

When `TYPE` is absent or empty, the key shows as `PK:SK` instead.

To transfer **every** record, add a zero-filter catch-all pipeline last:

```typescript
const catchAll = factory
    .create({ name: "catch-all", scanner: DdbScanner, processors: [DdbProcessor] })
    .build(); // no .filter() → accepts all

runner.register(specificPipeline, catchAll);
```

## Record processing flow

For each claimed record:

1. **Filters** — all filters must pass (AND-composed)
2. **Transformers** — run in registration order, each mutates `ctx.record`
3. **`onEnd` hooks** — each processor's `onEnd` runs sequentially (array order). `DdbProcessor` and `OsProcessor` auto-emit a `PutRecord` for `ctx.record`
4. **Command buffer** — commands accumulate until `tuning.flushEvery` records (default 500)
5. **Flush** — each processor's `execute()` drains its own commands from the buffer
6. **Final flush** — at shard end, any remaining commands are flushed

## Blackholing

Pipeline-level blackhole (`.blackhole()`) or per-record blackhole (`ctx.blackhole()`) suppress all writes — filters, transformers, and `onEnd` still run, but every emitted command is discarded. Useful with `debug.snapshot` to inspect what **would** have been written without actually writing.

```typescript
const inspect = factory
    .create({ name: "inspect", scanner: DdbScanner, processors: [DdbProcessor] })
    .filter(createFilter(isCmsEntry))
    .use(myTransformer)
    .blackhole()  // nothing written to target
    .build();
```

## Hooks

- **Before-hooks** — fire once per merge group before any shard starts
- **After-hooks** — fire once after all shards in the group succeed; skipped on shard failure
- Each hook receives `{ runId, mergeGroupId }`

```typescript
const pipeline = factory
    .create({ name: "entries", scanner: DdbScanner, processors: [DdbProcessor] })
    .beforeExecuteCommands(async ({ runId }) => {
        console.log(`Starting transfer ${runId}`);
    })
    .afterExecuteCommands(async ({ runId }) => {
        console.log(`Transfer ${runId} complete`);
    })
    .build();
```

## Parallelism

`pipeline.segments` controls the number of parallel worker processes. Each worker scans one DynamoDB segment (shard). Workers run in separate child processes — they share nothing except the target table.

Default: 4 segments. Increase for large tables; decrease to 1 for debugging.

## Re-running specific shards

After a partial failure, re-run only the failed segments:

```bash
yarn transfer --config=./projects/my-env/config.ts --preset=copy-ddb --segments=1,3
```

Each worker still receives the total segment count, so it scans the exact same slice as a full run. Only the named segments execute.
