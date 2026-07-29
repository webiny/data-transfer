import type { DdbTransformContext } from "../features/TransformContext/abstractions/contextAliases.js";
import type { Transformer } from "../domain/pipeline/abstractions/Transformer.js";
export declare function createDdbTransformer(
  name: string,
  fn: Transformer.Interface<DdbTransformContext.Interface>
): Transformer.Interface<DdbTransformContext.Interface>;
//# sourceMappingURL=createDdbTransformer.d.ts.map
