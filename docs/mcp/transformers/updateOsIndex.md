---
name: updateOsIndex
description: Recomputes an OpenSearch record's target index name from its modelId and tenant.
category: Transformers
---

# updateOsIndex

**Import:** `import { updateOsIndex } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Reads `record.data.modelId` and `record.data.tenant`, builds a minimal model shape, and calls `@webiny/api-headless-cms-ddb-es`'s `configurations.es()` to derive the correct index name, then sets `record.index` to it. Logs a warning and skips the record if `modelId` or `tenant` is missing.

**Record types it targets:** OpenSearch CMS entry records (`data.modelId`, `data.tenant` present).

**Context type required:** `OsTransformContext` (bound via `createOsTransformer`)
