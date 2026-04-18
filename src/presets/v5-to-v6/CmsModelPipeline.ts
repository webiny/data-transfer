import { PipelineBuilder } from "~/domain/transform/PipelineBuilder.ts";
import { isCmsModel } from "~/domain/transform/filters.ts";
import { wrapInData } from "../../transformers/global/wrapInData.ts";
import { addGsiTenant } from "../../transformers/global/addGsiTenant.ts";
import { removeLocale } from "../../transformers/global/removeLocale.ts";
import { removeAttributes } from "../../transformers/global/removeAttributes.ts";
import { transformModelGroup } from "../../transformers/cms/transform-model-group.ts";
import { renameFieldAttributes } from "../../transformers/cms/rename-field-attributes.ts";

/**
 * Pre-configured pipeline for CMS Models with all v5-to-v6 transformations.
 */
export class CmsModelPipeline extends PipelineBuilder {
    constructor() {
        super();

        this.filter(isCmsModel);
        this.use(wrapInData);
        this.use(addGsiTenant);
        this.use(removeLocale);
        this.use(transformModelGroup);
        this.use(renameFieldAttributes);
        this.use(removeAttributes);
    }
}
