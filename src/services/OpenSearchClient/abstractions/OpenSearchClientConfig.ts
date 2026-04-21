import { createAbstraction } from "~/base/index.ts";

// ============================================================================
// Types
// ============================================================================

interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    /** Populated when credentials come from a provider that rotates them. */
    expiration?: Date;
}

type AwsCredentialsProvider = () => Promise<AwsCredentials>;

export interface IOpenSearchClientConfig {
    endpoint: string;
    region: string;
    service: "opensearch" | "opensearch-serverless";
    // Either a literal credentials object or a provider function (e.g.
    // `fromAwsProfile`). OpenSearchClient normalizes at construction time.
    credentials: AwsCredentials | AwsCredentialsProvider;
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
    export type Credentials = AwsCredentials;
    export type CredentialsProvider = AwsCredentialsProvider;
}
