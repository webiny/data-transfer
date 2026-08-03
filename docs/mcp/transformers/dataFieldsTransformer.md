---
name: dataFieldsTransformer
description: Lifts audit-log content fields (app, action, message, entity, tags, content) out of the legacy values envelope onto the record root.
category: Transformers
---

# dataFieldsTransformer

**Import:** `import { dataFieldsTransformer } from "@webiny/data-transfer";`

**Category:** auditLogs

**What it does:** Reads `values["object@data"]` and copies `text@app` → `record.app`, `text@action` → `record.action`, `text@message` → `record.message`, `text@entity` → `record.entity`, and `text@data` → `record.content`; sets `record.entityId` from `record.entryId`; sets `record.tags` from `values["text@tags"]` (defaulting to `[]`). Intended to run before `storageShapeTransformer`, which consumes these root-level fields.

**Record types it targets:** Audit log source records with `values["object@data"]`.

**Context type required:** `BaseTransformContext`
