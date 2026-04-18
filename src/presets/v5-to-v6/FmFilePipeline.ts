import { isFmFile } from "~/domain/transform/filters.ts";
import { createMetadata } from "../../transformers/file-manager/createMetadata.ts";
import { extractImageMetadata } from "../../transformers/file-manager/extractImageMetadata.ts";
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
        this.use(createMetadata);
        this.use(extractImageMetadata);
    }
}
