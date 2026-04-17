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
        // Legacy tests pending migration to new DI pipeline/runner.
        // See AGENTS.md — they rely on the old MigrationRunner which is incompatible
        // with the new TransformPipeline. They'll be ported alongside old runner removal.
        exclude: [
            "**/node_modules/**",
            "__tests__/batch-processing.test.ts",
            "__tests__/cms-entries.test.ts",
            "__tests__/cms-model-field-attributes.test.ts",
            "__tests__/file-manager-metadata.test.ts",
            "__tests__/file-manager-settings.test.ts",
            "__tests__/folder-records.test.ts",
            "__tests__/full-table-migration.test.ts",
            "__tests__/global-transformations.test.ts",
            "__tests__/mailer-settings.test.ts",
            "__tests__/nested-pipeline.test.ts",
            "__tests__/os-table-migration.test.ts",
            "__tests__/preset-pipelines.test.ts",
            "__tests__/record-filtering.test.ts",
            "__tests__/security-groups-to-roles.test.ts",
            "__tests__/security-teams.test.ts",
            "__tests__/integration/os-migration.test.ts"
        ],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"]
        }
    }
});
