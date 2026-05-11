import { unifiedTransferInputSchema } from "./schemas/unified.schema.ts";
import type { MigrationConfiguration } from "./validation.ts";
import { z } from "zod";

export function createConfig(input: z.input<typeof unifiedTransferInputSchema>): MigrationConfiguration {
    return unifiedTransferInputSchema.parse(input);
}
