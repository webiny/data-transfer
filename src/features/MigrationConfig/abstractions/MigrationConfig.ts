import { createAbstraction } from "~/base/index.ts";
import type { MigrationConfiguration } from "../validation.ts";

export const MigrationConfig = createAbstraction<MigrationConfiguration>("Core/MigrationConfig");

export namespace MigrationConfig {
    export type Interface = MigrationConfiguration;
}
