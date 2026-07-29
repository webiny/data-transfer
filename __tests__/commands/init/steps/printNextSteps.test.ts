import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { printNextSteps } from "~/commands/init/steps/printNextSteps.js";

describe("printNextSteps", () => {
    let output: string[];
    const originalLog = console.log;

    beforeEach(() => {
        output = [];
        console.log = (...args: unknown[]) => output.push(args.join(" "));
    });

    afterEach(() => {
        console.log = originalLog;
    });

    it("includes cd command with project name", () => {
        printNextSteps({ projectName: "my-migration", preset: "v5-to-v6", packageManager: "yarn" });
        const text = output.join("\n");
        expect(text).toContain("cd my-migration");
    });

    it("uses yarn for yarn projects", () => {
        printNextSteps({ projectName: "test", preset: "blank", packageManager: "yarn" });
        const text = output.join("\n");
        expect(text).toContain("yarn transfer");
        expect(text).not.toContain("npm run");
    });

    it("uses npm run for npm projects", () => {
        printNextSteps({ projectName: "test", preset: "blank", packageManager: "npm" });
        const text = output.join("\n");
        expect(text).toContain("npm run transfer");
    });

    it("uses pnpm for pnpm projects", () => {
        printNextSteps({ projectName: "test", preset: "blank", packageManager: "pnpm" });
        const text = output.join("\n");
        expect(text).toContain("pnpm transfer");
    });

    it("includes env copy instruction", () => {
        printNextSteps({ projectName: "test", preset: "blank", packageManager: "npm" });
        const text = output.join("\n");
        expect(text).toContain("cp .env.example .env");
    });
});
