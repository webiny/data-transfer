import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { discoverConfig } from "../../../../src/commands/run/wizard/configDiscovery.ts";

describe("discoverConfig", () => {
    it("returns the resolved path to config.ts when it exists", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "configdiscovery-"));
        try {
            const configPath = join(tmp, "config.ts");
            writeFileSync(configPath, "export default {};");
            const result = await discoverConfig(tmp);
            expect(result).toBe(configPath);
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("returns null when config.ts does not exist", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "configdiscovery-empty-"));
        try {
            const result = await discoverConfig(tmp);
            expect(result).toBeNull();
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("returns null for nonexistent directory", async () => {
        const result = await discoverConfig("/nonexistent/path/xyz");
        expect(result).toBeNull();
    });
});
