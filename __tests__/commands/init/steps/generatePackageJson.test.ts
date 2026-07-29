import { describe, it, expect } from "vitest";
import { generatePackageJson } from "~/commands/init/steps/generatePackageJson.js";

describe("generatePackageJson", () => {
    it("generates valid JSON with project name", () => {
        const result = JSON.parse(generatePackageJson("my-migration"));
        expect(result.name).toBe("my-migration");
        expect(result.private).toBe(true);
        expect(result.type).toBe("module");
    });

    it("includes transfer script", () => {
        const result = JSON.parse(generatePackageJson("test"));
        expect(result.scripts.transfer).toBe("webiny-data-transfer");
    });

    it("includes ts-check script", () => {
        const result = JSON.parse(generatePackageJson("test"));
        expect(result.scripts["ts-check"]).toBe("tsc --noEmit");
    });

    it("includes @webiny/data-transfer as dependency with caret range", () => {
        const result = JSON.parse(generatePackageJson("test"));
        const version = result.dependencies["@webiny/data-transfer"];
        expect(version).toMatch(/^\^/);
        expect(version.length).toBeGreaterThan(1);
    });

    it("includes typescript as devDependency", () => {
        const result = JSON.parse(generatePackageJson("test"));
        expect(result.devDependencies.typescript).toMatch(/^\^/);
    });

    it("includes packageManager field for yarn", () => {
        const result = JSON.parse(generatePackageJson("test", "yarn"));
        expect(result.packageManager).toMatch(/^yarn@/);
    });

    it("omits packageManager field for npm", () => {
        const result = JSON.parse(generatePackageJson("test", "npm"));
        expect(result.packageManager).toBeUndefined();
    });

    it("omits packageManager field for pnpm", () => {
        const result = JSON.parse(generatePackageJson("test", "pnpm"));
        expect(result.packageManager).toBeUndefined();
    });
});
