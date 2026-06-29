import type { Filter } from "./Filter.ts";
import type { Transformer } from "./abstractions/Transformer.ts";

export class PipelineCustomizerBuilder {
    private readonly filters: Filter<any>[] = [];
    private readonly transformers: Transformer.Interface<any>[] = [];

    public filter(filter: Filter<any>): this {
        this.filters.push(filter);
        return this;
    }

    public use(
        transformer: Transformer.Interface<any> | readonly Transformer.Interface<any>[]
    ): this {
        if (Array.isArray(transformer)) {
            for (const item of transformer) {
                this.transformers.push(item);
            }
        } else {
            this.transformers.push(transformer as Transformer.Interface<any>);
        }
        return this;
    }

    public getFilters(): readonly Filter<any>[] {
        return this.filters;
    }

    public getTransformers(): readonly Transformer.Interface<any>[] {
        return this.transformers;
    }
}
