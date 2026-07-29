import { type Abstraction, type Container } from "@webiny/di";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import type { Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { Pipeline } from "../../domain/pipeline/Pipeline.js";
import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import { BaseTransformContextFactory } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { SnapshotWriter } from "../../features/SnapshotWriter/abstractions/SnapshotWriter.js";
import { DroppedRecordLog } from "../../features/DroppedRecordLog/index.js";
import { TransferredRecordLog } from "../../features/TransferredRecordLog/index.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import {
  PipelineRunner as PipelineRunnerAbstraction,
  type RunOptions,
  type RunStats
} from "./abstractions/PipelineRunner.ts";
export type { IPipelineRunner } from "./abstractions/PipelineRunner.js";
type ProcessorInstance = Processor.Interface<BaseTransformContext.Interface<unknown>, any>;
type AnyPipeline = Pipeline<any, any, any>;
declare class PipelineRunnerImpl implements PipelineRunnerAbstraction.Interface {
  private readonly container;
  private readonly config;
  private readonly logger;
  private readonly transferContext;
  private readonly baseContextFactory;
  private readonly snapshotWriter;
  private readonly droppedLog;
  private readonly transferredLog;
  private mergeGroups;
  private readonly registeredNames;
  private readonly unclaimedWarned;
  private lastShardStats;
  constructor(
    container: Container,
    config: MigrationConfig.Interface,
    logger: Logger.Interface,
    transferContext: TransferContext.Interface,
    baseContextFactory: BaseTransformContextFactory.Interface,
    snapshotWriter: SnapshotWriter.Interface,
    droppedLog: DroppedRecordLog.Interface,
    transferredLog: TransferredRecordLog.Interface
  );
  register(...pipelines: AnyPipeline[]): this;
  getShardStats(): RunStats | null;
  getProcessors(): ProcessorInstance[];
  run(opts?: RunOptions): Promise<void>;
  private runInternal;
  private runSingleShard;
  private runMergeGroup;
  private resolvePipelineProcessors;
  private dedupHookTokens;
  private runShard;
  private flushShard;
  private runRecord;
  private collectProcessorOrder;
  private logShardSummary;
  private logRunSummary;
  /**
   * Emit a one-time warning per unclaimed command key observed across the
   * runner's lifetime. `unclaimedWarned` grows monotonically but is bounded
   * by the number of distinct command keys ever emitted (tiny in practice —
   * PutRecord, S3Copy, and whatever future processors introduce).
   */
  private warnUnclaimedKeys;
  private deriveMergeGroupId;
}
export declare const PipelineRunner: typeof PipelineRunnerImpl & {
  __abstraction: Abstraction<import("./abstractions/PipelineRunner.ts").IPipelineRunner>;
};
//# sourceMappingURL=PipelineRunner.d.ts.map
