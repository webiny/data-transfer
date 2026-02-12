import { MigrationRunner } from "../core/runner.ts";
import { MigrationConfig } from "../core/types.ts";
import { DatabaseClient } from "../database/interface.ts";

// ============================================================================
// Preset Types
// ============================================================================

/**
 * A migration preset defines a collection of transformation pipelines
 * that should be applied during migration.
 */
export interface MigrationPreset {
  /** Unique name for the preset */
  name: string;

  /** Human-readable description of what this preset does */
  description: string;

  /**
   * Configure the migration runner with pipelines.
   * This is where you register all the transformation pipelines
   * that should be applied for this preset.
   */
  configure(runner: MigrationRunner, config: MigrationConfig, database: DatabaseClient): void;
}

/**
 * Helper class for building presets in a fluent style.
 * Wraps a MigrationRunner and provides a more ergonomic API.
 */
export class PresetBuilder {
  constructor(
    private runner: MigrationRunner,
    private config: MigrationConfig,
    private database: DatabaseClient
  ) {}

  /** Get the underlying runner */
  getRunner(): MigrationRunner {
    return this.runner;
  }

  /** Get the migration config */
  getConfig(): MigrationConfig {
    return this.config;
  }

  /** Get the database client */
  getDatabase(): DatabaseClient {
    return this.database;
  }
}
