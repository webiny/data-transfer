import { MigrationRunner } from "../core/runner.ts";
import { MigrationConfig } from "../core/types.ts";
import { DatabaseClient } from "../database/interface.ts";
import { fullPreset } from "../presets/full.ts";

/**
 * Helper function for tests to create a MigrationRunner with the full preset.
 * This replaces the old bootstrapMigrationRunner function.
 */
export function createTestRunner(
  config: MigrationConfig,
  database: DatabaseClient
): MigrationRunner {
  const runner = new MigrationRunner(config, database);
  fullPreset.configure(runner, config, database);
  return runner;
}
