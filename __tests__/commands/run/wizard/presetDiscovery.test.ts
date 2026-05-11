import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { listAvailablePresets } from "../../../../src/commands/run/wizard/presetDiscovery.ts";

describe("listAvailablePresets", () => {
    it("returns built-in preset names (at minimum v5-to-v6-ddb and v5-to-v6-os)", () => {
        const presets = listAvailablePresets();
        expect(presets).toContain("v5-to-v6-ddb");
        expect(presets).toContain("v5-to-v6-os");
    });

    it("includes user presets from presetsDir when provided", () => {
        const tmp = mkdtempSync(join(tmpdir(), "presetdiscovery-"));
        try {
            writeFileSync(join(tmp, "my-preset.ts"), "export default {}");
            writeFileSync(join(tmp, "another.ts"), "export default {}");
            const presets = listAvailablePresets(tmp);
            expect(presets).toContain("my-preset");
            expect(presets).toContain("another");
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("deduplicates when user preset name matches a built-in", () => {
        const tmp = mkdtempSync(join(tmpdir(), "presetdiscovery-dup-"));
        try {
            writeFileSync(join(tmp, "v5-to-v6-ddb.ts"), "export default {}");
            const presets = listAvailablePresets(tmp);
            const count = presets.filter(p => p === "v5-to-v6-ddb").length;
            expect(count).toBe(1);
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("returns empty list when presetsDir does not exist", () => {
        const presets = listAvailablePresets("/nonexistent/path/xyz");
        expect(Array.isArray(presets)).toBe(true);
    });

    it("returns sorted list", () => {
        const presets = listAvailablePresets();
        const sorted = [...presets].sort();
        expect(presets).toEqual(sorted);
    });
});
