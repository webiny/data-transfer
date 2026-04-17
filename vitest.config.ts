import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./"),
            "~": path.resolve(__dirname, "./src")
        }
    },
    test: {
        globals: true,
        environment: "node",
        include: ["**/*.test.ts"],
        exclude: [
            "**/node_modules/**",
            // Legacy tests using the removed PipelineRunner.processRecord/processAll APIs
            // and TransformPipeline. Will be ported (or deleted) as part of preset migration
            // and worker-integration plans. Re-enable each test once its consumer is migrated.
            "__tests__/batch-processing.test.ts",
            "__tests__/cms-entries.test.ts",
            "__tests__/cms-model-field-attributes.test.ts",
            "__tests__/file-manager-metadata.test.ts",
            "__tests__/file-manager-settings.test.ts",
            "__tests__/folder-records.test.ts",
            "__tests__/full-table-migration.test.ts",
            "__tests__/global-transformations.test.ts",
            "__tests__/integration/os-migration.test.ts",
            "__tests__/mailer-settings.test.ts",
            "__tests__/os-table-migration.test.ts",
            "__tests__/preset-system.test.ts",
            "__tests__/record-filtering.test.ts",
            "__tests__/security-groups-to-roles.test.ts",
            "__tests__/security-teams.test.ts"
        ],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"]
        }
    }
});
