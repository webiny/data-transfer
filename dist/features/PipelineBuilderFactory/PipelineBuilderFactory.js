import { PipelineBuilder } from "../../domain/pipeline/PipelineBuilder.js";
import { Scanner } from "../../domain/pipeline/abstractions/Scanner.js";
import { Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { PipelineCustomizer } from "../../features/PipelineCustomizer/abstractions/PipelineCustomizer.js";
import { PipelineBuilderFactory as PipelineBuilderFactoryAbstraction } from "./abstractions/PipelineBuilderFactory.js";
class PipelineBuilderFactoryImpl {
  processors;
  scanners;
  customizers;
  consumedCustomizers = new Set();
  constructor(processors, scanners, customizers) {
    this.processors = processors;
    this.scanners = scanners;
    this.customizers = customizers;
  }
  create(input) {
    const scannerInstance = this.scanners.find(s => s.constructor === input.scanner);
    if (!scannerInstance) {
      throw new Error(
        `PipelineBuilderFactory: scanner "${input.scanner.name}" is not registered in the container`
      );
    }
    const processorInstances = input.processors.map(implClass => {
      const instance = this.processors.find(p => p.constructor === implClass);
      if (!instance) {
        throw new Error(
          `PipelineBuilderFactory: processor "${implClass.name}" is not registered in the container`
        );
      }
      return instance;
    });
    for (let i = 0; i < this.customizers.length; i++) {
      if (this.customizers[i].canUse(input.name)) {
        this.consumedCustomizers.add(i);
      }
    }
    return new PipelineBuilder({
      name: input.name,
      scanner: scannerInstance,
      processors: processorInstances,
      customizers: this.customizers
    });
  }
  warnUnmatchedCustomizers(logger) {
    for (let i = 0; i < this.customizers.length; i++) {
      if (!this.consumedCustomizers.has(i)) {
        logger.warn(
          `PipelineCustomizer "${this.customizers[i].name}" did not match any registered pipeline`
        );
      }
    }
  }
}
export const PipelineBuilderFactory = PipelineBuilderFactoryAbstraction.createImplementation({
  implementation: PipelineBuilderFactoryImpl,
  dependencies: [
    [Processor, { multiple: true }],
    [Scanner, { multiple: true }],
    [PipelineCustomizer, { multiple: true }]
  ]
});
//# sourceMappingURL=PipelineBuilderFactory.js.map
