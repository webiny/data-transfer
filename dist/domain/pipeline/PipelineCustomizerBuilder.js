export class PipelineCustomizerBuilder {
  filters = [];
  transformers = [];
  filter(filter) {
    this.filters.push(filter);
    return this;
  }
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
  getFilters() {
    return this.filters;
  }
  getTransformers() {
    return this.transformers;
  }
}
//# sourceMappingURL=PipelineCustomizerBuilder.js.map
