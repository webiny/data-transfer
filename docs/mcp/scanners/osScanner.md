---
name: OsScanner
description: Scans the source OpenSearch-backed DynamoDB table, decompressing each record's payload.
category: Scanners
---

# OsScanner

**Import:** `import { OsScanner } from "@webiny/data-transfer";`

**Scan behavior:** reads `config.source.opensearch.tableName` (throws if `config.source.opensearch` isn't configured) and performs a parallel `Scan` against that table via `SourceDynamoDbClient` — same underlying scan mechanism as `DdbScanner`, just against the OpenSearch-table rather than the regular table. For each raw item, it skips anything with no `index` field (not a valid OS record), then runs the item through `OsRecordDecompressor.decompress()` to inflate the gzip-compressed `data` payload that OS-table records store. If decompression yields nothing, a debug log records the record's PK/SK and `data` is yielded as `{}` rather than throwing — so downstream transformers always get an object, never `null`/`undefined`, for `record.data`.

**Record shape:** yields `OsRecord`, which extends `BaseRecord` (`PK`, `SK`, `_et`, `_ct`, `_md`, `TYPE`, plus arbitrary attributes) with two additions: `index: string` (the target OpenSearch index name this record belongs to) and `data: Record<string, unknown>` (the decompressed document body — this is the field `OsProcessor.execute()` re-compresses before writing to the target).

**Segment support:** `listShards()` returns `total = config.pipeline?.segments ?? 1` shards as `{ segment, total }`, identical to `DdbScanner`. `scan(shard)` forwards `{ segment: shard.segment, totalSegments: shard.total }` to the underlying parallel `Scan`, so `pipeline.segments` scales OS-table scan parallelism the same way it does for the regular table.

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
            .build();

        runner.register(everything);
    }
});
```

`OsScanner` is always paired with `OsProcessor` (the only processor that understands the `{ index, data }` record shape) and is used across every pipeline in `copy-os` and `v5-to-v6-os`. It's only registered — and its preset only selectable — when `config.target.opensearch != null`; `bootstrap.ts` skips OS feature registration entirely otherwise.
