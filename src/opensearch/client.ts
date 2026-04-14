import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";

export type { Client };

// ============================================================================
// Auth Types
// ============================================================================

export interface OpenSearchBasicAuth {
  type: "basic";
  username: string;
  password: string;
}

export interface OpenSearchAwsAuth {
  type: "aws";
  region: string;
  /** "opensearch" for managed OpenSearch, "opensearch-serverless" for OpenSearch Serverless */
  service: "opensearch" | "opensearch-serverless";
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export type OpenSearchAuth = OpenSearchBasicAuth | OpenSearchAwsAuth;

// ============================================================================
// Client Factory
// ============================================================================

export function createOpenSearchClient(endpoint: string, auth: OpenSearchAuth): Client {
  if (auth.type === "basic") {
    return new Client({
      node: endpoint,
      auth: {
        username: auth.username,
        password: auth.password
      }
    });
  }

  return new Client({
    ...AwsSigv4Signer({
      region: auth.region,
      service: auth.service === "opensearch-serverless" ? "aoss" : "es",
      getCredentials: async () => ({
        accessKeyId: auth.accessKeyId,
        secretAccessKey: auth.secretAccessKey,
        sessionToken: auth.sessionToken
      })
    }),
    node: endpoint
  });
}
