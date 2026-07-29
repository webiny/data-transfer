export class Pipeline {
  config;
  constructor(config) {
    this.config = config;
    Object.freeze(this);
  }
  get name() {
    return this.config.name;
  }
  get scanner() {
    return this.config.scanner;
  }
  get processors() {
    return this.config.processors;
  }
  get beforeHookTokens() {
    return this.config.beforeHooks;
  }
  get afterHookTokens() {
    return this.config.afterHooks;
  }
  get transformerFns() {
    return this.config.transformers;
  }
  get hasFilter() {
    return this.config.filters.length > 0;
  }
  get isBlackhole() {
    return this.config.blackhole === true;
  }
  async accepts(record) {
    for (const filter of this.config.filters) {
      if (!(await filter.check(record))) {
        return false;
      }
    }
    return true;
  }
}
//# sourceMappingURL=Pipeline.js.map
