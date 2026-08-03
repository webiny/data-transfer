---
name: transformRichText
description: Converts legacy Slate-based rich-text field values into the Lexical state + rendered HTML format.
category: Transformers
---

# transformRichText

**Import:** `import { transformRichText } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** For every `rich-text` field in a CMS entry's `data.values`, decompresses the stored value, and if it has a lexical `root` shape, re-renders it: empty `root.children` gets replaced with `generateInitialLexicalValue()`, then the value is re-compressed as `{ state, html }` (state = JSON string, html = rendered via the internal `LexicalRenderer`). Logs and skips a field on transform failure rather than throwing.

**Record types it targets:** CMS entry records with `data.modelId`/`data.values` containing compressed `rich-text` field values.

**Context type required:** `BaseTransformContext`
