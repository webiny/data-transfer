import { TransformPipeline, type RecordFilter } from "./Pipeline.ts";
import type { Transformer } from "./Transformer.ts";

/**
 * Thin builder wrapper around TransformPipeline.
 * Separates "what to process" (filters) from "how to transform" (transformers).
 */
export class PipelineBuilder<TInput extends Record<string, unknown> = Record<string, unknown>> {
    protected pipeline: TransformPipeline<TInput>;

    public constructor() {
        this.pipeline = new TransformPipeline<TInput>();
    }

    /** Add a filter — record must pass ALL filters to be processed */
    public filter(predicate: RecordFilter<TInput>): this {
        this.pipeline.filter(predicate);
        return this;
    }

    /** Add a transformer to the pipeline */
    public use<T extends Transformer<any>>(transformer: T): this {
        this.pipeline.use(transformer);
        return this;
    }

    /** Return the underlying pipeline */
    public build(): TransformPipeline<TInput> {
        return this.pipeline;
    }
}
