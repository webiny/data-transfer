import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { OpenSearchClient as OpenSearchClientAbstraction } from "./abstractions/OpenSearchClient.ts";
import { OpenSearchClientConfig } from "./abstractions/OpenSearchClientConfig.ts";

class OpenSearchClientImpl implements OpenSearchClientAbstraction.Interface {
    private client: Client;

    public constructor(config: OpenSearchClientConfig.Interface) {
        // Normalize credentials: user config may pass either a literal
        // object or a provider function (fromAwsProfile). AwsSigv4Signer
        // wants a `getCredentials` async function, so wrap either shape.
        const credentialsInput = config.credentials;
        const getCredentials = async (): Promise<OpenSearchClientConfig.Credentials> => {
            const resolved =
                typeof credentialsInput === "function"
                    ? await credentialsInput()
                    : credentialsInput;
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

    public async getIndexSettings(
        index: string
    ): Promise<OpenSearchClientAbstraction.SettingsResponse> {
        const { body } = await this.client.indices.getSettings({ index });
        const indexBody = (body as Record<string, any>)[index];
        const refreshInterval = indexBody?.settings?.index?.refresh_interval as string | undefined;
        return {
            refreshInterval
        };
    }
}

export const OpenSearchClient = OpenSearchClientAbstraction.createImplementation({
    implementation: OpenSearchClientImpl,
    dependencies: [OpenSearchClientConfig]
});
