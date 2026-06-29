import { Commands } from "~/domain/transform/commands/Commands.ts";
import { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import { Cache } from "~/tools/Cache/abstractions/Cache.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import {
    BaseTransformContext as BaseTransformContextAbstraction,
    BaseTransformContextFactory as BaseTransformContextFactoryAbstraction
} from "./abstractions/BaseTransformContext.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

class BaseTransformContextFactoryImpl implements BaseTransformContextFactoryAbstraction.Interface {
    public constructor(
        private readonly modelProvider: ModelProvider.Interface,
        private readonly cache: Cache.Interface,
        private readonly logger: Logger.Interface,
        private readonly compressionHandler: CompressionHandler.Interface
    ) {}

    public create<TRecord>(
        params: BaseTransformContextFactoryAbstraction.CreateParams<TRecord>
    ): BaseTransformContextFactoryAbstraction.CreateResult<TRecord> {
        const commands = new Commands();
        const modelProvider = this.modelProvider;
        const cache = this.cache;
        const logger = this.logger;
        const compressionHandler = this.compressionHandler;

        let blackholed = false;

        const ctx: BaseTransformContextAbstraction.Interface<TRecord> = {
            record: structuredClone(params.record),
            original: Object.freeze(structuredClone(params.record)),
            modelProvider,
            cache,
            logger,
            compressionHandler,
            replace(newRecord: TRecord): void {
                ctx.record = newRecord;
            },
            addCommand(cmd): void {
                commands.add(cmd);
            },
            get isBlackholed(): boolean {
                return blackholed;
            },
            blackhole(): void {
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
