import type { OsScanner } from "~/features/OsScanner/index.ts";
import type { OsTransformContext } from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import { createPipeline, type PipelineDefinition } from "./createPipeline.ts";

type OsPipelineBuilder = PipelineBuilder<
    OsScanner.Record,
    OsTransformContext.Interface<OsScanner.Record>,
    OsScanner.Shard
>;

type OsPipelineDefinition = PipelineDefinition<
    OsScanner.Record,
    OsTransformContext.Interface<OsScanner.Record>,
    OsScanner.Shard
>;

export function createOsPipeline(
    name: string,
    configure: (builder: OsPipelineBuilder) => void
): OsPipelineDefinition {
    return createPipeline<
        OsScanner.Record,
        OsTransformContext.Interface<OsScanner.Record>,
        OsScanner.Shard
    >(name, configure);
}
