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
        printNextSteps({ projectName: "my-migration" });
        const text = output.join("\n");
        expect(text).toContain("cd my-migration");
    });

    it("uses yarn for transfer command", () => {
        printNextSteps({ projectName: "test" });
        const text = output.join("\n");
        expect(text).toContain("yarn transfer");
    });

    it("includes env copy instruction", () => {
        printNextSteps({ projectName: "test" });
        const text = output.join("\n");
        expect(text).toContain("cp .env.example .env");
    });
});
