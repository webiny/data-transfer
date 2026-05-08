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
        exclude: ["**/node_modules/**"],
        // Installs the DEP0151 filter before any test module loads — tests
        // also pull @webiny/lexical-* via transformer imports.
        setupFiles: ["./src/utils/suppressDeprecations.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            thresholds: {
                lines: 77,
                functions: 80,
                branches: 70,
                statements: 77
            }
        }
    }
});
