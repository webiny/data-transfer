import { createAbstraction } from "@/src/base/index.ts";
import type { MigrationConfiguration } from "@/src/config/validation.ts";

export const MigrationConfig = createAbstraction<MigrationConfiguration>("Core/MigrationConfig");

export namespace MigrationConfig {
  export type Interface = MigrationConfiguration;
}
