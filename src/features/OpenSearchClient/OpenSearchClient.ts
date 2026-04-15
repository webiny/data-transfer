import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { OpenSearchClient } from "./abstractions/OpenSearchClient.ts";
import { OpenSearchClientConfig } from "./abstractions/OpenSearchClientConfig.ts";

export class OpenSearchClientImpl implements OpenSearchClient.Interface {
  private client: Client;

  constructor(config: OpenSearchClientConfig.Interface) {
    this.client = new Client({
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

  async indexExists(index: string): Promise<boolean> {
    const { body } = await this.client.indices.exists({ index });
    return Boolean(body);
  }

  async createIndex(index: string, body?: OpenSearchClient.CreateBody): Promise<void> {
    await this.client.indices.create({
      index,
      body: body as any
    });
  }

  async listIndexes(): Promise<OpenSearchClient.Info[]> {
    const { body } = await this.client.cat.indices({ format: "json" });
    return (body || []) as OpenSearchClient.Info[];
  }

  async putIndexSettings(index: string, settings: OpenSearchClient.Settings): Promise<void> {
    await this.client.indices.putSettings({
      index,
      body: settings
    });
  }
}
