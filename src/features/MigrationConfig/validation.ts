import { z } from "zod";
import { unifiedTransferInputSchema } from "./schemas/unified.schema.ts";

export const migrationConfigSchema = unifiedTransferInputSchema;
export type MigrationConfiguration = z.infer<typeof migrationConfigSchema>;
