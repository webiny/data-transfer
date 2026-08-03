---
name: addTransferTimestamp
description: Stamps every record with the transfer time as `_tt`.
category: Transformers
---

# addTransferTimestamp

**Import:** `import { addTransferTimestamp } from "@webiny/data-transfer";`

**Category:** global

**What it does:** Sets `record._tt = Date.now()` on the record, unconditionally. Useful as a generic audit/debug marker for when a record passed through the pipeline.

**Record types it targets:** Any record.

**Context type required:** `BaseTransformContext`
