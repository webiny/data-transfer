import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { extractFromWebinyOutput } from "../../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts";

const FIXTURES = join(import.meta.dirname, "../../../../fixtures/wizard");

describe("extractFromWebinyOutput", () => {
    it("extracts required fields from a valid webiny output file", async () => {
        const result = await extractFromWebinyOutput(join(FIXTURES, "source.webiny.json"));
        expect(result.region).toBe("eu-central-1");
        expect(result.primaryDynamodbTableName).toBe("wby-source-primary");
        expect(result.fileManagerBucketId).toBe("wby-source-bucket");
    });

    it("normalizes elasticsearch prefix to osTableName and osEndpoint", async () => {
        const result = await extractFromWebinyOutput(join(FIXTURES, "source.webiny.json"));
        expect(result.osTableName).toBe("wby-source-es");
        expect(result.osEndpoint).toBe("search-source.eu-central-1.es.amazonaws.com");
    });

    it("normalizes opensearch prefix to osTableName and osEndpoint", async () => {
        const result = await extractFromWebinyOutput(join(FIXTURES, "target.webiny.json"));
        expect(result.osTableName).toBe("wby-target-os");
        expect(result.osEndpoint).toBe("search-target.us-east-1.es.amazonaws.com");
    });

    it("throws a descriptive error when file does not exist", async () => {
        await expect(
            extractFromWebinyOutput(join(FIXTURES, "nonexistent.webiny.json"))
        ).rejects.toThrow(/nonexistent.webiny.json/);
    });

    it("throws when JSON is invalid", async () => {
        const { writeFile, unlink } = await import("node:fs/promises");
        const path = join(FIXTURES, "_bad.webiny.json");
        await writeFile(path, "not json");
        try {
            await expect(extractFromWebinyOutput(path)).rejects.toThrow();
        } finally {
            await unlink(path);
        }
    });

    it("throws a Zod error when required fields are missing", async () => {
        const { writeFile, unlink } = await import("node:fs/promises");
        const path = join(FIXTURES, "_missing.webiny.json");
        await writeFile(path, JSON.stringify({ region: "eu-central-1" }));
        try {
            await expect(extractFromWebinyOutput(path)).rejects.toThrow(/primaryDynamodbTableName/);
        } finally {
            await unlink(path);
        }
    });
});
