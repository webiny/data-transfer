import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { OpenSearchClient as OpenSearchClientAbstraction } from "./abstractions/OpenSearchClient.js";
import { OpenSearchClientConfig } from "./abstractions/OpenSearchClientConfig.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
class OpenSearchClientImpl {
  client;
  constructor(config, logger) {
    // Normalize credentials: user config may pass either a literal
    // object or a provider function (fromAwsProfile). AwsSigv4Signer
    // wants a `getCredentials` async function, so wrap either shape.
    const credentialsInput = config.credentials;
    const getCredentials = async () => {
      const resolved =
        typeof credentialsInput === "function" ? await credentialsInput() : credentialsInput;
      return {
        accessKeyId: resolved.accessKeyId,
        secretAccessKey: resolved.secretAccessKey,
        sessionToken: resolved.sessionToken
      };
    };
    this.client = new Client({
      ...AwsSigv4Signer({
        region: config.region,
        service: config.service === "opensearch-serverless" ? "aoss" : "es",
        getCredentials
      }),
      node: config.endpoint,
      maxRetries: config.maxRetries ?? 3
    });
    this.client.on("response", (err, _meta) => {
      if (err && "statusCode" in err && err.statusCode === 429) {
        logger.debug(`OpenSearch throttled — 429 Too Many Requests`);
      }
    });
  }
  async indexExists(index) {
    const { body } = await this.client.indices.exists({ index });
    return Boolean(body);
  }
  async createIndex(index, body) {
    await this.client.indices.create({
      index,
      body: body
    });
  }
  async listIndexes() {
    const { body } = await this.client.cat.indices({ format: "json" });
    return body || [];
  }
  async putIndexSettings(index, settings) {
    await this.client.indices.putSettings({
      index,
      body: settings
    });
  }
  async getIndexSettings(index) {
    const { body } = await this.client.indices.getSettings({ index });
    const indexBody = body[index];
    const refreshInterval = indexBody?.settings?.index?.refresh_interval;
    return {
      refreshInterval
    };
  }
}
export const OpenSearchClient = OpenSearchClientAbstraction.createImplementation({
  implementation: OpenSearchClientImpl,
  dependencies: [OpenSearchClientConfig, Logger]
});
//# sourceMappingURL=OpenSearchClient.js.map
