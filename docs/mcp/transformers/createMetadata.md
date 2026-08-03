---
name: createMetadata
description: Creates a KeyValueStore file-metadata record and copies the underlying S3 object to its new tenant-scoped path.
category: Transformers
---

# createMetadata

**Import:** `import { createMetadata } from "@webiny/data-transfer";`

**Category:** file-manager

**What it does:** For `cms.entry.l` file records, computes the new S3 key (`tenants/<tenant>/files/<oldKey>`), emits an S3 copy from the old key to the new key when they differ, and emits a new `KeyValueStore` record (`ctx.putRecord`) at `KV#global:FileManager/File/<fileId>/Metadata` holding `bucketKey`, `contentType`, `id`, `size`, and `tenant`. The file ID has its revision suffix (`#0001`) stripped.

**Record types it targets:** File-manager file entry records (`TYPE === "cms.entry.l"`) with `text@key`/`text@name` values.

**Context type required:** `DdbTransformContext`
