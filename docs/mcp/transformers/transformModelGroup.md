---
name: transformModelGroup
description: Resolves a CMS model's group ID reference to its slug string.
category: Transformers
---

# transformModelGroup

**Import:** `import { transformModelGroup } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Replaces `data.group` (an object with `id`/`name`) with a plain slug string by querying the source group record (`T#<tenant>#L#<locale>#CMS#CMG` / `group.id`). Falls back to a slugified `group.name` (or `"ungrouped"`) if the group record isn't found, logging a warning. Expects `wrapInData` to have run first so `group` lives at `data.group`.

**Record types it targets:** CMS model definition records with an object-shaped `data.group`.

**Context type required:** `DdbCoreTransformContext`
