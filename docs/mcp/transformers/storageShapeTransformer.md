---
name: storageShapeTransformer
description: Builds the final v6 audit-log storage record — nine GSI key sets plus the data envelope and TTL expiry.
category: Transformers
---

# storageShapeTransformer

**Import:** `import { storageShapeTransformer } from "@webiny/data-transfer";`

**Category:** auditLogs

**What it does:** Requires `createdBy`/`createdOn` (and the other fields populated by `coreFieldsTransformer` and `dataFieldsTransformer`) already present on the record — logs a warning and skips otherwise. Replaces the record wholesale (`ctx.replace`) with `PK: T#<tenant>#AUDIT_LOG`, `SK: <id>`, `TYPE: auditLog.log`, and nine `GSI<n>_PK/SK` pairs indexing by app, createdBy, entity, entityId, and action in various combinations, plus a `data` envelope mirroring the fields and a root-level `expiresAt` as Unix-seconds TTL (DynamoDB reads this directly). Must run last in the audit-log transformer chain.

**Record types it targets:** Audit log records that have already passed through `coreFieldsTransformer` and `dataFieldsTransformer`.

**Context type required:** `BaseTransformContext`
