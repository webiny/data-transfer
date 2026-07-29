import { isAbsolute, join as joinPath } from "node:path";
import { Container } from "@webiny/di";
import { ContainerToken } from "./base/index.js";
import { MigrationConfigFeature } from "./features/MigrationConfig/index.js";
import { LoggerFeature } from "./tools/Logger/index.js";
import { CacheFeature } from "./tools/Cache/index.js";
import { DirectoryToolFeature } from "./tools/DirectoryTool/index.js";
import { FileToolFeature } from "./tools/FileTool/index.js";
import { DynamoDbClientConfig, DynamoDbClientFeature } from "./services/DynamoDbClient/index.js";
import { S3ClientConfig, S3ClientFeature } from "./services/S3Client/index.js";
import {
  OpenSearchClientConfig,
  OpenSearchClientFeature
} from "./services/OpenSearchClient/index.js";
import { ModelProviderFeature } from "./features/ModelProvider/index.js";
import { TenantLocalesFeature } from "./features/TenantLocales/index.js";
import { PresetLoaderFeature } from "./features/PresetLoader/index.js";
import { WorkerSpawnerFeature } from "./features/WorkerSpawner/index.js";
import { TransferLifecycleFeature } from "./features/TransferLifecycle/index.js";
import { PresetLifecycleFeature } from "./features/PresetLifecycle/index.js";
import { TransformContextFeature } from "./features/TransformContext/index.js";
import { PipelineBuilderFactoryFeature } from "./features/PipelineBuilderFactory/index.js";
import { PipelineRunnerFeature } from "./features/PipelineRunner/index.js";
import { SnapshotWriterFeature } from "./features/SnapshotWriter/index.js";
import { DdbScannerFeature } from "./features/DdbScanner/index.js";
import { DdbProcessorFeature } from "./features/DdbProcessor/index.js";
import { DdbExecutorFeature } from "./features/DdbExecutor/index.js";
import { S3ProcessorFeature } from "./features/S3Processor/index.js";
import { AuditLogProcessorFeature } from "./features/AuditLogProcessor/index.js";
import { OsRecordDecompressorFeature } from "./features/OsRecordDecompressor/index.js";
import { OsScannerFeature } from "./features/OsScanner/index.js";
import { OsProcessorFeature } from "./features/OsProcessor/index.js";
import { IndexConfigurationProviderFeature } from "./features/IndexConfigurationProvider/index.js";
import { TouchedIndexesFeature } from "./features/TouchedIndexes/index.js";
import { AccessCheckerFeature } from "./features/AccessChecker/index.js";
import { DroppedRecordLogFeature } from "./features/DroppedRecordLog/index.js";
import { TransferredRecordLogFeature } from "./features/TransferredRecordLog/index.js";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";
export function bootstrap(options) {
  const { config } = options;
  const container = new Container();
  container.registerInstance(ContainerToken, container);
  // Config
  MigrationConfigFeature.register(container, { config });
  // Tools
  LoggerFeature.register(container, {
    logLevel: options.logLevel || config.debug?.logLevel || "debug",
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
  if (config.target.opensearch != null) {
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
  DroppedRecordLogFeature.register(container);
  TransferredRecordLogFeature.register(container);
  PipelineRunnerFeature.register(container);
  DdbExecutorFeature.register(container);
  S3ProcessorFeature.register(container);
  DdbScannerFeature.register(container);
  DdbProcessorFeature.register(container);
  AuditLogProcessorFeature.register(container);
  IndexConfigurationProviderFeature.register(container);
  TouchedIndexesFeature.register(container);
  OsRecordDecompressorFeature.register(container);
  OsScannerFeature.register(container);
  OsProcessorFeature.register(container);
  AccessCheckerFeature.register(container);
  return container;
}
/**
 * Turn `config.debug.logFile` into an absolute path for the pino file
 * stream. Writes to `.transfer/<runId>/logs/<orchestrator|segment-N>.log`
 * by default — set `logFile: false` to opt out. A string value overrides
 * the path entirely. Workers are detected via `--segment <N>` in argv so
 * each one writes to its own file (concurrent appends to a shared file
 * can interleave).
 */
function resolveLogFile(config, runId) {
  const raw = config.debug?.logFile;
  if (raw === false) {
    return undefined;
  }
  if (typeof raw === "string") {
    return isAbsolute(raw) ? raw : joinPath(process.cwd(), raw);
  }
  if (!runId) {
    return undefined;
  }
  const kind = detectProcessKind();
  return joinPath(process.cwd(), ".transfer", runId, "logs", `${kind}.log`);
}
function detectProcessKind() {
  const argv = process.argv;
  const idx = argv.indexOf("--segment");
  if (idx >= 0 && argv[idx + 1] !== undefined) {
    return `segment-${argv[idx + 1]}`;
  }
  return "orchestrator";
}
//# sourceMappingURL=bootstrap.js.map
