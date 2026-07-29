import type { Processor } from "../domain/pipeline/abstractions/Processor.js";
import type { Transformer } from "../domain/pipeline/abstractions/Transformer.js";
export declare function createTransformer<TContext extends Processor.Context>(
  name: string,
  fn: Transformer.Interface<TContext>
): Transformer.Interface<TContext>;
//# sourceMappingURL=createTransformer.d.ts.map
