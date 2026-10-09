import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration/index.js";
import {
    CmsModelOpenSearchIndex,
    CmsModelOpenSearchIndexFeature,
    CmsModelOpenSearchIndexProvider
} from "~/features/CmsModelOpenSearchIndex/index.js";

const model = { modelId: "blogPost", tenant: "acme" } as CmsModelOpenSearchIndex.Model;

describe("CmsModelOpenSearchIndexFeature", () => {
    it("defaults to Webiny's base body with a non-shared, tenant-scoped index", async () => {
        const container = new Container();
        CmsModelOpenSearchIndexFeature.register(container);

        const result = await container.resolve(CmsModelOpenSearchIndexProvider).execute({ model });

        expect(result.shared).toBe(false);
        expect(result.index).toBe("acme-headless-cms-blogpost");
        expect(result.settings).toEqual(getBaseConfiguration());
    });

    it("lets a user registration replace the default index settings", async () => {
        const container = new Container();
        CmsModelOpenSearchIndexFeature.register(container);

        class SharedIndex implements CmsModelOpenSearchIndex.Interface {
            public async execute(): Promise<CmsModelOpenSearchIndex.Result> {
                return { settings: { settings: { number_of_shards: 3 } }, shared: true };
            }
        }
        container.register(
            CmsModelOpenSearchIndex.createImplementation({
                implementation: SharedIndex,
                dependencies: []
            })
        );

        const result = await container.resolve(CmsModelOpenSearchIndexProvider).execute({ model });

        expect(result.shared).toBe(true);
        expect(result.index).toBe("root-headless-cms-blogpost");
        expect(result.settings).toEqual({ settings: { number_of_shards: 3 } });
    });
});
