import type { MigrationPreset } from "@/src/presets/types.js";
import { CmsModelPipeline, CmsEntryPipeline } from "@/src/pipelines.ts";
import { MigrationRunner } from "@/src/core/runner.ts";

// ============================================================================
// CMS-Only Migration Preset
// ============================================================================

export const preset: MigrationPreset = {
  name: "cms-only",
  description: "Migrate only CMS models and entries",
  configure(runner: MigrationRunner): void {
    // Use pre-configured pipelines with all core transformations
    runner.register(new CmsModelPipeline().build()).register(new CmsEntryPipeline().build());
  }
};
