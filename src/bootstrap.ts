import { Container } from "@webiny/di";
import { MigrationConfig } from "./features/MigrationConfig/index.ts";
import { MigrationConfigFeature } from "./features/MigrationConfig/index.ts";
import { DynamoDbClientConfig, DynamoDbClientFeature } from "./features/DynamoDbClient/index.ts";
import { LoggerFeature } from "./features/Logger/index.ts";
import { CacheFeature } from "./features/Cache/index.ts";
import { GzipCompressionFeature } from "./features/GzipCompression/index.ts";
import { DirectoryToolFeature } from "./features/DirectoryTool/index.ts";
import { FileToolFeature } from "./features/FileTool/index.ts";
import { ModelProviderFeature } from "./features/ModelProvider/index.ts";
import { TenantLocalesFeature } from "./features/TenantLocales/index.ts";
import { S3ClientConfig, S3ClientFeature } from "./features/S3Client/index.ts";
import {
    OpenSearchClientConfig,
    OpenSearchClientFeature
} from "./features/OpenSearchClient/index.ts";
import { PresetLoaderFeature } from "./features/PresetLoader/index.ts";
import { WorkerSpawnerFeature } from "./features/WorkerSpawner/index.ts";
import { TransferLifecycleFeature } from "./features/TransferLifecycle/index.ts";
import { TransformContextFeature } from "./features/TransformContext/index.ts";

export interface BootstrapOptions {
    config: MigrationConfig.Interface;
    logLevel?: "debug" | "info" | "warn" | "error";
    json?: boolean;
}

export function bootstrap(options: BootstrapOptions): Container {
    const { config } = options;
    const container = new Container();

    // Core: config + logger + cache + gzip
    MigrationConfigFeature.register(container, { config });
    LoggerFeature.register(container, {
        logLevel: options.logLevel || "info",
        json: options.json || false
    });
    CacheFeature.register(container);
    GzipCompressionFeature.register(container);
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);

    // DynamoDB clients
    container.registerInstance(DynamoDbClientConfig, {
        source: {
            region: config.source.region,
            credentials: config.source.credentials
        },
        target: {
            region: config.target.region,
            credentials: config.target.credentials
        }
    });
    DynamoDbClientFeature.register(container);

    // S3 clients (ddb mode only)
    if (config.storage === "ddb") {
        container.registerInstance(S3ClientConfig, {
            source: {
                region: config.source.region,
                credentials: config.source.credentials
            },
            target: {
                region: config.target.region,
                credentials: config.target.credentials
            }
        });
        S3ClientFeature.register(container);
    }

    // OpenSearch client (os mode only)
    if (config.storage === "os") {
        container.registerInstance(OpenSearchClientConfig, {
            endpoint: config.target.opensearch.endpoint,
            region: config.target.region,
            service: config.target.opensearch.service,
            credentials: config.target.credentials
        });
        OpenSearchClientFeature.register(container);
    }

    // Transfer lifecycle hooks (composite — collects all registered hooks)
    TransferLifecycleFeature.register(container);

    // Preset loader + worker spawner + model provider + tenant locales
    PresetLoaderFeature.register(container);
    WorkerSpawnerFeature.register(container);
    ModelProviderFeature.register(container);
    TenantLocalesFeature.register(container);

    // Transform context factory (mode-specific)
    TransformContextFeature.register(container);

    return container;
}
