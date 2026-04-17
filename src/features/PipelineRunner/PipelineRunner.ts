import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { TransformPipeline } from "~/domain/transform/Pipeline.ts";
import { BaseTransformContextFactory } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { PipelineRunner as PipelineRunnerAbstraction } from "./abstractions/PipelineRunner.ts";

class PipelineRunnerImpl implements PipelineRunnerAbstraction.Interface {
    private pipelines: TransformPipeline<any>[] = [];

    public constructor(private readonly contextFactory: BaseTransformContextFactory.Interface) {}

    public register(pipeline: TransformPipeline<any>): this {
        this.pipelines.push(pipeline);
        return this;
    }

    public async processRecord(record: BaseRecord): Promise<Commands> {
        for (const pipeline of this.pipelines) {
            if (pipeline.accepts(record)) {
                const result = await pipeline.run(record, this.contextFactory);
                return result ? result.commands : new Commands();
            }
        }
        return new Commands();
    }

    public async processAll(records: BaseRecord[]): Promise<Commands> {
        const merged = new Commands();
        for (const record of records) {
            const commands = await this.processRecord(record);
            for (const cmd of commands.all()) {
                merged.add(cmd);
            }
        }
        return merged;
    }
}

export const PipelineRunner = PipelineRunnerAbstraction.createImplementation({
    implementation: PipelineRunnerImpl,
    dependencies: [BaseTransformContextFactory]
});
