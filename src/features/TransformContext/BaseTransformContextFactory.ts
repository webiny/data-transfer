import { Commands } from "~/domain/transform/commands/Commands.ts";
import { ModelProvider } from "~/features/ModelProvider/abstractions/ModelProvider.ts";
import { Cache } from "~/tools/Cache/abstractions/Cache.ts";
import {
    BaseTransformContext as BaseTransformContextAbstraction,
    BaseTransformContextFactory as BaseTransformContextFactoryAbstraction
} from "./abstractions/BaseTransformContext.ts";

class BaseTransformContextFactoryImpl implements BaseTransformContextFactoryAbstraction.Interface {
    public constructor(
        private readonly modelProvider: ModelProvider.Interface,
        private readonly cache: Cache.Interface
    ) {}

    public create<TRecord>(
        params: BaseTransformContextFactoryAbstraction.CreateParams<TRecord>
    ): BaseTransformContextFactoryAbstraction.CreateResult<TRecord> {
        const commands = new Commands();
        const modelProvider = this.modelProvider;
        const cache = this.cache;

        const ctx: BaseTransformContextAbstraction.Interface<TRecord> = {
            record: structuredClone(params.record),
            original: Object.freeze(structuredClone(params.record)) as Readonly<TRecord>,
            modelProvider,
            cache,
            replace(newRecord: TRecord): void {
                ctx.record = newRecord;
            },
            addCommand(cmd): void {
                commands.add(cmd);
            }
        };

        return { ctx, commands };
    }
}

export const BaseTransformContextFactory =
    BaseTransformContextFactoryAbstraction.createImplementation({
        implementation: BaseTransformContextFactoryImpl,
        dependencies: [ModelProvider, Cache]
    });
