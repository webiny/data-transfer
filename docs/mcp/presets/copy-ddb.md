---
name: copy-ddb
description: Verbatim copy of a regular DynamoDB table — no transformations.
category: Presets
---

# copy-ddb

**Use when:** you need to copy a Webiny primary DynamoDB table from one environment to another (e.g. prod → dev) with the data left completely untouched — no migration, no reshaping, no filtering.

**What it does:**

- Scans every item in the source DynamoDB table.
- Writes every item to the target DynamoDB table unchanged.
- No records are filtered, transformed, or blackholed — everything that is scanned is written.

**Pipelines registered:**

| Pipeline                          | Scanner      | Processors     | Filter | Transformers |
| ---------------------------------- | ------------ | -------------- | ------ | ------------ |
| `Regular DynamoDB Table Data`      | `DdbScanner` | `[DdbProcessor]` | none   | none         |

**Transformers applied:**

None — pure copy. `DdbProcessor.onEnd` emits a `PutRecord` for the scanned record as-is.

**Example usage in a custom preset:**

```typescript
import {
  createTransferPreset,
  DdbScanner,
  DdbProcessor
} from "@webiny/data-transfer";

export default createTransferPreset({
  name: "my-ddb-copy",
  description: "Copy the DynamoDB table, same as copy-ddb.",
  configure({ runner, pipelineBuilderFactory }) {
    const everything = pipelineBuilderFactory
      .create({
        name: "Regular DynamoDB Table Data",
        scanner: DdbScanner,
        processors: [DdbProcessor]
      })
      .build(); // no .filter, no .use → verbatim copy

    runner.register(everything);
  }
});
```

Select it directly with `--preset=copy-ddb` (or pick it from the wizard) instead of reimplementing it if you just need a plain copy.
