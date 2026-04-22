import { Container } from "@webiny/di";
import { ContainerToken } from "../../src/base/index.ts";
import { MigrationConfig } from "../../src/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { MigrationConfigFeature } from "../../src/features/MigrationConfig/index.ts";
import { LoggerFeature } from "../../src/tools/Logger/index.ts";
import { CacheFeature } from "../../src/tools/Cache/index.ts";
import { GzipCompressionFeature } from "../../src/tools/GzipCompression/index.ts";
import { DirectoryToolFeature } from "../../src/tools/DirectoryTool/index.ts";
import { FileToolFeature } from "../../src/tools/FileTool/index.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "../../src/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import {
    SourceS3Client,
    TargetS3Client
} from "../../src/services/S3Client/abstractions/S3Client.ts";
import { PresetLoaderFeature } from "../../src/features/PresetLoader/index.ts";
import { WorkerSpawnerFeature } from "../../src/features/WorkerSpawner/index.ts";
import { ModelProviderFeature } from "../../src/features/ModelProvider/index.ts";
import { TenantLocalesFeature } from "../../src/features/TenantLocales/index.ts";
import { TransferLifecycleFeature } from "../../src/features/TransferLifecycle/index.ts";
import { TransferContext } from "../../src/features/TransferLifecycle/abstractions/TransferContext.ts";
import { TransformContextFeature } from "../../src/features/TransformContext/index.ts";
import { PipelineBuilderFactoryFeature } from "../../src/features/PipelineBuilderFactory/index.ts";
import { PipelineRunnerFeature } from "../../src/features/PipelineRunner/index.ts";
import { SnapshotWriterFeature } from "../../src/features/SnapshotWriter/index.ts";
import { DdbScannerFeature } from "../../src/features/DdbScanner/index.ts";
import { DdbProcessorFeature } from "../../src/features/DdbProcessor/index.ts";
import { DdbExecutorFeature } from "../../src/features/DdbExecutor/index.ts";
import { S3ProcessorFeature } from "../../src/features/S3Processor/index.ts";
import { MockDynamoDbClient } from "../services/DynamoDbClient/MockDynamoDbClient.ts";
import { MockS3Client } from "../services/S3Client/MockS3Client.ts";

const DEFAULT_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

export interface DdbContainerPipelineOverride {
    segments?: number;
}

export interface DdbContainerOptions {
    sourceRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    /**
     * Pre-seed the target mock DDB. Keyed by table name, same shape as
     * `sourceRecords`. Use in tests that exercise `ctx.queryTargetRecord`
     * or anything else that reads back from the target side.
     */
    targetRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    modelsDir?: string;
    logLevel?: "debug" | "info" | "warn" | "error";
    pipelineOverride?: DdbContainerPipelineOverride;
}

export function createDdbContainer(options: DdbContainerOptions = {}): Container {
    const sourceDb = new MockDynamoDbClient(options.sourceRecords || {});
    const targetDb = new MockDynamoDbClient(options.targetRecords || {});

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
            modelsDir: options.modelsDir,
            ...(options.pipelineOverride?.segments !== undefined
                ? { segments: options.pipelineOverride.segments }
                : {})
        }
    };

    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(TransferContext, { runId: "test-run-id" });

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
    PipelineBuilderFactoryFeature.register(container);
    SnapshotWriterFeature.register(container);
    PipelineRunnerFeature.register(container);
    DdbExecutorFeature.register(container);
    S3ProcessorFeature.register(container);
    DdbScannerFeature.register(container);
    DdbProcessorFeature.register(container);

    return container;
}
