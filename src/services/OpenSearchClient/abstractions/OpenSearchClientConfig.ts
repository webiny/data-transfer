import { createAbstraction } from "~/base/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface IOpenSearchClientConfig {
    endpoint: string;
    region: string;
    service: "opensearch" | "opensearch-serverless";
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    maxRetries?: number;
}

// ============================================================================
// Abstraction
// ============================================================================

export const OpenSearchClientConfig = createAbstraction<IOpenSearchClientConfig>(
    "Core/OpenSearchClientConfig"
);

export namespace OpenSearchClientConfig {
    export type Interface = IOpenSearchClientConfig;
}
