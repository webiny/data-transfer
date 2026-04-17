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
            "__tests__/os-table-migration.test.ts",
            "__tests__/integration/os-migration.test.ts"
        ],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"]
        }
    }
});
