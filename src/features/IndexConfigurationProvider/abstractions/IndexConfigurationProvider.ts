import type { OpenSearchIndexRequestBody } from "@webiny/api-opensearch/types.js";
import { createAbstraction } from "~/base/index.js";

interface IndexConfiguration {
    mappings?: OpenSearchIndexRequestBody["mappings"];
    settings?: OpenSearchIndexRequestBody["settings"];
}

interface IIndexConfigurationProvider {
    getConfiguration(indexName: string, base: IndexConfiguration): IndexConfiguration;
}

export const IndexConfigurationProvider = createAbstraction<IIndexConfigurationProvider>(
    "Core/IndexConfigurationProvider"
);

export namespace IndexConfigurationProvider {
    export type Interface = IIndexConfigurationProvider;
    export type Configuration = IndexConfiguration;
}
