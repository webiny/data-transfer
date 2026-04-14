import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";

export type { Client };

// ============================================================================
// Types
// ============================================================================

export interface OpenSearchClientConfig {
  endpoint: string;
  region: string;
  service: "opensearch" | "opensearch-serverless";
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

// ============================================================================
// Client Factory
// ============================================================================

export function createOpenSearchClient(config: OpenSearchClientConfig): Client {
  return new Client({
    ...AwsSigv4Signer({
      region: config.region,
      service: config.service === "opensearch-serverless" ? "aoss" : "es",
      getCredentials: async () => ({
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
        sessionToken: config.credentials.sessionToken
      })
    }),
    node: config.endpoint
  });
}
