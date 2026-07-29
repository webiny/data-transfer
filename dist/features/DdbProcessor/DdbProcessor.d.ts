import { AccessCheck, Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { DdbExecutor } from "../../features/DdbExecutor/abstractions/DdbExecutor.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import {
  SourceDynamoDbClient,
  TargetDynamoDbClient
} from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import type { Commands } from "../../domain/transform/commands/Commands.js";
import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
export type { IProcessor } from "../../domain/pipeline/abstractions/Processor.js";
interface DdbProcessorSlice {
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
declare class DdbProcessorImpl implements Processor.Interface<
  BaseTransformContext.Interface<unknown>,
  DdbProcessorSlice
> {
  private readonly executor;
  private readonly config;
  private readonly sourceDb;
  private readonly targetDb;
  private readonly transferContext;
  constructor(
    executor: DdbExecutor.Interface,
    config: MigrationConfig.Interface,
    sourceDb: SourceDynamoDbClient.Interface,
    targetDb: TargetDynamoDbClient.Interface,
    transferContext: TransferContext.Interface
  );
  extendContext(base: BaseTransformContext.Interface<unknown>): DdbProcessorSlice;
  onEnd(ctx: BaseTransformContext.Interface<unknown> & DdbProcessorSlice): void;
  checkAccess(): Promise<AccessCheck.Entry[]>;
  private describeTable;
  execute(commands: Commands): Promise<void>;
}
export declare const DdbProcessor: typeof DdbProcessorImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("../../domain/pipeline/abstractions/Processor.js").IProcessor<any, any>
  >;
};
//# sourceMappingURL=DdbProcessor.d.ts.map
