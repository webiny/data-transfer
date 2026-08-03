---
name: copy-os
description: Verbatim copy of the OpenSearch companion DynamoDB table — no transformations.
category: Presets
---

# copy-os

**Use when:** you need to copy Webiny's OpenSearch companion DynamoDB table (the "OS table" that indexes CMS entries for search) from one environment to another with no transformation — pairs with `copy-ddb` when you also want the primary table copied.

**What it does:**

- Scans every item in the source OpenSearch DynamoDB table via `OsScanner` (which decompresses/normalizes the OS record shape).
- Writes every item to the target OS table unchanged via `OsProcessor`.
- No records are filtered, transformed, or blackholed.

**Pipelines registered:**

| Pipeline                              | Scanner     | Processors      | Filter | Transformers |
| -------------------------------------- | ----------- | --------------- | ------ | ------------ |
| `OpenSearch DynamoDB Table Data`       | `OsScanner` | `[OsProcessor]` | none   | none         |

**Transformers applied:**

None — pure copy. `OsProcessor.onEnd` emits a put for the scanned record as-is.

**Example usage in a custom preset:**

```typescript
import {
  createTransferPreset,
  OsScanner,
  OsProcessor
} from "@webiny/data-transfer";

export default createTransferPreset({
  name: "my-os-copy",
  description: "Copy the OpenSearch DDB table, same as copy-os.",
  configure({ runner, pipelineBuilderFactory }) {
    const everything = pipelineBuilderFactory
      .create({
        name: "OpenSearch DynamoDB Table Data",
        scanner: OsScanner,
        processors: [OsProcessor]
      })
      .build(); // no .filter, no .use → verbatim copy

    runner.register(everything);
  }
});
```

Only relevant if your target config has `target.opensearch` configured — the OS scanner/processor pair are registered conditionally on that setting. Select the built-in directly with `--preset=copy-os` instead of hand-rolling it.
