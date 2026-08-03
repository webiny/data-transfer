---
name: copy-files
description: Copy File Manager S3 files (and their DynamoDB records) verbatim — no transformations.
category: Presets
---

# copy-files

**Use when:** you only need to copy File Manager files — the DynamoDB file record plus the underlying S3 object bytes — without touching any other table data and without any migration reshaping.

**What it does:**

- Scans the primary DynamoDB table via `DdbScanner`.
- Keeps only records that pass the `isFmFile` filter (File Manager file records).
- Writes the matched DynamoDB record verbatim via `DdbProcessor`.
- Copies the associated S3 object from source bucket to target bucket via `S3Processor`.
- Everything else scanned from the table is skipped by this pipeline (it's the only pipeline in the preset, so non-matching records are simply not written by this preset).

**Pipelines registered:**

| Pipeline     | Scanner      | Processors                    | Filter               | Transformers |
| ------------ | ------------ | ------------------------------ | --------------------- | ------------ |
| `S3 Files`   | `DdbScanner` | `[DdbProcessor, S3Processor]`  | `createFilter(isFmFile)` | none         |

**Transformers applied:**

None — pure copy. Both the DynamoDB record and the S3 file bytes are copied as-is; only a filter (`isFmFile`) narrows which records this pipeline claims.

**Example usage in a custom preset:**

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
  name: "my-files-copy",
  description: "Copy File Manager files, same as copy-files.",
  configure({ runner, pipelineBuilderFactory }) {
    const s3Files = pipelineBuilderFactory
      .create({
        name: "S3 Files",
        scanner: DdbScanner,
        processors: [DdbProcessor, S3Processor]
      })
      .filter(createFilter(isFmFile))
      .build(); // no .use → verbatim copy of matched records

    runner.register(s3Files);
  }
});
```

Select it directly with `--preset=copy-files`, or combine it with `copy-ddb`/`copy-os` (as separate runs) if you need the rest of the data too — `copy-ddb` already includes File Manager records since it copies the whole table, so `copy-files` is mainly useful when you want *only* the files, or when composing a custom preset that needs the S3 copy step alongside other pipelines.
