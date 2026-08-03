---
name: transformPermissions
description: Migrates security role permissions to v6 shape — drops content.i18n, flattens per-locale model lists, and resolves group IDs to slugs.
category: Transformers
---

# transformPermissions

**Import:** `import { transformPermissions } from "@webiny/data-transfer";`

**Category:** security

**What it does:** Walks `data.permissions`: drops any `content.i18n` permission entirely; for `cms.contentModel`, flattens a per-locale `models` object (e.g. `{ "en-US": [...] }`) down to the default locale's array; for `cms.contentModelGroup`, resolves each per-locale group ID to its slug by querying `T#<tenant>#GROUP#<groupId>` and replaces `groups` with the resolved slug array. Default locale is parsed out of the record's own `PK` (`#L#<locale>#`). Expects `wrapInData` to have run first.

**Record types it targets:** Security role records with an array `data.permissions`.

**Context type required:** `DdbCoreTransformContext`
