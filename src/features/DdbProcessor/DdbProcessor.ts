import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import {
    DdbTransformContext,
    DdbTransformContextFactory
} from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { DdbShardState } from "./abstractions/DdbProcessor.ts";

class DdbProcessorImpl implements Processor.Interface<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>
> {
    public constructor(
        private readonly executor: DdbCommandExecutor.Interface,
        private readonly contextFactory: DdbTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        await this.executor.execute(commands);
    }

    public createContext(record: BaseRecord): DdbTransformContext.Interface<BaseRecord> {
        return this.contextFactory.create({ record });
    }

    public getShardState(): DdbShardState {
        return {};
    }
}

export const DdbProcessor = Processor.createImplementation({
    implementation: DdbProcessorImpl,
    dependencies: [DdbCommandExecutor, DdbTransformContextFactory]
});

export namespace DdbProcessor {
    export type ShardState = DdbShardState;
}
