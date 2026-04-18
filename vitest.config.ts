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
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"]
        }
    }
});
