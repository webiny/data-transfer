# Audit Log Creator Fallback — Design Spec

**Date:** 2026-04-29
**Author:** Bruno Zorić (design), Claude (drafting)

---

## Problem

Some audit log records (v5 CMS entries with `modelId: "acoSearchRecord-auditlogs"`) do not have
`revisionCreatedBy` / `revisionCreatedOn` in the root. `coreFieldsTransformer` currently reads
those fields unconditionally; when they are absent `createdBy` and `createdOn` end up `undefined`,
and `storageShapeTransformer` produces a broken target record with `undefined` values in every GSI
key that embeds `createdBy.id` or the timestamp.

The creator / timestamp data **does** exist in these records — it is stored inside
`values["object@data"]["text@data"]` as a stringified compressed envelope:

```json
{ "value": "<gzip-compressed-base64>", "compression": "gzip" }
```

After decompression and JSON parse, the payload is either a plain object or an array of objects,
each carrying the creator fields at their root.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Priority order for `createdBy`**: `revisionCreatedBy` → `createdBy` → `savedBy` → `revisionSavedBy`. Try root fields first; fall back to decompressed payload. | `revisionCreatedBy` is the most precise (the revision author). Any saved-by field is still better than nothing. |
| 2 | **Priority order for `createdOn`**: `revisionCreatedOn` → `createdOn` → `savedOn`. Same two-phase approach. | Same rationale. |
| 3 | Decompression happens in `coreFieldsTransformer` only when root fields are absent. The transformer becomes `async`. | Decompression needs `ctx.compressionHandler` which is on the base context. Keeping the fallback co-located with the primary extraction avoids a second transformer pass. |
| 4 | Compressed payload is an envelope `{value: string, compression: string}`. Use `ctx.compressionHandler.decompress(value)` (the handler reads `compression` internally from the compressed buffer). Parse the result as JSON. | Matches the pattern used by `OsScanner`/`OsProcessor` for gzip records. |
| 5 | If the payload is an array, use `payload[0]`. | The first entry is sufficient for creator attribution. Multiple entries in one payload are not expected in practice. |
| 6 | If `createdBy` **or** `createdOn` cannot be resolved after both phases: log a `warn` with `PK`/`SK`, return early from `coreFieldsTransformer` without setting the fields. | These records are unrecoverable without manual inspection. Failing silently would produce broken GSI keys. Throwing would abort the entire transfer. A warn + skip is the right operational tradeoff. |
| 7 | `storageShapeTransformer` guards for missing `createdBy` / `createdOn`: logs a `warn` and returns without calling `ctx.replace()`. | The downstream processor's `onEnd` must not receive a partially-transformed record. Returning early leaves `ctx.record` in its pre-storageShape state. |
| 8 | `AuditLogProcessor.putAuditLog` gates on `record.TYPE === "auditLog.log"`. If the type is anything else, the emit is skipped silently. | `storageShapeTransformer` sets `TYPE: "auditLog.log"` only on successfully transformed records. Raw CMS entries that bypassed the transform have a different TYPE and must not be written to the audit log table. No coupling via flags. |

---

## Data flow

```
audit log CMS entry
        │
        ▼
coreFieldsTransformer (async)
  ├─ root has revisionCreatedBy?  → set record.createdBy / record.createdOn  ─────────────────┐
  └─ missing → decompress values["object@data"]["text@data"]                                  │
       ├─ success → pick createdBy / createdOn from priority list                             │
       └─ fail / fields still absent → ctx.logger.warn + return early                        │
                                         (record.createdBy stays undefined)                   │
                                                                                              ▼
dataFieldsTransformer            (unchanged — extracts app/action/entity/content)
        │
        ▼
storageShapeTransformer
  ├─ record.createdBy present?  → ctx.replace(full target shape, TYPE="auditLog.log")  ──────┐
  └─ missing → ctx.logger.warn + return early (record TYPE stays CMS entry TYPE)             │
                                                                                              │
AuditLogProcessor.onEnd                                                                       │
  └─ ctx.putAuditLog(ctx.record)                                                              │
       ├─ record.TYPE === "auditLog.log"  → emit AuditLogPutRecord  ◄────────────────────────┘
       └─ anything else                  → no-op (silently skip)
```

---

## Compressed payload format

`values["object@data"]["text@data"]` is a JSON string. After `JSON.parse`:

```typescript
interface CompressedEnvelope {
    value: string;       // compressed content (base64-encoded)
    compression: string; // e.g. "gzip"
}
```

After `ctx.compressionHandler.decompress(envelope.value)`, the result is a JSON string.
After the second `JSON.parse`, the result is:

```typescript
type CreatorPayload =
    | CreatorObject
    | CreatorObject[];

interface CreatorObject {
    revisionCreatedBy?: { id: string; displayName: string; type: string };
    revisionCreatedOn?: string;
    createdBy?:         { id: string; displayName: string; type: string };
    createdOn?:         string;
    savedBy?:           { id: string; displayName: string; type: string };
    savedOn?:           string;
    revisionSavedBy?:   { id: string; displayName: string; type: string };
    // ...other fields irrelevant to this transformer
}
```

---

## Files changed

| File | Change |
|------|--------|
| `src/transformers/auditLogs/coreFieldsTransformer.ts` | Add async decompression fallback; guard when fields remain missing. |
| `src/transformers/auditLogs/storageShapeTransformer.ts` | Guard for missing `createdBy`/`createdOn`; log + return early. |
| `src/features/AuditLogProcessor/AuditLogProcessor.ts` | Gate `putAuditLog` on `record.TYPE === "auditLog.log"`. |
| `__tests__/transformers/auditLogs/coreFieldsTransformer.test.ts` | Add tests: decompression fallback, priority order, missing-fields skip. |
| `__tests__/transformers/auditLogs/storageShapeTransformer.test.ts` | Add test: returns early when `createdBy` absent. |
| `__tests__/features/AuditLogProcessor/AuditLogProcessor.test.ts` | New: TYPE-gate test — non-`auditLog.log` record is not emitted. |

---

## Implementation plan

1. **`AuditLogProcessor`** — add TYPE gate to `putAuditLog`. Smallest blast radius; lets the other changes be tested end-to-end. Commit.
2. **`storageShapeTransformer`** — add guard + early return when `createdBy`/`createdOn` missing. Update test. Commit.
3. **`coreFieldsTransformer`** — make async; add two-phase extraction (root → decompression fallback). Update tests. Commit.
