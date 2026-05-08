import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { extractFromPulumiState } from "../../../../../src/commands/run/wizard/sources/PulumiStateSource.ts";

const FIXTURES = join(import.meta.dirname, "../../../../fixtures/wizard");

describe("extractFromPulumiState", () => {
    it("extracts required fields from a valid Pulumi state file", async () => {
        const result = await extractFromPulumiState(join(FIXTURES, "source.pulumi.json"));
        expect(result.region).toBe("eu-central-1");
        expect(result.primaryDynamodbTableName).toBe("wby-source-primary");
        expect(result.fileManagerBucketId).toBe("wby-source-bucket");
    });

    it("normalizes elasticsearch prefix from pulumi state outputs", async () => {
        const result = await extractFromPulumiState(join(FIXTURES, "source.pulumi.json"));
        expect(result.osTableName).toBe("wby-source-es");
        expect(result.osEndpoint).toBe("search-source.eu-central-1.es.amazonaws.com");
    });

    it("normalizes opensearch prefix from pulumi state outputs", async () => {
        const result = await extractFromPulumiState(join(FIXTURES, "target.pulumi.json"));
        expect(result.osTableName).toBe("wby-target-os");
        expect(result.osEndpoint).toBe("search-target.us-east-1.es.amazonaws.com");
    });

    it("throws when file does not exist", async () => {
        await expect(
            extractFromPulumiState(join(FIXTURES, "nonexistent.pulumi.json"))
        ).rejects.toThrow(/nonexistent.pulumi.json/);
    });

    it("throws when the state file has wrong version", async () => {
        const { writeFile, unlink } = await import("node:fs/promises");
        const path = join(FIXTURES, "_bad.pulumi.json");
        await writeFile(path, JSON.stringify({ version: 2, checkpoint: {} }));
        try {
            await expect(extractFromPulumiState(path)).rejects.toThrow(/version/);
        } finally {
            await unlink(path);
        }
    });

    it("throws when no Stack resource is found", async () => {
        const { writeFile, unlink } = await import("node:fs/promises");
        const path = join(FIXTURES, "_nostack.pulumi.json");
        const state = {
            version: 3,
            checkpoint: {
                latest: {
                    resources: [{ type: "aws:s3:Bucket", outputs: {} }]
                }
            }
        };
        await writeFile(path, JSON.stringify(state));
        try {
            await expect(extractFromPulumiState(path)).rejects.toThrow(/pulumi:pulumi:Stack/);
        } finally {
            await unlink(path);
        }
    });
});
