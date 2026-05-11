import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeEnv } from "../../../../src/commands/run/wizard/envWriter.ts";
import type { EnvValues } from "../../../../src/commands/run/wizard/types.ts";

const SAMPLE_VALUES: EnvValues = {
    sourceRegion: "eu-central-1",
    sourceDdbTable: "wby-source-primary",
    sourceS3Bucket: "wby-source-bucket",
    sourceAuditLogTable: "",
    sourceOsTable: "wby-source-es",
    targetRegion: "us-east-1",
    targetDdbTable: "wby-target-primary",
    targetS3Bucket: "wby-target-bucket",
    targetAuditLogTable: "wby-target-audit-logs",
    targetOsTable: "wby-target-os",
    targetOsEndpoint: "search-target.us-east-1.es.amazonaws.com",
    targetOsIndexPrefix: "my-prefix",
    segments: 8
};

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "envwriter-test-"));
});

afterEach(async () => {
    await rm(tmpDir, { recursive: true });
});

describe("writeEnv", () => {
    it("writes .env with substituted token values from .env.example template", async () => {
        const template = "SOURCE_REGION={{SOURCE_REGION}}\nSEGMENTS={{SEGMENTS}}\n";
        await writeFile(join(tmpDir, ".env.example"), template);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
        expect(content).toContain("SEGMENTS=8");
    });

    it("replaces all known tokens", async () => {
        const template = [
            "SOURCE_REGION={{SOURCE_REGION}}",
            "SOURCE_DDB_TABLE={{SOURCE_DDB_TABLE}}",
            "SOURCE_S3_BUCKET={{SOURCE_S3_BUCKET}}",
            "SOURCE_AUDIT_LOGS_TABLE={{SOURCE_AUDIT_LOGS_TABLE}}",
            "SOURCE_OS_TABLE={{SOURCE_OS_TABLE}}",
            "TARGET_REGION={{TARGET_REGION}}",
            "TARGET_DDB_TABLE={{TARGET_DDB_TABLE}}",
            "TARGET_S3_BUCKET={{TARGET_S3_BUCKET}}",
            "TARGET_AUDIT_LOGS_TABLE={{TARGET_AUDIT_LOGS_TABLE}}",
            "TARGET_OS_TABLE={{TARGET_OS_TABLE}}",
            "TARGET_OS_ENDPOINT={{TARGET_OS_ENDPOINT}}",
            "TARGET_OS_INDEX_PREFIX={{TARGET_OS_INDEX_PREFIX}}",
            "SEGMENTS={{SEGMENTS}}"
        ].join("\n");
        await writeFile(join(tmpDir, ".env.example"), template);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
        expect(content).toContain("SOURCE_DDB_TABLE=wby-source-primary");
        expect(content).toContain("SOURCE_S3_BUCKET=wby-source-bucket");
        expect(content).toContain("SOURCE_OS_TABLE=wby-source-es");
        expect(content).toContain("TARGET_REGION=us-east-1");
        expect(content).toContain("TARGET_DDB_TABLE=wby-target-primary");
        expect(content).toContain("TARGET_S3_BUCKET=wby-target-bucket");
        expect(content).toContain("TARGET_AUDIT_LOGS_TABLE=wby-target-audit-logs");
        expect(content).toContain("TARGET_OS_TABLE=wby-target-os");
        expect(content).toContain("TARGET_OS_ENDPOINT=search-target.us-east-1.es.amazonaws.com");
        expect(content).toContain("TARGET_OS_INDEX_PREFIX=my-prefix");
        expect(content).toContain("SEGMENTS=8");
    });

    it("throws when .env.example exists but has no {{tokens}}", async () => {
        await writeFile(join(tmpDir, ".env.example"), "# no tokens here\n");

        await expect(writeEnv(tmpDir, SAMPLE_VALUES)).rejects.toThrow(/{{TOKEN}}/);
    });

    it("uses built-in template when .env.example is absent", async () => {
        await writeEnv(tmpDir, SAMPLE_VALUES);
        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
    });

    it("preserves comment lines untouched", async () => {
        const template = "# a comment\nSOURCE_REGION={{SOURCE_REGION}}\n";
        await writeFile(join(tmpDir, ".env.example"), template);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("# a comment");
    });

    it("replaces empty-string values producing KEY= lines", async () => {
        const values: EnvValues = { ...SAMPLE_VALUES, targetOsIndexPrefix: "" };
        const template = "TARGET_OS_INDEX_PREFIX={{TARGET_OS_INDEX_PREFIX}}\n";
        await writeFile(join(tmpDir, ".env.example"), template);

        await writeEnv(tmpDir, values);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("TARGET_OS_INDEX_PREFIX=");
    });
});
