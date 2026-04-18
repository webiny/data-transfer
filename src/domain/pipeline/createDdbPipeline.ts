import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { DdbScanner } from "~/features/DdbScanner/index.ts";
import type { PipelineBuilder } from "./PipelineBuilder.ts";
import { createPipeline, type PipelineDefinition } from "./createPipeline.ts";

type DdbPipelineBuilder = PipelineBuilder<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>,
    DdbScanner.Shard
>;

type DdbPipelineDefinition = PipelineDefinition<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>,
    DdbScanner.Shard
>;

export function createDdbPipeline(
    name: string,
    configure: (builder: DdbPipelineBuilder) => void
): DdbPipelineDefinition {
    return createPipeline<BaseRecord, DdbTransformContext.Interface<BaseRecord>, DdbScanner.Shard>(
        name,
        configure
    );
}
