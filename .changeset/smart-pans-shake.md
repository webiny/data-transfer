---
"@webiny/data-transfer": minor
---

Add the `fixLongText` transformer and register it in the `v5-to-v6-os` preset.

Some v5 OpenSearch documents carry `long-text` values as the raw DynamoDB compression envelope (`{ compression, value }`) instead of plain text — most often for long-text fields nested inside `object` fields. Indexing those into v6 fails with `failed to parse field [...] of type [text]`. The new transformer decompresses those values back into strings (and arrays, for multi-value fields) before they reach OpenSearch.
