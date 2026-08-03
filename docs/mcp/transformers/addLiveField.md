---
name: addLiveField
description: Computes and attaches the `live` pointer (published revision version) to CMS entry records.
category: Transformers
---

# addLiveField

**Import:** `import { addLiveField } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Resolves the published revision version for a CMS entry and sets `data.live = { version }` (or `null` if none is published). The published (`P`) record and a published latest (`L` with `status: "published"`) record already know their own version; any other revision queries the source `P` record via `ctx.querySourceRecord`. Results are cached per entry PK via `ctx.cache` to avoid repeat queries. Skips internal models (`fmfile`, `wbyfmfile`).

**Record types it targets:** CMS entry records (`data.modelId` present), keyed like `T#<tenant>#L#<locale>#CMS#CME#<id>` with `SK` of `P` or a revision number/`L`.

**Context type required:** `DdbCoreTransformContext`
