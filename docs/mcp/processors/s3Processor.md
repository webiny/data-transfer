---
name: S3Processor
description: Copies S3 objects (e.g. File Manager files) from the source bucket to the target bucket.
category: Processors
---

# S3Processor

**Import:** `import { S3Processor } from "@webiny/data-transfer";`

**What it does:** handles S3-side side effects for pipelines that also touch DynamoDB records referencing files (typically File Manager entries). It reads `config.source.s3.bucket` / `config.target.s3.bucket`, exposes helpers to read a source object or queue a copy, and at flush time issues batched `CopyObject` calls via `targetS3.batchCopy()`. `checkAccess()` runs `headBucket` against both source and target buckets, and — when source and target accounts differ (cross-account transfer) — adds an extra check that probes the source bucket using the **target** account's credentials (since `CopyObject` executes with target credentials), returning a `hint` explaining the bucket policy needed if that probe is denied.

**Context slice it adds:**

- `ctx.copyFile(sourceKey, targetKey)` — queues an `S3Copy` command (`{ sourceBucket, sourceKey, targetBucket, targetKey }`). No file bytes move at call time; the actual copy happens in `execute()`.
- `ctx.getFile(key)` — reads an object from the **source** bucket directly, returning its body as a `Buffer` or `null` if absent. Useful for transformers that need to inspect file content (e.g. `extractImageMetadata`) before deciding what to queue.

**Commands it handles:** `S3Copy` (key `S3_COPY`). `execute()` returns immediately under `dryRun` or if there are no queued copies; otherwise it maps each `S3Copy` command to a `{ sourceBucket, sourceKey, targetBucket, targetKey }` tuple and calls `targetS3.batchCopy(...)` once for the whole batch.

**`onEnd` hook behavior:** **none — `S3Processor` has no `onEnd` hook.** Unlike `DdbProcessor`/`OsProcessor`, there is no sensible per-record default for "copy this file" (not every record has an associated file, and the same record's transformers may not want the file copied at all). Transformers must explicitly call `ctx.copyFile(sourceKey, targetKey)` when a copy is wanted; if none do, nothing is queued and `execute()` is a no-op for that pipeline.

**Usage in pipelineBuilderFactory.create():**

```typescript
import {
    createTransferPreset,
    DdbScanner,
    DdbProcessor,
    S3Processor,
    createFilter,
    isFmFile
} from "@webiny/data-transfer";

export default createTransferPreset({
    name: "copy-files",
    description: "Copy all the S3 files loaded via DynamoDB regular table - pure copy.",
    async configure({ runner, pipelineBuilderFactory }) {
        const s3Files = await pipelineBuilderFactory
            .create({
                name: "S3 Files",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
            })
            .filter(createFilter(isFmFile))
            .build();

        runner.register(s3Files);
    }
});
```

`S3Processor` is always paired with a DDB-side processor (`DdbProcessor`) in the same pipeline — it never appears alone, since it scans records via `DdbScanner` (the File Manager entry) and only conditionally acts on the file itself. In `copy-files` it runs after a plain `isFmFile` filter with no transformers (pure copy of the FM record plus, if a transformer queued one, the underlying file). In `v5-to-v6-ddb`'s `FileManagerFiles` pipeline it runs alongside `cmsEntryTransformers`, `createMetadata`, and `extractImageMetadata`, though that pipeline currently has file copying commented out (`// .blackhole()` left as a TODO marker) rather than removed.
