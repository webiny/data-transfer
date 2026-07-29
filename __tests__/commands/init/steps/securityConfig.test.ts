import { describe, it, expect } from "vitest";
import { generateSecurityConfig } from "~/commands/init/steps/securityConfig.js";

describe("generateSecurityConfig", () => {
    it("generates .yarnrc.yml with security defaults", () => {
        const result = generateSecurityConfig();
        expect(result.filename).toBe(".yarnrc.yml");
        expect(result.content).toContain("approvedGitRepositories: []");
        expect(result.content).toContain("compressionLevel: mixed");
        expect(result.content).toContain("enableGlobalCache: true");
        expect(result.content).toContain("enableScripts: false");
        expect(result.content).toContain("nodeLinker: node-modules");
        expect(result.content).toContain("npmMinimalAgeGate: 3d");
        expect(result.content).toContain(`"@webiny/*"`);
    });
});
