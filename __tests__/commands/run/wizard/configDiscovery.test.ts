import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { discoverConfigs } from "../../../../src/commands/run/wizard/configDiscovery.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/wizard");

describe("discoverConfigs", () => {
    it("returns labeled configs for each *.config.ts file that imports successfully", async () => {
        const configs = await discoverConfigs(FIXTURES);
        expect(configs.length).toBe(2);
        const labels = configs.map(c => c.label).sort();
        expect(labels).toEqual(["DynamoDB Transfer", "OpenSearch Transfer"]);
    });

    it("returns full resolved paths for each config", async () => {
        const configs = await discoverConfigs(FIXTURES);
        for (const c of configs) {
            expect(c.path).toMatch(/\.config\.ts$/);
        }
    });

    it("returns empty array when directory has no *.config.ts files", async () => {
        const { mkdtemp } = await import("node:fs/promises");
        const { tmpdir } = await import("node:os");
        const tmp = await mkdtemp(join(tmpdir(), "configdiscovery-"));
        try {
            expect(await discoverConfigs(tmp)).toEqual([]);
        } finally {
            const { rm } = await import("node:fs/promises");
            await rm(tmp, { recursive: true });
        }
    });

    it("skips a config file that throws on import (does not crash)", async () => {
        const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
        const { tmpdir } = await import("node:os");
        const tmp = await mkdtemp(join(tmpdir(), "configdiscovery-bad-"));
        await writeFile(join(tmp, "broken.config.ts"), "throw new Error('oops')");
        try {
            const configs = await discoverConfigs(tmp);
            expect(configs).toEqual([]);
        } finally {
            await rm(tmp, { recursive: true });
        }
    });
});
