import type { BaseRecord } from "./types/records.ts";
import type { PipelineResult } from "./types/commands.ts";
import type { Transformer } from "./Transformer.ts";
import type { BaseTransformContextFactory } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export type RecordFilter<T = Record<string, unknown>> = (record: T) => boolean;

export class TransformPipeline<TInput extends Record<string, unknown> = Record<string, unknown>> {
    private transformers: Transformer<any>[] = [];
    private filters: RecordFilter<TInput>[] = [];

    /** Add a filter — record must pass ALL filters to be processed */
    public filter(predicate: RecordFilter<TInput>): this {
        this.filters.push(predicate);
        return this;
    }

    /** Add a transformer to the pipeline */
    public use<T extends Transformer<any>>(transformer: T): this {
        this.transformers.push(transformer);
        return this;
    }

    /** Check if a record should be processed */
    public accepts(record: TInput): boolean {
        return this.filters.every(f => f(record));
    }

    /** Run the pipeline on a record */
    public async run<TRecord extends BaseRecord>(
        record: TRecord,
        contextFactory: BaseTransformContextFactory.Interface
    ): Promise<PipelineResult | null> {
        if (!this.accepts(record as unknown as TInput)) {
            return null;
        }

        const ctx = contextFactory.create({ record });

        for (const transformer of this.transformers) {
            await transformer.transform(ctx);
        }

        ctx.putRecord(ctx.record as Record<string, unknown>);

        return { commands: ctx.commands };
    }
}
