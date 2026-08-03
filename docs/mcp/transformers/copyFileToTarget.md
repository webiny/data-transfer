---
name: copyFileToTarget
description: Emits a verbatim S3 copy for a file-manager record, source key equal to target key.
category: Transformers
---

# copyFileToTarget

**Import:** `import { copyFileToTarget } from "@webiny/data-transfer";`

**Category:** file-manager

**What it does:** Reads the S3 key from `values["text@key"]`, checking both the raw v5 shape (`record.values`) and the post-`wrapInData` shape (`record.data.values`), and calls `ctx.copyFile(key, key)` to queue an S3 copy at the same key path. Use this when the file's storage key does not need to change; for the v5→v6 key-path migration use `createMetadata` instead.

**Record types it targets:** File-manager file records with a `text@key` value.

**Context type required:** `DdbTransformContext` (pipeline must include `S3Processor`)
