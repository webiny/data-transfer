import { unifiedTransferInputSchema } from "./schemas/unified.schema.js";
export function createConfig(input) {
  return unifiedTransferInputSchema.parse(input);
}
//# sourceMappingURL=createConfig.js.map
