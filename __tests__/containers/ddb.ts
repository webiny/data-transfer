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
import {
    SourceS3Client,
    TargetS3Client
} from "../../src/features/S3Client/abstractions/S3Client.ts";
import { PresetLoaderFeature } from "../../src/features/PresetLoader/index.ts";
import { WorkerSpawnerFeature } from "../../src/features/WorkerSpawner/index.ts";
import { ModelProviderFeature } from "../../src/features/ModelProvider/index.ts";
import { TenantLocalesFeature } from "../../src/features/TenantLocales/index.ts";
import { TransferLifecycleFeature } from "../../src/features/TransferLifecycle/index.ts";
import { TransformContextFeature } from "../../src/features/TransformContext/index.ts";
import { PipelineRunnerFeature } from "../../src/features/PipelineRunner/index.ts";
import { DdbCommandExecutorFeature } from "../../src/features/DdbCommandExecutor/index.ts";
import { MockDynamoDbClient } from "../features/DynamoDbClient/MockDynamoDbClient.ts";
import { MockS3Client } from "../features/S3Client/MockS3Client.ts";

const DEFAULT_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

export interface DdbContainerOptions {
    sourceRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    modelsDir?: string;
    logLevel?: "debug" | "info" | "warn" | "error";
}

export function createDdbContainer(options: DdbContainerOptions = {}): Container {
    const sourceDb = new MockDynamoDbClient(options.sourceRecords || {});
    const targetDb = new MockDynamoDbClient();

    const config: MigrationConfig.Interface = {
        storage: "ddb",
        source: {
            region: "us-east-1",
            credentials: DEFAULT_CREDS,
            dynamodb: { tableName: "source-table" },
            s3: { bucket: "source-bucket" }
        },
        target: {
            region: "eu-central-1",
            credentials: DEFAULT_CREDS,
            dynamodb: { tableName: "target-table" },
            s3: { bucket: "target-bucket" }
        },
        pipeline: {
            preset: "v5-to-v6",
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

    // S3 — mock instances
    container.registerInstance(SourceS3Client, new MockS3Client());
    container.registerInstance(TargetS3Client, new MockS3Client());

    // Pipeline
    PresetLoaderFeature.register(container);
    WorkerSpawnerFeature.register(container);
    ModelProviderFeature.register(container);
    TenantLocalesFeature.register(container);
    TransferLifecycleFeature.register(container);
    TransformContextFeature.register(container);
    PipelineRunnerFeature.register(container);
    DdbCommandExecutorFeature.register(container);

    return container;
}
