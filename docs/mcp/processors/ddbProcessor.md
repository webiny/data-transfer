---
name: DdbProcessor
description: Writes scanned/transformed records to the target DynamoDB table.
category: Processors
---

# DdbProcessor

**Import:** `import { DdbProcessor } from "@webiny/data-transfer";`

**What it does:** the default persistence processor for regular DynamoDB table pipelines. It reads `config.source.dynamodb.tableName` / `config.target.dynamodb.tableName` from `MigrationConfig`, exposes helpers on the transform context for queuing writes and looking up records on either side, and drains queued `PutRecord` commands into the target table via `DdbExecutor` at flush time. Its `checkAccess()` probes both the source and target tables with `describeTable` and reports `ok` / `denied` / `missing` / `unknown` so the orchestrator can abort before spawning workers if credentials or table names are wrong.

**Context slice it adds:**

- `ctx.putRecord(record)` — queues a `PutRecord` command (`{ table: targetTable, record }`) into the pending buffer via `ctx.addCommand`. Does not write immediately — commands accumulate and are drained in batches (`tuning.flushEvery`, default 500).
- `ctx.querySourceRecord<T>(pk, sk?)` — queries the **source** DynamoDB table directly (bypasses the pipeline/scanner) and returns the first matching item or `null`. Useful when a transformer needs to look up a related record that isn't the one currently being processed.
- `ctx.queryTargetRecord<T>(pk, sk?)` — same as above but against the **target** table. Useful for checking whether something was already migrated.

**Commands it handles:** `PutRecord` (key `PUT_RECORD`). `execute()` calls `commands.get<PutRecord>(PutRecord.key)` — this marks the key as "claimed" so the runner's unclaimed-command warning doesn't fire — and forwards every collected `PutRecord` to `DdbExecutor.execute()`, which performs the actual batched `BatchWriteItem` calls against the target table. If `transferContext.dryRun` is set, `execute()` returns immediately without writing anything (commands are still collected and shown in dry-run reporting, just never sent to AWS).

**`onEnd` hook behavior:** automatically calls `ctx.putRecord(ctx.record)` — i.e. by default, **the record scanned by `DdbScanner` is written to the target table verbatim**, after any transformers in the pipeline have mutated `ctx.record` in place. This is what gives "zero transformers required" pipelines (like `copy-ddb`) their behavior: a pipeline with `processors: [DdbProcessor]` and no `.use(...)` calls is a pure 1:1 copy. To suppress the write for a pipeline (e.g. to blackhole/drop records), call `.blackhole()` on the pipeline builder — that discards all commands collected during the pipeline, `onEnd` included — rather than trying to prevent `onEnd` from running.

**Usage in pipelineBuilderFactory.create():**

```typescript
import { createTransferPreset, DdbScanner, DdbProcessor } from "@webiny/data-transfer";

export default createTransferPreset({
    name: "my-ddb-copy",
    description: "Copy the DynamoDB table, same as copy-ddb.",
    async configure({ runner, pipelineBuilderFactory }) {
        const everything = await pipelineBuilderFactory
            .create({
                name: "Regular DynamoDB Table Data",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .build(); // no .filter, no .use → verbatim copy of every scanned record

        runner.register(everything);
    }
});
```

`DdbProcessor` is also combined with other processors in the same pipeline when a record needs more than one side effect — e.g. `processors: [DdbProcessor, S3Processor]` in the `FileManagerFiles` pipeline of `v5-to-v6-ddb`, where the DDB record is written and an associated S3 file may be copied in the same pass. Multiple processors in one array run sequentially (both `onEnd` and `execute`, in array order) and their context slices are merged, so a single processor's `putRecord`/`copyFile` calls don't collide as long as their slice keys are disjoint.
