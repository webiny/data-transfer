import { Container } from "@webiny/di";
import { ContainerToken } from "../../src/base/index.ts";
import { DroppedRecordLog } from "../../src/features/DroppedRecordLog/abstractions/DroppedRecordLog.ts";
import { MockDroppedRecordLog } from "../features/DroppedRecordLog/MockDroppedRecordLog.ts";
import { TransferredRecordLog } from "../../src/features/TransferredRecordLog/abstractions/TransferredRecordLog.ts";
import { MockTransferredRecordLog } from "../features/TransferredRecordLog/MockTransferredRecordLog.ts";
import { MigrationConfig } from "../../src/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { MigrationConfigFeature } from "../../src/features/MigrationConfig/index.ts";
import { LoggerFeature } from "../../src/tools/Logger/index.ts";
import { CacheFeature } from "../../src/tools/Cache/index.ts";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";
import { DirectoryToolFeature } from "../../src/tools/DirectoryTool/index.ts";
import { FileToolFeature } from "../../src/tools/FileTool/index.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "../../src/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { OpenSearchClient } from "../../src/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
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
import { DdbExecutorFeature } from "../../src/features/DdbExecutor/index.ts";
import { TouchedIndexesFeature } from "../../src/features/TouchedIndexes/index.ts";
import { OsRecordDecompressorFeature } from "../../src/features/OsRecordDecompressor/index.ts";
import { OsScannerFeature } from "../../src/features/OsScanner/index.ts";
import { OsProcessorFeature } from "../../src/features/OsProcessor/index.ts";
import { IndexConfigurationProviderFeature } from "../../src/features/IndexConfigurationProvider/index.ts";
import { AccessCheckerFeature } from "../../src/features/AccessChecker/index.ts";
import { MockDynamoDbClient } from "../services/DynamoDbClient/MockDynamoDbClient.ts";
import { MockOpenSearchClient } from "../services/OpenSearchClient/MockOpenSearchClient.ts";

const DEFAULT_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

export interface OsContainerPipelineOverride {
    segments?: number;
}

export interface OsContainerOptions {
    sourceRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    modelsDir?: string;
    presetsDir?: string;
    logLevel?: "debug" | "info" | "warn" | "error";
    pipelineOverride?: OsContainerPipelineOverride;
    indexPrefix?: string;
    noOpenSearch?: boolean;
}

export function createOsContainer(options: OsContainerOptions = {}): Container {
    const sourceDb = new MockDynamoDbClient(options.sourceRecords || {});
    const targetDb = new MockDynamoDbClient();
    const osClient = new MockOpenSearchClient();

    const config: MigrationConfig.Interface = {
        source: {
            region: "us-east-1",
            credentials: DEFAULT_CREDS,
            dynamodb: { tableName: "source-primary" },
            s3: { bucket: "source-bucket" },
            opensearch: { tableName: "source-os" }
        },
        target: {
            region: "eu-central-1",
            credentials: DEFAULT_CREDS,
            dynamodb: { tableName: "target-table" },
            s3: { bucket: "target-bucket" },
            opensearch: options.noOpenSearch
                ? undefined
                : {
                      endpoint: "https://es.example.com",
                      tableName: "target-os",
                      service: "opensearch" as const,
                      indexPrefix: options.indexPrefix ?? ""
                  }
        },
        pipeline: {
            modelsDir: options.modelsDir,
            presetsDir: options.presetsDir,
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
    CompressionFeature.register(container);
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
    PipelineBuilderFactoryFeature.register(container);
    SnapshotWriterFeature.register(container);
    container.registerInstance(DroppedRecordLog, new MockDroppedRecordLog());
    container.registerInstance(TransferredRecordLog, new MockTransferredRecordLog());
    PipelineRunnerFeature.register(container);
    IndexConfigurationProviderFeature.register(container);
    TouchedIndexesFeature.register(container);
    DdbExecutorFeature.register(container);
    OsRecordDecompressorFeature.register(container);
    OsScannerFeature.register(container);
    OsProcessorFeature.register(container);
    AccessCheckerFeature.register(container);

    return container;
}
