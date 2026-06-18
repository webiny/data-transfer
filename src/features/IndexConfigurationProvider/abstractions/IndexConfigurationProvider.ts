import { createAbstraction } from "~/base/index.ts";

interface IndexConfiguration {
    mappings?: Record<string, unknown>;
    settings?: Record<string, unknown>;
}

interface IIndexConfigurationProvider {
    getConfiguration(indexName: string): IndexConfiguration;
}

export const IndexConfigurationProvider = createAbstraction<IIndexConfigurationProvider>(
    "Core/IndexConfigurationProvider"
);

export namespace IndexConfigurationProvider {
    export type Interface = IIndexConfigurationProvider;
    export type Configuration = IndexConfiguration;
}
