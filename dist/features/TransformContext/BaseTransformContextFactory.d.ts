import { ModelProvider } from "../../features/ModelProvider/abstractions/ModelProvider.js";
import { Cache } from "../../tools/Cache/abstractions/Cache.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { BaseTransformContextFactory as BaseTransformContextFactoryAbstraction } from "./abstractions/BaseTransformContext.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
export type { IBaseTransformContextFactory } from "./abstractions/BaseTransformContext.js";
declare class BaseTransformContextFactoryImpl
  implements BaseTransformContextFactoryAbstraction.Interface
{
  private readonly modelProvider;
  private readonly cache;
  private readonly logger;
  private readonly compressionHandler;
  constructor(
    modelProvider: ModelProvider.Interface,
    cache: Cache.Interface,
    logger: Logger.Interface,
    compressionHandler: CompressionHandler.Interface
  );
  create<TRecord>(
    params: BaseTransformContextFactoryAbstraction.CreateParams<TRecord>
  ): BaseTransformContextFactoryAbstraction.CreateResult<TRecord>;
}
export declare const BaseTransformContextFactory: typeof BaseTransformContextFactoryImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/BaseTransformContext.ts").IBaseTransformContextFactory
  >;
};
//# sourceMappingURL=BaseTransformContextFactory.d.ts.map
