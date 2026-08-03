---
name: extractImageMetadata
description: Extracts image dimensions, EXIF, and IPTC metadata from raster image files and renames the legacy meta field.
category: Transformers
---

# extractImageMetadata

**Import:** `import { extractImageMetadata } from "@webiny/data-transfer";`

**Category:** file-manager

**What it does:** Deletes the legacy `values["object@meta"]` field. For non-raster or non-image types it sets `values["object@metadata"] = {}` and returns. For raster images, it resolves the file's S3 key (preferring an existing KV metadata record's `bucketKey`, falling back to `text@key`), reads the file via `ctx.getFile`, and uses `sharp` for dimensions/format/orientation plus `exifreader` for EXIF/IPTC tags, writing the result to `values["object@metadata"]`. Results are cached per file ID via `ctx.cache` so each file is only fetched/processed once across records.

**Record types it targets:** File-manager file records with `data.values["text@type"]` set (image files get full extraction; others get an empty metadata object).

**Context type required:** `DdbTransformContext`
