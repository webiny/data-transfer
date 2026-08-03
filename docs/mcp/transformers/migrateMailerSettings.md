---
name: migrateMailerSettings
description: Converts a legacy Mailer settings record into the v6 KeyValueStore format.
category: Transformers
---

# migrateMailerSettings

**Import:** `import { migrateMailerSettings } from "@webiny/data-transfer";`

**Category:** mailer

**What it does:** For records identified by `original.SK === "L"` and `original.modelId === "mailerSettings"`, replaces the record wholesale (`ctx.replace`) with a `KeyValueStore` shape: `PK: KV#<tenant>:Mailer/Settings/Transport`, `SK: A`, `data.value` holding `data.values`. Expects `wrapInData` to have run first so values live under `record.data.values`.

**Record types it targets:** Mailer settings records (`SK === "L"`, `modelId === "mailerSettings"`).

**Context type required:** `BaseTransformContext`
