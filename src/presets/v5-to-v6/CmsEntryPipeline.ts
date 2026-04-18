import { PipelineBuilder } from "~/domain/transform/PipelineBuilder.ts";
import { isCmsEntry } from "~/domain/transform/filters.ts";

// Import transformers
import { wrapInData } from "../../transformers/global/wrapInData.ts";
import { addGsiTenant } from "../../transformers/global/addGsiTenant.ts";
import { removeLocale } from "../../transformers/global/removeLocale.ts";
import { removeAttributes } from "../../transformers/global/removeAttributes.ts";
import { fixCmePk } from "../../transformers/cms/fixCmePk.ts";
import { fixBrokenStorageKeys } from "../../transformers/cms/fixBrokenStorageKeys.ts";
import { transformRichText } from "../../transformers/cms/transformRichText.ts";
import { updateModelIds } from "../../transformers/cms/updateModelIds.ts";
import { removeFolderRevision } from "../../transformers/cms/removeFolderRevision.ts";

/**
 * Pre-configured pipeline for CMS Entries with all v5-to-v6 transformations.
 */
export class CmsEntryPipeline extends PipelineBuilder {
    constructor() {
        super();

        // Configure filter
        this.filter(isCmsEntry);

        // Configure transformers (wrapInData MUST be first)
        this.use(wrapInData);
        this.use(addGsiTenant);
        this.use(removeLocale);
        this.use(fixCmePk);
        this.use(fixBrokenStorageKeys);
        this.use(transformRichText);
        this.use(updateModelIds);
        this.use(removeFolderRevision);
        this.use(removeAttributes);
    }
}
