import type { Command } from "../../../domain/transform/commands/Command.js";
import type { Commands } from "../../../domain/transform/commands/Commands.js";
import type { ModelProvider } from "../../../features/ModelProvider/abstractions/ModelProvider.js";
import type { Cache } from "../../../tools/Cache/abstractions/Cache.js";
import type { Logger } from "../../../tools/Logger/abstractions/Logger.js";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
export interface IBaseTransformContext<TRecord = unknown> {
  record: TRecord;
  readonly original: Readonly<TRecord>;
  readonly modelProvider: ModelProvider.Interface;
  readonly cache: Cache.Interface;
  readonly logger: Logger.Interface;
  readonly compressionHandler: CompressionHandler.Interface;
  replace(newRecord: TRecord): void;
  /**
   * Push a command to the bag. Slice helpers (DdbProcessor.putRecord,
   * S3Processor.copyFile, OsProcessor.putRecord, etc.) use this
   * internally. Transformers reach for slice helpers when available;
   * reach for addCommand directly when emitting custom command types
   * no slice helper provides.
   */
  addCommand(cmd: Command): void;
  /**
   * Suppress all writes for this record. Once called, isBlackholed becomes
   * true and the pipeline runner discards every command in the bag before
   * forwarding to processors. The call is irreversible within the record
   * lifecycle — each factory.create() starts a fresh, un-blackholed ctx.
   */
  blackhole(): void;
  readonly isBlackholed: boolean;
}
export interface ICreateParams<TRecord> {
  record: TRecord;
}
export interface IBaseContextCreateResult<TRecord> {
  ctx: IBaseTransformContext<TRecord>;
  commands: Commands;
}
export interface IBaseTransformContextFactory {
  create<TRecord>(params: ICreateParams<TRecord>): IBaseContextCreateResult<TRecord>;
}
export declare const BaseTransformContext: import("@webiny/di").Abstraction<
  IBaseTransformContext<unknown>
>;
export declare namespace BaseTransformContext {
  type Interface<TRecord = unknown> = IBaseTransformContext<TRecord>;
}
export declare const BaseTransformContextFactory: import("@webiny/di").Abstraction<IBaseTransformContextFactory>;
export declare namespace BaseTransformContextFactory {
  type Interface = IBaseTransformContextFactory;
  type CreateParams<TRecord> = ICreateParams<TRecord>;
  type CreateResult<TRecord> = IBaseContextCreateResult<TRecord>;
}
//# sourceMappingURL=BaseTransformContext.d.ts.map
