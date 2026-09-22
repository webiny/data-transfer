---
name: fixLongText
description: Decompresses `long-text` field values that are still stored as a `{ compression, value }` envelope, so they can be indexed into OpenSearch.
category: Transformers
---

# fixLongText

**Import:** `import { fixLongText } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Walks every field in a CMS entry's `data.values` (including fields nested inside `object` and `dynamicZone` fields) and, for each `long-text` field whose value is still a compression envelope (`{ compression, value }`), decompresses it back into a plain string. Envelopes carrying `isArray: true` (multi-value long-text fields) are `JSON.parse`d back into an array. Values that are already plain strings, numbers or arrays are left untouched. On a decompression failure it logs a warning and falls back to `""` (or `[]`), mirroring `LongTextStorageTransform.fromStorage` in `webiny-js`.

**OS document shape:** An OS-table row stores the OpenSearch document gzipped under `data`; `OsScanner` unpacks it, so `ctx.record.data` is the `CmsIndexEntry`. That document carries two parallel field trees — `values` (searchable, mapped in the index) and `rawValues` (non-searchable passthrough) — built by `prepareEntryToIndex` in `api-headless-cms-utils-os` and mirrored into nested `object` fields by `ObjectFieldIndex.processToIndex`. Which tree a field lands in is per field type: `LongTextFieldIndex` writes to `values` only, `RichTextFieldIndex` to `rawValues` only. So long-text is fixed in `values`, and `rawValues` is deliberately left alone — long-text is never written there and that tree is not mapped as `text`.

**Why it exists:** In DynamoDB, `long-text` is *meant* to be stored compressed. OpenSearch documents hold the decompressed value, because entries pass through `fromStorage` before indexing and the index mapping for those fields is `text`. Some v5 records reached OpenSearch with the raw envelope intact — usually long-text fields nested inside `object` fields — which makes v6 indexing fail with:

```
failed to parse field [values.object@pageSettings.object@generalPageSettings.long-text@metaDescription]
of type [text] ... Preview of field's value: '{compression=gzip, value=H4sIAAAA...}'
```

**Record types it targets:** CMS entry records with `data.modelId`/`data.values`.

**Context type required:** `BaseTransformContext`

**Note:** OS-mode only. Do not add it to a DynamoDB pipeline — there, the compressed envelope is the correct storage shape.
