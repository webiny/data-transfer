---
name: addGsiTenant
description: Populates the GSI_TENANT attribute from the record's PK or data.tenant.
category: Transformers
---

# addGsiTenant

**Import:** `import { addGsiTenant } from "@webiny/data-transfer";`

**Category:** global

**What it does:** Skips records that already have `GSI_TENANT`. Otherwise extracts the tenant from a `T#<tenant>#...` PK prefix; if that pattern isn't present, falls back to `data.tenant` (requires `wrapInData` to have run first).

**Record types it targets:** Any record — applied broadly to backfill the `GSI_TENANT` GSI attribute for tenant-scoped queries.

**Context type required:** `BaseTransformContext`
