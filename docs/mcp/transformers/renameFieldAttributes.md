---
name: renameFieldAttributes
description: Renames legacy CMS model field attributes (helpText, placeholderText, multipleValues) to their v6 equivalents.
category: Transformers
---

# renameFieldAttributes

**Import:** `import { renameFieldAttributes } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Recursively walks a CMS model's `data.fields` (including nested object fields and dynamic-zone template fields) renaming `helpText` → `note`, `placeholderText` → `placeholder`, and `multipleValues` → `list`. Only renames when the target attribute doesn't already exist, and always deletes the old attribute.

**Record types it targets:** CMS model definition records (`data.fields` array present).

**Context type required:** `BaseTransformContext`
