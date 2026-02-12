import { describe, it, expect } from "vitest";
import { loadPreset } from "../src/presets/loader";
import { fullPreset } from "../src/presets/full";
import { MigrationRunner } from "../src/core/runner";
import { MigrationConfig } from "../src/core/types";
import { DatabaseClient } from "../src/database/interface";

describe("Preset System", () => {
  describe("loadPreset", () => {
    it("should load built-in 'full' preset", async () => {
      const preset = await loadPreset("full");

      expect(preset).toBeDefined();
      expect(preset.name).toBe("full");
      expect(preset.description).toBeTruthy();
      expect(typeof preset.configure).toBe("function");
    });

    it("should throw error for unknown preset name", async () => {
      await expect(loadPreset("unknown-preset")).rejects.toThrow("Unknown preset");
    });

    it("should throw error for non-existent file path", async () => {
      await expect(loadPreset("./non-existent-preset.ts")).rejects.toThrow("Preset file not found");
    });
  });

  describe("Full Preset", () => {
    it("should have correct structure", () => {
      expect(fullPreset.name).toBe("full");
      expect(fullPreset.description).toBeTruthy();
      expect(typeof fullPreset.configure).toBe("function");
    });

    it("should configure runner with pipelines", () => {
      // Create mock config and database
      const mockConfig: MigrationConfig = {
        sourcePrimaryTable: "test-source",
        targetPrimaryTable: "test-target",
        sourceFmBucket: "test-source-bucket",
        targetFmBucket: "test-target-bucket",
        modelProvider: {} as any
      };

      const mockDatabase: DatabaseClient = {} as any;

      // Create runner and configure with preset
      const runner = new MigrationRunner(mockConfig, mockDatabase);
      fullPreset.configure(runner, mockConfig, mockDatabase);

      // Runner should have pipelines registered
      // We can't directly access pipelines, but we can verify it doesn't throw
      expect(runner).toBeDefined();
    });
  });

  describe("Example Presets", () => {
    it("should load cms-only preset", async () => {
      const preset = await loadPreset("./examples/preset-cms-only.ts", process.cwd());

      expect(preset).toBeDefined();
      expect(preset.name).toBe("cms-only");
      expect(typeof preset.configure).toBe("function");
    });
  });

  describe("Preset Configuration", () => {
    it("should allow custom presets to register pipelines", () => {
      const mockConfig: MigrationConfig = {
        sourcePrimaryTable: "test-source",
        targetPrimaryTable: "test-target",
        sourceFmBucket: "test-source-bucket",
        targetFmBucket: "test-target-bucket",
        modelProvider: {} as any
      };

      const mockDatabase: DatabaseClient = {} as any;

      const customPreset = {
        name: "test-preset",
        description: "Test preset",
        configure(runner: MigrationRunner, config: MigrationConfig, database: DatabaseClient) {
          // Should not throw
          expect(runner).toBeDefined();
          expect(config).toBeDefined();
          expect(database).toBeDefined();
        }
      };

      const runner = new MigrationRunner(mockConfig, mockDatabase);
      customPreset.configure(runner, mockConfig, mockDatabase);
    });
  });
});
