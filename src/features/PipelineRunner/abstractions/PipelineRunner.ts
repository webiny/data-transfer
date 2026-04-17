import { createAbstraction } from "~/base/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { TransformPipeline } from "~/domain/transform/Pipeline.ts";

interface IPipelineRunner {
    /** Register a pipeline — first-match-wins order */
    register(pipeline: TransformPipeline<any>): this;
    /** Run the first matching pipeline on a record; returns empty Commands if none match */
    processRecord(record: BaseRecord): Promise<Commands>;
    /** Run all records through processRecord and merge their commands into one collection */
    processAll(records: BaseRecord[]): Promise<Commands>;
}

export const PipelineRunner = createAbstraction<IPipelineRunner>("Core/PipelineRunner");

export namespace PipelineRunner {
    export type Interface = IPipelineRunner;
}
