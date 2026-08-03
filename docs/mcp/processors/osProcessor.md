---
name: OsProcessor
description: Writes scanned/transformed records to the target OpenSearch-backed DynamoDB table, managing index lifecycle and gzip compression.
category: Processors
---

# OsProcessor

**Import:** `import { OsProcessor } from "@webiny/data-transfer";`

**What it does:** the persistence processor for OpenSearch-table pipelines (the DynamoDB table that backs a Webiny OpenSearch index, not the search cluster itself). It reads `config.source.opensearch.tableName` / `config.target.opensearch.tableName`, exposes the same put/query helper shape as `DdbProcessor`, and at flush time gzip-compresses each record's `data` field, ensures the target OpenSearch index exists (creating it with resolved mappings/settings if missing, or temporarily disabling `refresh_interval` on an existing one for faster bulk writes), then writes through `DdbExecutor`. `checkAccess()` calls `osClient.listIndexes()` against the target cluster and classifies HTTP 401/403 as `denied`, 404 as `missing`. `afterShard()` persists the list of touched indexes (and their original `refresh_interval`) to a per-segment state file under `.transfer/<runId>/` so a later orchestrator-side hook can restore refresh settings once all shards finish.

**Context slice it adds:**

- `ctx.putRecord(record)` — queues a `PutRecord` (`{ table: targetTable, record }`). Throws at pipeline setup (`extendContext`) if `config.target.opensearch` or `config.source.opensearch` is missing — this fails fast rather than silently writing nowhere.
- `ctx.querySourceRecord<T>(pk, sk?)` — queries the source OpenSearch-table directly by PK/SK.
- `ctx.queryTargetRecord<T>(pk, sk?)` — same, against the target OpenSearch-table.

**Commands it handles:** `PutRecord` (key `PUT_RECORD`). `execute()`:
1. Returns immediately if `transferContext.dryRun` or there are no queued puts.
2. Gzip-compresses `record.data` on every put, in batches sized by `config.tuning.os.gzipConcurrency` (default 16).
3. Collects the distinct `record.index` values across the batch and calls `ensureIndex()` for each — creating the index or disabling refresh on an existing one, with retry (`config.tuning.os.retryScheduleMs`, default `[5000, 10000, 20000, 30000, 30000]` ms) on retryable AWS errors.
4. Forwards the gzipped puts to `DdbExecutor.execute()`.

**`onEnd` hook behavior:** automatically calls `ctx.putRecord(ctx.record)` — the scanned/transformed OS record is written to the target table by default, same "zero transformers required" contract as `DdbProcessor`. Use `.blackhole()` on the pipeline builder to suppress the write for a whole pipeline (e.g. `AcoSearchRecords`, `BackgroundTasks`, `MailerSettings` in `v5-to-v6-os` are all blackholed).

**Usage in pipelineBuilderFactory.create():**

```typescript
import { createTransferPreset, OsScanner, OsProcessor } from "@webiny/data-transfer";

export default createTransferPreset({
    name: "my-os-copy",
    description: "Copy the OpenSearch-backed table, same as copy-os.",
    async configure({ runner, pipelineBuilderFactory }) {
        const everything = await pipelineBuilderFactory
            .create({
                name: "OpenSearch DynamoDB Table Data",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .build(); // no .filter, no .use → verbatim copy of every scanned record

        runner.register(everything);
    }
});
```

`OsProcessor` requires `OsScanner` as its paired scanner (both operate on the OpenSearch-table record shape, `{ index, data, ...BaseRecord }`) and is only registered by `bootstrap.ts` when `config.target.opensearch != null`. The related `OsIndexPrefixHook` (a `BeforeTransferHook`, not a `Processor`) sets `process.env.OPENSEARCH_INDEX_PREFIX` from `config.target.opensearch.indexPrefix` once before the transfer starts, so index names resolved during `ensureIndex()` carry the right prefix.
