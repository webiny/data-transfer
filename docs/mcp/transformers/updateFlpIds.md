---
name: updateFlpIds
description: Strips the #0001 revision suffix from folder-level-page id and parentId fields.
category: Transformers
---

# updateFlpIds

**Import:** `import { updateFlpIds } from "@webiny/data-transfer";`

**Category:** folders

**What it does:** Removes a trailing `#0001` revision marker from `data.id` and `data.parentId` on FLP (folder-level-page) records. These records already carry a `data` envelope natively, so `wrapInData` does not re-wrap them.

**Record types it targets:** FLP records with `data.id`/`data.parentId`.

**Context type required:** `BaseTransformContext`
