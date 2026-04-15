import { MigrationRunner } from "../core/runner.ts";
import { MigrationConfig } from "../core/types.ts";
import { DatabaseClient } from "../database/interface.ts";
import { v5ToV6Preset } from "../presets/v5-to-v6-ddb.ts";

/**
 * Helper function for tests to create a MigrationRunner with the v5-to-v6 preset.
 * This replaces the old bootstrapMigrationRunner function.
 */
export function createTestRunner(
  config: MigrationConfig,
  database: DatabaseClient
): MigrationRunner {
  const runner = new MigrationRunner(config, database);
  v5ToV6Preset.configure(runner, config, database);
  return runner;
}
