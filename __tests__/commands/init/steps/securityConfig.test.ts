import { describe, it, expect } from "vitest";
import { generateSecurityConfig } from "~/commands/init/steps/securityConfig.js";

describe("generateSecurityConfig", () => {
    it("generates .yarnrc.yml for yarn", () => {
        const result = generateSecurityConfig("yarn");
        expect(result.filename).toBe(".yarnrc.yml");
        expect(result.content).toContain("enableScripts: false");
        expect(result.content).toContain("npmMinimalAgeGate: 3d");
        expect(result.content).toContain(`"@webiny/*"`);
        expect(result.content).toContain("nodeLinker: node-modules");
    });

    it("generates .npmrc for npm", () => {
        const result = generateSecurityConfig("npm");
        expect(result.filename).toBe(".npmrc");
        expect(result.content).toContain("audit-level=high");
        expect(result.content).toContain("ignore-scripts=true");
    });

    it("generates .npmrc for pnpm", () => {
        const result = generateSecurityConfig("pnpm");
        expect(result.filename).toBe(".npmrc");
        expect(result.content).toContain("audit-level=high");
        expect(result.content).toContain("ignore-scripts=true");
    });
});
