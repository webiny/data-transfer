import { AccessCheck, Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { SourceS3Client, TargetS3Client } from "../../services/S3Client/abstractions/S3Client.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import type { Commands } from "../../domain/transform/commands/Commands.js";
import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
export type { IProcessor } from "../../domain/pipeline/abstractions/Processor.js";
interface S3ProcessorSlice {
  copyFile(sourceKey: string, targetKey: string): void;
  getFile(key: string): Promise<Buffer | null>;
}
declare class S3ProcessorImpl implements Processor.Interface<
  BaseTransformContext.Interface<unknown>,
  S3ProcessorSlice
> {
  private readonly sourceS3;
  private readonly targetS3;
  private readonly config;
  private readonly transferContext;
  constructor(
    sourceS3: SourceS3Client.Interface,
    targetS3: TargetS3Client.Interface,
    config: MigrationConfig.Interface,
    transferContext: TransferContext.Interface
  );
  extendContext(base: BaseTransformContext.Interface<unknown>): S3ProcessorSlice;
  checkAccess(): Promise<AccessCheck.Entry[]>;
  private headBucket;
  private headBucketWithLabel;
  execute(commands: Commands): Promise<void>;
}
export declare const S3Processor: typeof S3ProcessorImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("../../domain/pipeline/abstractions/Processor.js").IProcessor<any, any>
  >;
};
//# sourceMappingURL=S3Processor.d.ts.map
