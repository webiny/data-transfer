import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promptOptions } from "~/commands/init/steps/promptOptions.js";

describe("promptOptions", () => {
    let dir: string;

    function setupPresets(...names: string[]) {
        dir = mkdtempSync(join(tmpdir(), "prompt-"));
        for (const name of names) {
            mkdirSync(join(dir, name));
            writeFileSync(join(dir, name, "config.ts"), "");
        }
        return dir;
    }

    afterEach(() => {
        if (dir) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("returns options directly when all flags provided", async () => {
        const projectsDir = setupPresets("v5-to-v6", "blank");
        const result = await promptOptions({
            projectName: "my-project",
            preset: "v5-to-v6",
            pm: "yarn",
            projectsDir
        });
        expect(result).toEqual({
            projectName: "my-project",
            preset: "v5-to-v6",
            packageManager: "yarn"
        });
    });

    it("throws for invalid preset", async () => {
        const projectsDir = setupPresets("v5-to-v6");
        await expect(
            promptOptions({ projectName: "x", preset: "nope", pm: "npm", projectsDir })
        ).rejects.toThrow(/nope.*available.*v5-to-v6/i);
    });

    it("throws for invalid package manager", async () => {
        const projectsDir = setupPresets("v5-to-v6");
        await expect(
            promptOptions({ projectName: "x", preset: "v5-to-v6", pm: "bun", projectsDir })
        ).rejects.toThrow(/bun.*yarn.*npm.*pnpm/i);
    });

    it("throws when no presets found", async () => {
        const projectsDir = setupPresets();
        await expect(promptOptions({ projectName: "x", projectsDir })).rejects.toThrow(
            /no presets/i
        );
    });
});
