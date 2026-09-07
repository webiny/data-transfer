import type { MigrationConfig } from "~/features/MigrationConfig/index.js";

export type SystemName = "source" | "target";
export type TableKind = "ddb" | "os";
export type SystemConfig =
    | MigrationConfig.Interface["source"]
    | MigrationConfig.Interface["target"];
