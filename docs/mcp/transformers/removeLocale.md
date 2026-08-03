---
name: removeLocale
description: Strips locale segments (e.g. #L#en-US#) from a record's keys and deletes the locale field.
category: Transformers
---

# removeLocale

**Import:** `import { removeLocale } from "@webiny/data-transfer";`

**Category:** global

**What it does:** Regex-strips `#L#<locale>#` segments from `PK`, `SK`, `GSI1_PK/SK`, `GSI2_PK/SK`, and deletes the top-level `locale` field plus `data.locale` if present. Used broadly during v5→v6 migration since v6 is single-locale-per-tenant at the storage layer.

**Record types it targets:** Any record whose keys contain a `#L#<locale>#` segment.

**Context type required:** `BaseTransformContext`
