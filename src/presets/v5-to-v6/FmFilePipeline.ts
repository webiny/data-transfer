import { isFmFile } from "../../core/pipelines.ts";
import { createFileMetadata } from "../../transformers/file-manager/create-metadata.ts";
import { extractImageMetadata } from "../../transformers/file-manager/extract-image-metadata.ts";
import { CmsEntryPipeline } from "./CmsEntryPipeline.js";

/**
 * Pre-configured pipeline for File Manager files with all v5-to-v6 transformations.
 */
export class FmFilePipeline extends CmsEntryPipeline {
  constructor() {
    super();

    // Configure filter
    this.filter(isFmFile);

    // File Manager-specific transformers
    this.use(createFileMetadata);
    this.use(extractImageMetadata);
  }
}
