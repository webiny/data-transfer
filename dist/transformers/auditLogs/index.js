import { coreFieldsTransformer } from "./coreFieldsTransformer.js";
import { dataFieldsTransformer } from "./dataFieldsTransformer.js";
import { storageShapeTransformer } from "./storageShapeTransformer.js";
export const auditLogTransformers = [
  coreFieldsTransformer,
  dataFieldsTransformer,
  storageShapeTransformer
];
//# sourceMappingURL=index.js.map
