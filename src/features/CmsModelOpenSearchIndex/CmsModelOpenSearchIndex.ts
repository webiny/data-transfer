import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration/index.js";
import { CmsModelOpenSearchIndex as CmsModelOpenSearchIndexAbstraction } from "@webiny/api-headless-cms-utils-os/exports/api/cms/opensearch.js";

/**
 * Default index settings for CMS model indexes: Webiny's base OpenSearch
 * body, never shared. Override by registering another
 * `CmsModelOpenSearchIndex` implementation in the user setup.
 */
class CmsModelOpenSearchIndexImpl implements CmsModelOpenSearchIndexAbstraction.Interface {
    public async execute(): Promise<CmsModelOpenSearchIndexAbstraction.Result> {
        return {
            settings: structuredClone(getBaseConfiguration()),
            shared: false
        };
    }
}

export const CmsModelOpenSearchIndex = CmsModelOpenSearchIndexAbstraction.createImplementation({
    implementation: CmsModelOpenSearchIndexImpl,
    dependencies: []
});
