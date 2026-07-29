import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffold } from "~/commands/init/steps/scaffold.js";

describe("scaffold", () => {
    let workDir: string;
    let templatesDir: string;
    let projectsDir: string;

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), "scaffold-work-"));
        templatesDir = mkdtempSync(join(tmpdir(), "scaffold-tpl-"));
        projectsDir = mkdtempSync(join(tmpdir(), "scaffold-presets-"));

        // Minimal templates tree
        writeFileSync(join(templatesDir, "tsconfig.json"), "{}");
        writeFileSync(join(templatesDir, ".gitignore"), "node_modules");
        writeFileSync(join(templatesDir, "package.json.tpl"), "should-be-deleted");
        writeFileSync(join(templatesDir, ".env.example"), "should-be-deleted");

        // Preset
        mkdirSync(join(projectsDir, "blank"));
        writeFileSync(
            join(projectsDir, "blank", "config.ts"),
            `import { createConfig } from "~/index.js";\nexport default createConfig({});`
        );
        writeFileSync(join(projectsDir, "blank", ".env.example"), "SOURCE_REGION=us-east-1");
    });

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true });
        rmSync(templatesDir, { recursive: true, force: true });
        rmSync(projectsDir, { recursive: true, force: true });
    });

    it("creates target directory with templates", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(existsSync(join(target, "tsconfig.json"))).toBe(true);
    });

    it("deletes package.json.tpl after copy", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(existsSync(join(target, "package.json.tpl"))).toBe(false);
    });

    it("replaces templates/.env.example with preset version", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(readFileSync(join(target, ".env.example"), "utf-8")).toBe("SOURCE_REGION=us-east-1");
    });

    it("transforms imports in copied .ts files", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        const config = readFileSync(join(target, "config.ts"), "utf-8");
        expect(config).toContain(`from "@webiny/data-transfer"`);
        expect(config).not.toContain("~/index.ts");
    });

    it("generates package.json with project name", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf-8"));
        expect(pkg.name).toBe("my-project");
    });

    it("writes .yarnrc.yml", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(existsSync(join(target, ".yarnrc.yml"))).toBe(true);
    });

    it("throws if target directory exists", () => {
        const target = join(workDir, "exists");
        mkdirSync(target);
        expect(() =>
            scaffold({
                options: { projectName: "exists", preset: "blank" },
                targetDir: target,
                templatesDir,
                projectsDir
            })
        ).toThrow(/already exists/);
    });
});
