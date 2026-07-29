import { unifiedTransferInputSchema } from "./schemas/unified.schema.ts";
import type { MigrationConfiguration } from "./validation.ts";
import { z } from "zod";
export declare function createConfig(
  input: z.input<typeof unifiedTransferInputSchema>
): MigrationConfiguration;
//# sourceMappingURL=createConfig.d.ts.map
