import { Container } from "@webiny/di";
import { MigrationConfig } from "../../src/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { MigrationConfigFeature } from "../../src/features/MigrationConfig/index.ts";
import { LoggerFeature } from "../../src/features/Logger/index.ts";
import { CacheFeature } from "../../src/features/Cache/index.ts";
import { GzipCompressionFeature } from "../../src/features/GzipCompression/index.ts";
import { DirectoryToolFeature } from "../../src/features/DirectoryTool/index.ts";
import { FileToolFeature } from "../../src/features/FileTool/index.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "../../src/features/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OpenSearchClient } from "../../src/features/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { PresetLoaderFeature } from "../../src/features/PresetLoader/index.ts";
import { WorkerSpawnerFeature } from "../../src/features/WorkerSpawner/index.ts";
import { ModelProviderFeature } from "../../src/features/ModelProvider/index.ts";
import { TenantLocalesFeature } from "../../src/features/TenantLocales/index.ts";
import { TransferLifecycleFeature } from "../../src/features/TransferLifecycle/index.ts";
import { TransformContextFeature } from "../../src/features/TransformContext/index.ts";
import { PipelineRunnerFeature } from "../../src/features/PipelineRunner/index.ts";
import { OsCommandExecutorFeature } from "../../src/features/OsCommandExecutor/index.ts";
import { MockDynamoDbClient } from "../features/DynamoDbClient/MockDynamoDbClient.ts";
import { MockOpenSearchClient } from "../features/OpenSearchClient/MockOpenSearchClient.ts";

const DEFAULT_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

export interface OsContainerOptions {
    sourceRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    modelsDir?: string;
    logLevel?: "debug" | "info" | "warn" | "error";
}

export function createOsContainer(options: OsContainerOptions = {}): Container {
    const sourceDb = new MockDynamoDbClient(options.sourceRecords || {});
    const targetDb = new MockDynamoDbClient();
    const osClient = new MockOpenSearchClient();

    const config: MigrationConfig.Interface = {
        storage: "os",
        source: {
            region: "us-east-1",
            credentials: DEFAULT_CREDS,
            dynamodb: { tableName: "source-primary" },
            opensearch: { tableName: "source-os" }
        },
        target: {
            region: "eu-central-1",
            credentials: DEFAULT_CREDS,
            opensearch: {
                endpoint: "https://es.example.com",
                tableName: "target-os",
                service: "opensearch" as const
            }
        },
        pipeline: {
            preset: "v5-to-v6-os",
            modelsDir: options.modelsDir
        }
    };

    const container = new Container();

    // Core
    MigrationConfigFeature.register(container, { config });
    LoggerFeature.register(container, { logLevel: options.logLevel || "error", json: false });
    CacheFeature.register(container);
    GzipCompressionFeature.register(container);
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);

    // DynamoDB — mock instances
    container.registerInstance(SourceDynamoDbClient, sourceDb);
    container.registerInstance(TargetDynamoDbClient, targetDb);

    // OpenSearch — mock instance
    container.registerInstance(OpenSearchClient, osClient);

    // Pipeline
    PresetLoaderFeature.register(container);
    WorkerSpawnerFeature.register(container);
    ModelProviderFeature.register(container);
    TenantLocalesFeature.register(container);
    TransferLifecycleFeature.register(container);
    TransformContextFeature.register(container);
    PipelineRunnerFeature.register(container);
    OsCommandExecutorFeature.register(container);

    return container;
}
