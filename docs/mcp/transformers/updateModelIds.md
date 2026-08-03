---
name: updateModelIds
description: Renames legacy system model IDs (fmFile, acoFolder, etc.) to their v6 wby-prefixed equivalents in keys and data.modelId.
category: Transformers
---

# updateModelIds

**Import:** `import { updateModelIds } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Applies a fixed rename map (`fmFile`→`wbyFmFile`, `acoFolder`→`wbyAcoFolder`, `acoFilter`→`wbyAcoFilter`, `webinyTask`→`wbyTask`, `webinyTaskLog`→`wbyTaskLog`, `wby_recordLocking`→`wbyRecordLock`) to every `#<oldId>#`/`#<oldId>` occurrence in `PK`, `SK`, `GSI1_PK/SK`, `GSI2_PK/SK`, and to `data.modelId` directly. Expects `wrapInData` to have run first.

**Record types it targets:** Records whose keys or `data.modelId` reference any of the renamed system model IDs.

**Context type required:** `BaseTransformContext`
