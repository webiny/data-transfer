---
name: wrapInData
description: Wraps all non-reserved top-level attributes of a record into a `data` envelope.
category: Transformers
---

# wrapInData

**Import:** `import { wrapInData } from "@webiny/data-transfer";`

**Category:** global

**What it does:** Moves every attribute not in the reserved set (`PK`, `SK`, `GSI_TENANT`, `GSI1_PK/SK`, `GSI2_PK/SK`, `TYPE`, `data`, `expiresAt`, `_ct`, `_et`, `_md`) into a new `data` object, then replaces the record (`ctx.replace`) with the reserved attributes plus this `data` envelope. No-op if `record.data` already exists. Many other transformers (`transformModelGroup`, `updateModelIds`, `addGsiTenant`, `removeAttributes`, etc.) document that they expect `wrapInData` to run first in the pipeline.

**Record types it targets:** Any v5-shaped record without an existing `data` envelope.

**Context type required:** `BaseTransformContext`
