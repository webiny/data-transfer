import { AccessCheck, Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { DdbExecutor } from "../../features/DdbExecutor/abstractions/DdbExecutor.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import type { Commands } from "../../domain/transform/commands/Commands.js";
import type { BaseTransformContext } from "../../features/TransformContext/abstractions/BaseTransformContext.js";
export type { IProcessor } from "../../domain/pipeline/abstractions/Processor.js";
interface AuditLogProcessorSlice {
  putAuditLog(record: Record<string, unknown>): void;
}
declare class AuditLogProcessorImpl implements Processor.Interface<
  BaseTransformContext.Interface<unknown>,
  AuditLogProcessorSlice
> {
  private readonly executor;
  private readonly config;
  constructor(executor: DdbExecutor.Interface, config: MigrationConfig.Interface);
  extendContext(base: BaseTransformContext.Interface<unknown>): AuditLogProcessorSlice;
  onEnd(ctx: BaseTransformContext.Interface<unknown> & AuditLogProcessorSlice): void;
  checkAccess(): Promise<AccessCheck.Entry[]>;
  execute(commands: Commands): Promise<void>;
}
export declare const AuditLogProcessor: typeof AuditLogProcessorImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("../../domain/pipeline/abstractions/Processor.js").IProcessor<any, any>
  >;
};
//# sourceMappingURL=AuditLogProcessor.d.ts.map
