import type { DdbTransformContext } from "../../features/TransformContext/abstractions/contextAliases.js";
/**
 * Renames `object@meta` → `object@metadata` for all file records.
 * For raster images, reads the file from S3 and extracts dimensions, EXIF, and IPTC.
 * Results are cached by fileId via ctx.cache so each file is only fetched once.
 */
export declare const extractImageMetadata: import("../../index.ts").Transformer.Interface<
  DdbTransformContext.Interface<import("../../domain/transform/types/records.ts").BaseRecord>
>;
//# sourceMappingURL=extractImageMetadata.d.ts.map
