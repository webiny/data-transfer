import { isAbsolute, join as joinPath } from "node:path";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { MigrationConfig, MigrationConfigFeature } from "~/features/MigrationConfig/index.ts";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { CacheFeature } from "~/tools/Cache/index.ts";
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
import { PresetLifecycleFeature } from "~/features/PresetLifecycle/index.ts";
import { TransformContextFeature } from "~/features/TransformContext/index.ts";
import { PipelineBuilderFactoryFeature } from "~/features/PipelineBuilderFactory/index.ts";
import { PipelineRunnerFeature } from "~/features/PipelineRunner/index.ts";
import { SnapshotWriterFeature } from "~/features/SnapshotWriter/index.ts";
import { DdbScannerFeature } from "~/features/DdbScanner/index.ts";
import { DdbProcessorFeature } from "~/features/DdbProcessor/index.ts";
import { DdbExecutorFeature } from "~/features/DdbExecutor/index.ts";
import { S3ProcessorFeature } from "~/features/S3Processor/index.ts";
import { OsRecordDecompressorFeature } from "~/features/OsRecordDecompressor/index.ts";
import { OsScannerFeature } from "~/features/OsScanner/index.ts";
import { OsProcessorFeature } from "~/features/OsProcessor/index.ts";
import { TouchedIndexesFeature } from "~/features/TouchedIndexes/index.ts";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";

export interface BootstrapOptions {
    config: MigrationConfig.Interface;
    logLevel?: "debug" | "info" | "warn" | "error";
    json?: boolean;
    /**
     * Run ID — used to resolve the default log file path under
     * `.transfer/<runId>/logs/...`. Required when
     * `config.debug.logFile === true` (default-path mode); optional
     * otherwise. Handlers pass this from argv.runId (workers) or a
     * freshly generated value (orchestrator).
     */
    runId?: string;
}

export function bootstrap(options: BootstrapOptions): Container {
    const { config } = options;
    const container = new Container();
    container.registerInstance(ContainerToken, container);

    // Config
    MigrationConfigFeature.register(container, { config });

    // Tools
    LoggerFeature.register(container, {
        logLevel: options.logLevel || config.debug?.logLevel || "info",
        json: options.json || false,
        logFile: resolveLogFile(config, options.runId)
    });
    CacheFeature.register(container);
    CompressionFeature.register(container);
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
    PresetLifecycleFeature.register(container);
    PresetLoaderFeature.register(container);
    WorkerSpawnerFeature.register(container);
    ModelProviderFeature.register(container);
    TenantLocalesFeature.register(container);
    TransformContextFeature.register(container);
    PipelineBuilderFactoryFeature.register(container);
    SnapshotWriterFeature.register(container);
    PipelineRunnerFeature.register(container);

    if (config.storage === "ddb") {
        DdbExecutorFeature.register(container);
        S3ProcessorFeature.register(container);
        DdbScannerFeature.register(container);
        DdbProcessorFeature.register(container);
    } else {
        TouchedIndexesFeature.register(container);
        DdbExecutorFeature.register(container);
        OsRecordDecompressorFeature.register(container);
        OsScannerFeature.register(container);
        OsProcessorFeature.register(container);
    }

    return container;
}

/**
 * Turn `config.debug.logFile` into an absolute path for the pino file
 * stream. `true` → `.transfer/<runId>/logs/<orchestrator|segment-N>.log`.
 * Workers are detected via `--segment <N>` in argv so each one writes
 * to its own file (concurrent appends to a shared file can interleave).
 */
function resolveLogFile(
    config: MigrationConfig.Interface,
    runId: string | undefined
): string | undefined {
    const raw = config.debug?.logFile;
    if (!raw) {
        return undefined;
    }
    if (typeof raw === "string") {
        return isAbsolute(raw) ? raw : joinPath(process.cwd(), raw);
    }
    if (!runId) {
        // Default path needs a runId to anchor the directory; without
        // it there's nowhere sensible to write. Silent no-op keeps the
        // feature opt-in-forgiving.
        return undefined;
    }
    const kind = detectProcessKind();
    return joinPath(process.cwd(), ".transfer", runId, "logs", `${kind}.log`);
}

function detectProcessKind(): string {
    const argv = process.argv;
    const idx = argv.indexOf("--segment");
    if (idx >= 0 && argv[idx + 1] !== undefined) {
        return `segment-${argv[idx + 1]}`;
    }
    return "orchestrator";
}
