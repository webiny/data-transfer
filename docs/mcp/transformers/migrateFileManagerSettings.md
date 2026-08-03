---
name: migrateFileManagerSettings
description: Converts a legacy File Manager settings record into the v6 KeyValueStore format.
category: Transformers
---

# migrateFileManagerSettings

**Import:** `import { migrateFileManagerSettings } from "@webiny/data-transfer";`

**Category:** file-manager

**What it does:** For records with `original.TYPE === "fm.settings"`, replaces the record wholesale (`ctx.replace`) with a `KeyValueStore` shape: `PK: KV#<tenant>:FileManager/General`, `SK: A`, `data.value` holding all settings fields except `tenant`. Expects `wrapInData` to have run first so settings live under `record.data`.

**Record types it targets:** File Manager settings records (`TYPE === "fm.settings"`).

**Context type required:** `BaseTransformContext`
