import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { OpenSearchClient as OpenSearchClientAbstraction } from "./abstractions/OpenSearchClient.ts";
import { OpenSearchClientConfig } from "./abstractions/OpenSearchClientConfig.ts";

class OpenSearchClientImpl implements OpenSearchClientAbstraction.Interface {
    private client: Client;

    public constructor(config: OpenSearchClientConfig.Interface) {
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

    public async indexExists(index: string): Promise<boolean> {
        const { body } = await this.client.indices.exists({ index });
        return Boolean(body);
    }

    public async createIndex(
        index: string,
        body?: OpenSearchClientAbstraction.CreateBody
    ): Promise<void> {
        await this.client.indices.create({
            index,
            body: body as any
        });
    }

    public async listIndexes(): Promise<OpenSearchClientAbstraction.Info[]> {
        const { body } = await this.client.cat.indices({ format: "json" });
        return (body || []) as OpenSearchClientAbstraction.Info[];
    }

    public async putIndexSettings(
        index: string,
        settings: OpenSearchClientAbstraction.Settings
    ): Promise<void> {
        await this.client.indices.putSettings({
            index,
            body: settings
        });
    }
}

export const OpenSearchClient = OpenSearchClientAbstraction.createImplementation({
    implementation: OpenSearchClientImpl,
    dependencies: [OpenSearchClientConfig]
});
