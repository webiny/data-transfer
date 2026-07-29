import { PipelineCustomizerBuilder } from "./PipelineCustomizerBuilder.js";
import { Pipeline } from "./Pipeline.js";
export class PipelineBuilder {
  name;
  scanner;
  processors;
  customizers;
  filters = [];
  transformers = [];
  beforeHooks = [];
  afterHooks = [];
  blackholeCommands = false;
  constructor(config) {
    if (!config.name || config.name.trim().length === 0) {
      throw new Error("PipelineBuilder: `name` is required and must be non-empty");
    }
    this.name = config.name;
    this.scanner = config.scanner;
    this.processors = config.processors;
    this.customizers = config.customizers;
  }
  /**
   * Add a filter. Order across .filter() calls within a single builder
   * does NOT matter — all filters are AND-composed. PipelineCustomizer
   * filters are always appended after the preset's filters at build()
   * time.
   */
  filter(filter) {
    this.filters.push(filter);
    return this;
  }
  /**
   * Register one or more transformers. Transformers see the effective
   * context — BaseTransformContext merged with every processor slice
   * from the pipeline's processor list.
   *
   * Accepts a single transformer OR an array, so shared stacks can be
   * declared once and applied across pipelines:
   *
   *   const contentStack = [wrapInData, addGsiTenant, removeAttributes];
   *   factory.create({...}).filter(...).use(contentStack).build();
   *
   * Arrays are appended element-by-element in order; mixing array and
   * single calls is fine — the internal list just accumulates.
   */
  use(transformer) {
    if (Array.isArray(transformer)) {
      for (const item of transformer) {
        this.transformers.push(item);
      }
    } else {
      this.transformers.push(transformer);
    }
    return this;
  }
  beforeExecuteCommands(token) {
    this.beforeHooks.push(token);
    return this;
  }
  afterExecuteCommands(token) {
    this.afterHooks.push(token);
    return this;
  }
  /**
   * Observe-only mode. Filters + transformers + onEnd all run as usual,
   * but every command emitted during a blackholed record is dropped at
   * the per-record → shard fold step, so nothing from this pipeline
   * lands on the target. Useful for dry-runs of a single pipeline
   * inside an otherwise real transfer, or for validation-only passes
   * that don't produce writes.
   *
   * Accepts an optional predicate — if provided, blackhole mode is only
   * activated when the predicate returns true. Evaluated immediately at
   * call time, so any variables closed over are resolved in the same
   * synchronous configure() context.
   */
  blackhole(condition) {
    if (condition === undefined || condition()) {
      this.blackholeCommands = true;
    }
    return this;
  }
  async build() {
    const custFilters = [];
    const custTransformers = [];
    for (const customizer of this.customizers) {
      if (!customizer.canUse(this.name)) {
        continue;
      }
      const custBuilder = new PipelineCustomizerBuilder();
      await customizer.configure(custBuilder);
      custFilters.push(...custBuilder.getFilters());
      custTransformers.push(...custBuilder.getTransformers());
    }
    const pipelineConfig = {
      name: this.name,
      scanner: this.scanner,
      processors: this.processors,
      filters: [...this.filters, ...custFilters],
      transformers: [...this.transformers, ...custTransformers],
      beforeHooks: [...this.beforeHooks],
      afterHooks: [...this.afterHooks],
      blackhole: this.blackholeCommands
    };
    return new Pipeline(pipelineConfig);
  }
}
//# sourceMappingURL=PipelineBuilder.js.map
