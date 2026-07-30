import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffold } from "~/commands/init/steps/scaffold.js";

describe("scaffold", () => {
    let workDir: string;
    let templatesDir: string;

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), "scaffold-work-"));
        templatesDir = mkdtempSync(join(tmpdir(), "scaffold-tpl-"));

        writeFileSync(join(templatesDir, "tsconfig.json"), "{}");
        writeFileSync(join(templatesDir, ".gitignore"), "node_modules");
        writeFileSync(
            join(templatesDir, "config.ts"),
            `import { createConfig } from "@webiny/data-transfer";`
        );
        writeFileSync(join(templatesDir, ".env.example"), "SOURCE_REGION=eu-central-1");
        mkdirSync(join(templatesDir, "presets"));
        mkdirSync(join(templatesDir, "transformers"));
        mkdirSync(join(templatesDir, "models"));
    });

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true });
        rmSync(templatesDir, { recursive: true, force: true });
    });

    it("creates target directory with templates", () => {
        const target = join(workDir, "my-project");
        scaffold({ options: { projectName: "my-project" }, targetDir: target, templatesDir });
        expect(existsSync(join(target, "tsconfig.json"))).toBe(true);
        expect(existsSync(join(target, "config.ts"))).toBe(true);
        expect(existsSync(join(target, ".env.example"))).toBe(true);
    });

    it("copies preset and transformer directories", () => {
        const target = join(workDir, "my-project");
        scaffold({ options: { projectName: "my-project" }, targetDir: target, templatesDir });
        expect(existsSync(join(target, "presets"))).toBe(true);
        expect(existsSync(join(target, "transformers"))).toBe(true);
        expect(existsSync(join(target, "models"))).toBe(true);
    });

    it("generates package.json with project name", () => {
        const target = join(workDir, "my-project");
        scaffold({ options: { projectName: "my-project" }, targetDir: target, templatesDir });
        const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf-8"));
        expect(pkg.name).toBe("my-project");
    });

    it("writes .yarnrc.yml", () => {
        const target = join(workDir, "my-project");
        scaffold({ options: { projectName: "my-project" }, targetDir: target, templatesDir });
        expect(existsSync(join(target, ".yarnrc.yml"))).toBe(true);
    });

    it("throws if target directory exists", () => {
        const target = join(workDir, "exists");
        mkdirSync(target);
        expect(() =>
            scaffold({ options: { projectName: "exists" }, targetDir: target, templatesDir })
        ).toThrow(/already exists/);
    });
});
