import { createAbstraction } from "~/base/index.js";
import type { IndexConfigurationProvider } from "./IndexConfigurationProvider.ts";

interface IIndexConfigurationResolver {
    resolve(indexName: string): IndexConfigurationProvider.Configuration;
}

export const IndexConfigurationResolver = createAbstraction<IIndexConfigurationResolver>(
    "Core/IndexConfigurationResolver"
);

export namespace IndexConfigurationResolver {
    export type Interface = IIndexConfigurationResolver;
}
