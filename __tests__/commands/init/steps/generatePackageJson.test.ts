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

    it("always includes packageManager field with yarn", () => {
        const result = JSON.parse(generatePackageJson("test"));
        expect(result.packageManager).toMatch(/^yarn@/);
    });

    it("excludes heavy transitive deps and pins react via resolutions and overrides", () => {
        const result = JSON.parse(generatePackageJson("test"));
        for (const field of ["resolutions", "overrides"]) {
            const section = result[field];
            expect(section["@webiny/admin-ui"]).toBe("npm:empty-npm-package@1.0.0");
            expect(section["@webiny/api-elasticsearch-tasks"]).toBe("npm:empty-npm-package@1.0.0");
            expect(section["@webiny/project"]).toBe("npm:empty-npm-package@1.0.0");
            expect(section["react"]).toBe("18.3.1");
            expect(section["react-dom"]).toBe("18.3.1");
        }
    });
});
