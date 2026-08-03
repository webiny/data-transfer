---
name: DdbScanner
description: Scans every item in the source DynamoDB table, segment by segment.
category: Scanners
---

# DdbScanner

**Import:** `import { DdbScanner } from "@webiny/data-transfer";`

**Scan behavior:** reads `config.source.dynamodb.tableName` and performs a parallel `Scan` against it via `SourceDynamoDbClient`, using DynamoDB's native segment/totalSegments parallel-scan support. `scan(shard)` is an async generator that yields raw table items one at a time as they page in — there is no buffering of the whole table in memory, and no transformation or filtering happens at the scanner level (that's the pipeline's job downstream).

**Record shape:** yields `BaseRecord` — `{ PK, SK, _et, _ct, _md, TYPE, [key: string]: unknown }`. This is the raw DynamoDB item exactly as stored, with only the four Webiny bookkeeping fields (`_et`, `_ct`, `_md`, `TYPE`) guaranteed present alongside `PK`/`SK`; everything else is whatever attributes the record happens to have. No decompression or decoding is applied — that distinguishes it from `OsScanner`, which decompresses a `data` payload.

**Segment support:** `listShards()` returns `total = config.pipeline?.segments ?? 1` shards, each `{ segment: i, total }`. Each shard is handed to a separate worker process (per the runtime model — one worker per shard), and `scan(shard)` passes `{ segment: shard.segment, totalSegments: shard.total }` straight through to the underlying DynamoDB `Scan` call's native `Segment`/`TotalSegments` parameters, so increasing `pipeline.segments` in config directly increases scan parallelism against the source table (and correspondingly the number of worker processes spawned).

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
            .build();

        runner.register(everything);
    }
});
```

`DdbScanner` is the scanner for every pipeline in `copy-ddb`, `copy-files`, and `v5-to-v6-ddb` (it's paired with `DdbProcessor` and/or `S3Processor`/`AuditLogProcessor`, never with `OsProcessor`). All pipelines that share a scanner within one preset form a "merge group" — records are scanned once and dispatched first-match-wins across the pipelines registered against that scanner, in registration order.
