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
            "__tests__/integration/os-migration.test.ts"
        ],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"]
        }
    }
});
