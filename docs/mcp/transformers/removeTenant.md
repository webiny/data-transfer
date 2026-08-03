---
name: removeTenant
description: Deletes the top-level tenant attribute from security role records.
category: Transformers
---

# removeTenant

**Import:** `import { removeTenant } from "@webiny/data-transfer";`

**Category:** security

**What it does:** Deletes `record.tenant` unconditionally. Tenant scoping is derived from keys (`GSI_TENANT`) rather than a plain attribute in v6.

**Record types it targets:** Security role records carrying a legacy top-level `tenant` field.

**Context type required:** `BaseTransformContext`
