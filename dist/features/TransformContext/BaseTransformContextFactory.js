import { Commands } from "../../domain/transform/commands/Commands.js";
import { ModelProvider } from "../../features/ModelProvider/abstractions/ModelProvider.js";
import { Cache } from "../../tools/Cache/abstractions/Cache.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { BaseTransformContextFactory as BaseTransformContextFactoryAbstraction } from "./abstractions/BaseTransformContext.js";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
class BaseTransformContextFactoryImpl {
  modelProvider;
  cache;
  logger;
  compressionHandler;
  constructor(modelProvider, cache, logger, compressionHandler) {
    this.modelProvider = modelProvider;
    this.cache = cache;
    this.logger = logger;
    this.compressionHandler = compressionHandler;
  }
  create(params) {
    const commands = new Commands();
    const modelProvider = this.modelProvider;
    const cache = this.cache;
    const logger = this.logger;
    const compressionHandler = this.compressionHandler;
    let blackholed = false;
    const ctx = {
      record: structuredClone(params.record),
      original: Object.freeze(structuredClone(params.record)),
      modelProvider,
      cache,
      logger,
      compressionHandler,
      replace(newRecord) {
        ctx.record = newRecord;
      },
      addCommand(cmd) {
        commands.add(cmd);
      },
      get isBlackholed() {
        return blackholed;
      },
      blackhole() {
        blackholed = true;
      }
    };
    return { ctx, commands };
  }
}
export const BaseTransformContextFactory =
  BaseTransformContextFactoryAbstraction.createImplementation({
    implementation: BaseTransformContextFactoryImpl,
    dependencies: [ModelProvider, Cache, Logger, CompressionHandler]
  });
//# sourceMappingURL=BaseTransformContextFactory.js.map
