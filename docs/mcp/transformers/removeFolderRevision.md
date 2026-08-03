---
name: removeFolderRevision
description: Strips the #0001 revision suffix from folder location IDs and cleans up legacy folder location fields.
category: Transformers
---

# removeFolderRevision

**Import:** `import { removeFolderRevision } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Removes the trailing `#0001` revision marker from `data.location.folderId`, deletes the legacy `data.values["object@location"]` field (location now lives at `data.location`), and for `wbyAcoFolder` records strips a trailing revision number from `data.values["text@parentId"]`. Expects `wrapInData` to have run first so fields are under `data`.

**Record types it targets:** Folder-related CMS entries, notably `wbyAcoFolder` model records.

**Context type required:** `BaseTransformContext`
