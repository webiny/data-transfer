---
"@webiny/data-transfer": patch
---

Fix `addLiveField` in the OS lane: `OsProcessor.querySourceRecord` / `queryTargetRecord` now return the companion-table row with `data` decompressed, so the published revision's `version` is readable and `live: { version }` is written correctly for draft-over-published entries. `live` is only ever `{ version: <positive integer> }` or `null`; the cache check no longer relies on truthiness.
