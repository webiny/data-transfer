import type { OsTransformContext } from "../features/TransformContext/abstractions/contextAliases.js";
import type { OsScanner } from "../features/OsScanner/index.js";
import type { Transformer } from "../domain/pipeline/abstractions/Transformer.js";
export declare function createOsTransformer(
  name: string,
  fn: Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>>
): Transformer.Interface<OsTransformContext.Interface<OsScanner.Record>>;
//# sourceMappingURL=createOsTransformer.d.ts.map
