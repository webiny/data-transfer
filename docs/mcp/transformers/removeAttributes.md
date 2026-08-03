---
name: removeAttributes
description: Deletes deprecated top-level attributes (currently webinyVersion) from the data envelope.
category: Transformers
---

# removeAttributes

**Import:** `import { removeAttributes } from "@webiny/data-transfer";`

**Category:** global

**What it does:** Deletes `data.webinyVersion` if present — it's no longer needed in v6 (the `tenant` attribute is handled separately, now derived via `GSI_TENANT` from keys). Expects `wrapInData` to have run first so attributes live under `data`.

**Record types it targets:** Any record with a `data` envelope containing `webinyVersion`.

**Context type required:** `BaseTransformContext`
