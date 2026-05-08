import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverProjects } from "../../../../src/commands/run/wizard/projectDiscovery.ts";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "proj-discovery-"));
});

afterEach(async () => {
    await rm(root, { recursive: true });
});

describe("discoverProjects", () => {
    it("returns an empty array when projects/ does not exist", async () => {
        expect(await discoverProjects(root)).toEqual([]);
    });

    it("returns an empty array when projects/ has no subdirectories", async () => {
        await mkdir(join(root, "projects"));
        expect(await discoverProjects(root)).toEqual([]);
    });

    it("returns subdirectory names sorted alphabetically", async () => {
        await mkdir(join(root, "projects"));
        await mkdir(join(root, "projects", "prod"));
        await mkdir(join(root, "projects", "staging"));
        await mkdir(join(root, "projects", "dev"));
        expect(await discoverProjects(root)).toEqual(["dev", "prod", "staging"]);
    });

    it("does not include files, only directories", async () => {
        const { writeFile } = await import("node:fs/promises");
        await mkdir(join(root, "projects"));
        await mkdir(join(root, "projects", "prod"));
        await writeFile(join(root, "projects", "readme.md"), "");
        expect(await discoverProjects(root)).toEqual(["prod"]);
    });
});
