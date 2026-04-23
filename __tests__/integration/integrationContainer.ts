import { Container } from "@webiny/di";
import { ContainerToken } from "../../src/base/index.ts";
import { MigrationConfig } from "../../src/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { MigrationConfigFeature } from "../../src/features/MigrationConfig/index.ts";
import { LoggerFeature } from "../../src/tools/Logger/index.ts";
import { CacheFeature } from "../../src/tools/Cache/index.ts";
import { DirectoryToolFeature } from "../../src/tools/DirectoryTool/index.ts";
import { FileToolFeature } from "../../src/tools/FileTool/index.ts";
import {
    DynamoDbClientConfig,
    DynamoDbClientFeature
} from "../../src/services/DynamoDbClient/index.ts";
import {
    SourceS3Client,
    TargetS3Client
} from "../../src/services/S3Client/abstractions/S3Client.ts";
import { S3ClientConfig } from "../../src/services/S3Client/abstractions/S3ClientConfig.ts";
import { S3ClientFeature } from "../../src/services/S3Client/index.ts";
import { PresetLoaderFeature } from "../../src/features/PresetLoader/index.ts";
import { WorkerSpawnerFeature } from "../../src/features/WorkerSpawner/index.ts";
import { ModelProviderFeature } from "../../src/features/ModelProvider/index.ts";
import { TenantLocalesFeature } from "../../src/features/TenantLocales/index.ts";
import { TransferLifecycleFeature } from "../../src/features/TransferLifecycle/index.ts";
import { PresetLifecycleFeature } from "../../src/features/PresetLifecycle/index.ts";
import { TransferContext } from "../../src/features/TransferLifecycle/abstractions/TransferContext.ts";
import { TransformContextFeature } from "../../src/features/TransformContext/index.ts";
import { PipelineBuilderFactoryFeature } from "../../src/features/PipelineBuilderFactory/index.ts";
import { PipelineRunnerFeature } from "../../src/features/PipelineRunner/index.ts";
import { SnapshotWriterFeature } from "../../src/features/SnapshotWriter/index.ts";
import { DdbScannerFeature } from "../../src/features/DdbScanner/index.ts";
import { DdbProcessorFeature } from "../../src/features/DdbProcessor/index.ts";
import { DdbExecutorFeature } from "../../src/features/DdbExecutor/index.ts";
import { S3ProcessorFeature } from "../../src/features/S3Processor/index.ts";
import { DroppedRecordLogFeature } from "../../src/features/DroppedRecordLog/index.ts";
import { MockS3Client } from "../services/S3Client/MockS3Client.ts";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

interface SnapshotOverride {
    dir?: string;
    compress?: boolean;
}

export interface DdbIntegrationContainerOptions {
    endpoint: string;
    sourceTable: string;
    targetTable: string;
    segments?: number;
    runId?: string;
    modelsDir?: string;
    /**
     * Wires the real S3ClientFeature (with dummy region + creds). Pair with
     * `mockClient(S3Client)` from `aws-sdk-client-mock` in the test to
     * intercept all S3 calls at the SDK boundary — we exercise the real
     * S3ClientImpl (retry, command construction) without ever hitting AWS.
     *
     * Default: MockS3Client (simpler for tests that don't touch S3).
     */
    useRealS3Client?: boolean;
    /** Enable snapshot dumps for tests that want to assert per-record output. */
    snapshot?: boolean | SnapshotOverride;
}

/**
 * Wires a DI container for DDB integration tests running against a real
 * AWS SDK client pointed at dynalite. S3 stays mocked — dynalite is
 * DDB-only, and most DDB-path tests don't care about S3.
 */
export function createDdbIntegrationContainer(options: DdbIntegrationContainerOptions): Container {
    const config: MigrationConfig.Interface = {
        storage: "ddb",
        source: {
            region: "us-east-1",
            credentials: FAKE_CREDS,
            dynamodb: { tableName: options.sourceTable },
            s3: { bucket: "source-bucket" }
        },
        target: {
            // Different region from source so `getDocumentClient`'s config-hash
            // cache returns a distinct DocumentClient for the target. Integration
            // tests that install middleware on the target shouldn't leak into
            // scans against the source.
            region: "eu-central-1",
            credentials: FAKE_CREDS,
            dynamodb: { tableName: options.targetTable },
            s3: { bucket: "target-bucket" }
        },
        pipeline: {
            preset: "integration",
            segments: options.segments ?? 1,
            modelsDir: options.modelsDir
        },
        debug: options.snapshot !== undefined ? { snapshot: options.snapshot } : undefined
    };

    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(TransferContext, { runId: options.runId ?? "integration-run" });

    MigrationConfigFeature.register(container, { config });
    LoggerFeature.register(container, { logLevel: "error", json: false });
    CacheFeature.register(container);
    CompressionFeature.register(container);
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);

    container.registerInstance(DynamoDbClientConfig, {
        source: {
            region: config.source.region,
            credentials: FAKE_CREDS,
            endpoint: options.endpoint
        },
        target: {
            region: config.target.region,
            credentials: FAKE_CREDS,
            endpoint: options.endpoint
        }
    });
    DynamoDbClientFeature.register(container);

    if (options.useRealS3Client) {
        container.registerInstance(S3ClientConfig, {
            source: { region: "us-east-1", credentials: FAKE_CREDS },
            target: { region: "us-east-1", credentials: FAKE_CREDS }
        });
        S3ClientFeature.register(container);
    } else {
        container.registerInstance(SourceS3Client, new MockS3Client());
        container.registerInstance(TargetS3Client, new MockS3Client());
    }

    PresetLoaderFeature.register(container);
    WorkerSpawnerFeature.register(container);
    ModelProviderFeature.register(container);
    TenantLocalesFeature.register(container);
    TransferLifecycleFeature.register(container);
    PresetLifecycleFeature.register(container);
    TransformContextFeature.register(container);
    PipelineBuilderFactoryFeature.register(container);
    SnapshotWriterFeature.register(container);
    DroppedRecordLogFeature.register(container);
    PipelineRunnerFeature.register(container);
    DdbExecutorFeature.register(container);
    S3ProcessorFeature.register(container);
    DdbScannerFeature.register(container);
    DdbProcessorFeature.register(container);

    return container;
}
