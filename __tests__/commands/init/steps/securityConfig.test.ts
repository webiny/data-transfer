import { describe, it, expect } from "vitest";
import { generateSecurityConfig } from "~/commands/init/steps/securityConfig.js";

describe("generateSecurityConfig", () => {
    it("generates .yarnrc.yml", () => {
        const result = generateSecurityConfig();
        expect(result.filename).toBe(".yarnrc.yml");
        expect(result.content).toContain("enableScripts: false");
        expect(result.content).toContain("npmMinimalAgeGate: 3d");
        expect(result.content).toContain(`"@webiny/*"`);
        expect(result.content).toContain("nodeLinker: node-modules");
    });
});
