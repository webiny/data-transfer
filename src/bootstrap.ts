import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { MigrationConfig, MigrationConfigFeature } from "~/features/MigrationConfig/index.ts";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { CacheFeature } from "~/tools/Cache/index.ts";
import { GzipCompressionFeature } from "~/tools/GzipCompression/index.ts";
import { DirectoryToolFeature } from "~/tools/DirectoryTool/index.ts";
import { FileToolFeature } from "~/tools/FileTool/index.ts";
import { DynamoDbClientConfig, DynamoDbClientFeature } from "~/services/DynamoDbClient/index.ts";
import { S3ClientConfig, S3ClientFeature } from "~/services/S3Client/index.ts";
import {
    OpenSearchClientConfig,
    OpenSearchClientFeature
} from "~/services/OpenSearchClient/index.ts";
import { ModelProviderFeature } from "~/features/ModelProvider/index.ts";
import { TenantLocalesFeature } from "~/features/TenantLocales/index.ts";
import { PresetLoaderFeature } from "~/features/PresetLoader/index.ts";
import { WorkerSpawnerFeature } from "~/features/WorkerSpawner/index.ts";
import { TransferLifecycleFeature } from "~/features/TransferLifecycle/index.ts";
import { TransformContextFeature } from "~/features/TransformContext/index.ts";
import { PipelineRunnerFeature } from "~/features/PipelineRunner/index.ts";
import { DdbScannerFeature } from "~/features/DdbScanner/index.ts";
import { DdbProcessorFeature } from "~/features/DdbProcessor/index.ts";
import { DdbExecutorFeature } from "~/features/DdbExecutor/index.ts";
import { S3ProcessorFeature } from "~/features/S3Processor/index.ts";
import { OsRecordDecompressorFeature } from "~/features/OsRecordDecompressor/index.ts";
import { OsScannerFeature } from "~/features/OsScanner/index.ts";
import { OsProcessorFeature } from "~/features/OsProcessor/index.ts";
import { TouchedIndexesFeature } from "~/features/TouchedIndexes/index.ts";
import { PutOsDynamoDbRecordExecutorFeature } from "~/features/PutOsDynamoDbRecordExecutor/index.ts";

export interface BootstrapOptions {
    config: MigrationConfig.Interface;
    logLevel?: "debug" | "info" | "warn" | "error";
    json?: boolean;
}

export function bootstrap(options: BootstrapOptions): Container {
    const { config } = options;
    const container = new Container();
    container.registerInstance(ContainerToken, container);

    // Config
    MigrationConfigFeature.register(container, { config });

    // Tools
    LoggerFeature.register(container, {
        logLevel: options.logLevel || "info",
        json: options.json || false
    });
    CacheFeature.register(container);
    GzipCompressionFeature.register(container);
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);

    // Services
    container.registerInstance(DynamoDbClientConfig, {
        source: {
            region: config.source.region,
            credentials: config.source.credentials
        },
        target: {
            region: config.target.region,
            credentials: config.target.credentials
        },
        tuning: config.tuning?.ddb
    });
    DynamoDbClientFeature.register(container);

    if (config.storage === "ddb") {
        container.registerInstance(S3ClientConfig, {
            source: {
                region: config.source.region,
                credentials: config.source.credentials
            },
            target: {
                region: config.target.region,
                credentials: config.target.credentials
            },
            tuning: config.tuning?.s3
        });
        S3ClientFeature.register(container);
    }

    if (config.storage === "os") {
        container.registerInstance(OpenSearchClientConfig, {
            endpoint: config.target.opensearch.endpoint,
            region: config.target.region,
            service: config.target.opensearch.service,
            credentials: config.target.credentials,
            maxRetries: config.tuning?.os?.maxRetries
        });
        OpenSearchClientFeature.register(container);
    }

    // Features
    TransferLifecycleFeature.register(container);
    PresetLoaderFeature.register(container);
    WorkerSpawnerFeature.register(container);
    ModelProviderFeature.register(container);
    TenantLocalesFeature.register(container);
    TransformContextFeature.register(container);
    PipelineRunnerFeature.register(container);

    if (config.storage === "ddb") {
        DdbExecutorFeature.register(container);
        S3ProcessorFeature.register(container);
        DdbScannerFeature.register(container);
        DdbProcessorFeature.register(container);
    } else {
        TouchedIndexesFeature.register(container);
        DdbExecutorFeature.register(container);
        PutOsDynamoDbRecordExecutorFeature.register(container);
        OsRecordDecompressorFeature.register(container);
        OsScannerFeature.register(container);
        OsProcessorFeature.register(container);
    }

    return container;
}
