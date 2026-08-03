---
name: fixBrokenStorageKeys
description: Corrects mismatched field storage keys in CMS entry values against the model's declared storageId.
category: Transformers
---

# fixBrokenStorageKeys

**Import:** `import { fixBrokenStorageKeys } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Walks a CMS entry's `data.values` against its model definition (via `ctx.modelProvider`) and, for each field, moves the value found under a wrong key (the declared `storageId` or `fieldId`) to the correct storage key computed by `getCorrectStorageId`. Logs and skips models it cannot find (warning once per missing model). Skips internal models (`fmfile`, `wbyfmfile`) and fragment-uuid fields.

**Record types it targets:** CMS entry records with `data.modelId` and `data.values`.

**Context type required:** `BaseTransformContext`
