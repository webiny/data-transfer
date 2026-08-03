---
name: replaceFileUrls
description: Rewrites file-manager URLs embedded in CMS "file" and "rich-text" field values from a source domain to a target domain.
category: Transformers
---

# replaceFileUrls

**Import:** `import { replaceFileUrls } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** A factory — call `replaceFileUrls(config)` with the resolved `MigrationConfig` to get the transformer. It looks up the CMS entry's model, walks `data.values` via the shared field visitor, and for `file`-type fields does a plain string replace of `config.fileUrls.source` with `config.fileUrls.target` (including array values); for `rich-text` fields it decompresses the value, replaces the URL substring inside `state`/`html`, and re-compresses. No-ops entirely if `config.fileUrls.source`/`target` aren't both set.

**Record types it targets:** CMS entry records with `data.modelId` and `data.values` containing `file` or `rich-text` fields.

**Context type required:** `BaseTransformContext`
