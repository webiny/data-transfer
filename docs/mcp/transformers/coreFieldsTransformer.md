---
name: coreFieldsTransformer
description: Resolves an audit-log record's creator identity and creation time, and stamps a fresh id and TTL expiry.
category: Transformers
---

# coreFieldsTransformer

**Import:** `import { coreFieldsTransformer } from "@webiny/data-transfer";`

**Category:** auditLogs

**What it does:** Tries root-level fields first (`revisionCreatedBy`/`createdBy`/`savedBy`/`revisionSavedBy` and their `*On` counterparts, in priority order); if unavailable, decompresses the legacy `values["object@data"]["text@data"]` envelope and looks for creator info in the payload or its `before`/`after` sub-objects. Sets `record.id` (new `mdbid()`), `record.createdBy`, `record.createdOn`, and `record.expiresAt` (now + 60 days, ISO string). If no creator can be resolved, logs a warning and leaves the record untouched — downstream pipeline logic is expected to drop such records.

**Record types it targets:** Audit log source records (v5 `cms.entry`-shaped audit log entries).

**Context type required:** `BaseTransformContext`
