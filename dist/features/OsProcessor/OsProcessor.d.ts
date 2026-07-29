import { Container } from "@webiny/di";
import { IndexConfigurationResolver } from "../../features/IndexConfigurationProvider/abstractions/IndexConfigurationResolver.js";
import { AccessCheck, Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { DdbExecutor } from "../../features/DdbExecutor/abstractions/DdbExecutor.js";
import {
  SourceDynamoDbClient,
  TargetDynamoDbClient
} from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { TouchedIndexes } from "../../features/TouchedIndexes/abstractions/TouchedIndexes.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
import type { Commands } from "../../domain/transform/commands/Commands.js";
import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
export type { IProcessor } from "../../domain/pipeline/abstractions/Processor.js";
interface OsProcessorSlice {
  putRecord(record: Record<string, unknown>): void;
  querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
    pk: string,
    sk?: string
  ): Promise<T | null>;
  queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
    pk: string,
    sk?: string
  ): Promise<T | null>;
}
declare class OsProcessorImpl implements Processor.Interface<
  BaseTransformContext.Interface<unknown>,
  OsProcessorSlice
> {
  private readonly logger;
  private readonly ddbExecutor;
  private readonly container;
  private readonly compression;
  private readonly touchedIndexes;
  private readonly config;
  private readonly transferContext;
  private readonly dirTool;
  private readonly fileTool;
  private readonly sourceDb;
  private readonly targetDb;
  private readonly indexConfigurationResolver;
  private _osClient;
  constructor(
    logger: Logger.Interface,
    ddbExecutor: DdbExecutor.Interface,
    container: Container,
    compression: CompressionHandler.Interface,
    touchedIndexes: TouchedIndexes.Interface,
    config: MigrationConfig.Interface,
    transferContext: TransferContext.Interface,
    dirTool: DirectoryTool.Interface,
    fileTool: FileTool.Interface,
    sourceDb: SourceDynamoDbClient.Interface,
    targetDb: TargetDynamoDbClient.Interface,
    indexConfigurationResolver: IndexConfigurationResolver.Interface
  );
  private get osClient();
  extendContext(base: BaseTransformContext.Interface<unknown>): OsProcessorSlice;
  onEnd(ctx: BaseTransformContext.Interface<unknown> & OsProcessorSlice): void;
  execute(commands: Commands): Promise<void>;
  checkAccess(): Promise<AccessCheck.Entry[]>;
  afterShard(ctx: Processor.AfterShardContext): void;
  private buildGzippedPuts;
  private ensureIndex;
  private disableRefreshOnExisting;
  private createNewIndex;
  private withRetry;
  private isAlreadyExistsError;
  private get retrySchedule();
  private get gzipConcurrency();
}
export declare const OsProcessor: typeof OsProcessorImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("../../domain/pipeline/abstractions/Processor.js").IProcessor<any, any>
  >;
};
//# sourceMappingURL=OsProcessor.d.ts.map
