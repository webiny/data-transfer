import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverPresets } from "~/commands/init/steps/discoverPresets.ts";

describe("discoverPresets", () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "presets-"));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("returns directories containing config.ts", () => {
        mkdirSync(join(dir, "v5-to-v6"));
        writeFileSync(join(dir, "v5-to-v6", "config.ts"), "");
        mkdirSync(join(dir, "blank"));
        writeFileSync(join(dir, "blank", "config.ts"), "");

        expect(discoverPresets(dir)).toEqual(["blank", "v5-to-v6"]);
    });

    it("ignores directories without config.ts", () => {
        mkdirSync(join(dir, "has-config"));
        writeFileSync(join(dir, "has-config", "config.ts"), "");
        mkdirSync(join(dir, "no-config"));
        writeFileSync(join(dir, "no-config", "readme.md"), "");

        expect(discoverPresets(dir)).toEqual(["has-config"]);
    });

    it("ignores files at root level", () => {
        writeFileSync(join(dir, "stray-file.ts"), "");
        mkdirSync(join(dir, "valid"));
        writeFileSync(join(dir, "valid", "config.ts"), "");

        expect(discoverPresets(dir)).toEqual(["valid"]);
    });

    it("returns empty array for empty directory", () => {
        expect(discoverPresets(dir)).toEqual([]);
    });
});
