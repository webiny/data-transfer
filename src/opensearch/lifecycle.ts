import type { Client } from "@opensearch-project/opensearch";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger();

export interface MigrationLifecycleHook {
    name: string;
    execute(): Promise<void>;
}

function getIndexNames(indexes: Array<{ index?: string }>): string[] {
    return indexes
        .map(idx => idx.index)
        .filter((name): name is string => !!name && !name.startsWith("."));
}

async function forEachUserIndex(
    client: Client,
    callback: (indexName: string) => Promise<void>
): Promise<void> {
    const { body: indexes } = await client.cat.indices({ format: "json" });

    if (!indexes || indexes.length === 0) {
        logger.info("No indexes found in target OpenSearch cluster.");
        return;
    }

    const indexNames = getIndexNames(indexes);

    if (indexNames.length === 0) {
        logger.info("No user indexes found (only system indexes).");
        return;
    }

    logger.info(`Found ${indexNames.length} indexes: ${indexNames.join(", ")}`);

    for (const indexName of indexNames) {
        await callback(indexName);
    }
}

export class OpenSearchBeforeMigration implements MigrationLifecycleHook {
    readonly name = "opensearch:before";
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async execute(): Promise<void> {
        await forEachUserIndex(this.client, async indexName => {
            try {
                logger.info(`Disabling refresh on index: ${indexName}`);
                await this.client.indices.putSettings({
                    index: indexName,
                    body: { index: { refresh_interval: "-1" } }
                });
            } catch (error) {
                logger.warn(
                    { error },
                    `Failed to disable refresh on index: ${indexName}. Skipping.`
                );
            }
        });

        logger.info("Indexing disabled on all target indexes.");
    }
}

export class OpenSearchAfterMigration implements MigrationLifecycleHook {
    readonly name = "opensearch:after";
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async execute(): Promise<void> {
        await forEachUserIndex(this.client, async indexName => {
            try {
                logger.info(`Enabling refresh on index: ${indexName}`);
                await this.client.indices.putSettings({
                    index: indexName,
                    body: { index: { refresh_interval: "1s" } }
                });
            } catch (error) {
                logger.warn(
                    { error },
                    `Failed to enable refresh on index: ${indexName}. Skipping.`
                );
            }
        });

        logger.info("Indexing restored on all target indexes.");
    }
}
