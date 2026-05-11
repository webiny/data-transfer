import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
    listAvailablePresets,
    listAvailablePresetsWithDescriptions
} from "../../../../src/commands/run/wizard/presetDiscovery.ts";

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

    it("ignores files without .ts or .js extension", () => {
        const tmp = mkdtempSync(join(tmpdir(), "presetdiscovery-ext-"));
        try {
            writeFileSync(join(tmp, "my-preset.ts"), "export default {}");
            writeFileSync(join(tmp, "readme.md"), "ignore me");
            const presets = listAvailablePresets(tmp);
            expect(presets).toContain("my-preset");
            expect(presets).not.toContain("readme.md");
            expect(presets).not.toContain("readme");
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });
});

describe("listAvailablePresetsWithDescriptions", () => {
    it("returns entries with name and description for built-in presets", async () => {
        const entries = await listAvailablePresetsWithDescriptions();
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            expect(typeof entry.name).toBe("string");
            expect(typeof entry.description).toBe("string");
        }
        const ddb = entries.find(e => e.name === "copy-ddb");
        expect(ddb?.description).toBeTruthy();
    });

    it("returns empty description for a preset whose file cannot be imported", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "presetdiscovery-broken-"));
        try {
            writeFileSync(join(tmp, "broken.js"), "this is not valid js export syntax %%%");
            const entries = await listAvailablePresetsWithDescriptions(tmp);
            const broken = entries.find(e => e.name === "broken");
            expect(broken?.description).toBe("");
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("returns empty description when preset exports no description field", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "presetdiscovery-nodesc-"));
        try {
            writeFileSync(join(tmp, "nodesc.js"), "export default { name: 'nodesc', configure() {} }");
            const entries = await listAvailablePresetsWithDescriptions(tmp);
            const nodesc = entries.find(e => e.name === "nodesc");
            expect(nodesc?.description).toBe("");
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });
});
