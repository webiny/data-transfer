import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeEnv } from "../../../../src/commands/transfer/wizard/envWriter.ts";
import type { EnvValues } from "../../../../src/commands/transfer/wizard/types.ts";

const SAMPLE_VALUES: EnvValues = {
    sourceRegion: "eu-central-1",
    sourceDdbTable: "wby-source-primary",
    sourceS3Bucket: "wby-source-bucket",
    sourceAuditLogTable: "",
    sourceOsTable: "wby-source-es",
    sourceAccountId: "111111111111",
    targetRegion: "us-east-1",
    targetDdbTable: "wby-target-primary",
    targetS3Bucket: "wby-target-bucket",
    targetAuditLogTable: "wby-target-audit-logs",
    targetOsTable: "wby-target-os",
    targetOsEndpoint: "search-target.us-east-1.es.amazonaws.com",
    targetOsIndexPrefix: "my-prefix",
    targetAccountId: "222222222222",
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

    it("substitutes values in a plain KEY=value .env.example (no {{tokens}})", async () => {
        const plain = [
            "# Source",
            "SOURCE_REGION=eu-central-1",
            "SOURCE_DDB_TABLE=",
            "SOURCE_S3_BUCKET=old-bucket",
            "# comment preserved",
            "",
            "SEGMENTS=4",
            "CUSTOM_KEY=untouched"
        ].join("\n");
        await writeFile(join(tmpDir, ".env.example"), plain);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
        expect(content).toContain("SOURCE_DDB_TABLE=wby-source-primary");
        expect(content).toContain("SOURCE_S3_BUCKET=wby-source-bucket");
        expect(content).toContain("SEGMENTS=8");
        expect(content).toContain("# comment preserved");
        expect(content).toContain("CUSTOM_KEY=untouched");
        expect(content).not.toContain("old-bucket");
    });

    it("replaces all known keys in plain format", async () => {
        const plain = [
            "SOURCE_REGION=eu-central-1",
            "SOURCE_DDB_TABLE=",
            "SOURCE_S3_BUCKET=",
            "SOURCE_AUDIT_LOGS_TABLE=",
            "SOURCE_OS_TABLE=",
            "SOURCE_ACCOUNT_ID=",
            "TARGET_REGION=eu-central-1",
            "TARGET_DDB_TABLE=",
            "TARGET_S3_BUCKET=",
            "TARGET_AUDIT_LOGS_TABLE=",
            "TARGET_OS_TABLE=",
            "TARGET_OS_ENDPOINT=",
            "TARGET_OS_INDEX_PREFIX=",
            "TARGET_ACCOUNT_ID=",
            "SEGMENTS=4"
        ].join("\n");
        await writeFile(join(tmpDir, ".env.example"), plain);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
        expect(content).toContain("SOURCE_DDB_TABLE=wby-source-primary");
        expect(content).toContain("SOURCE_S3_BUCKET=wby-source-bucket");
        expect(content).toContain("SOURCE_OS_TABLE=wby-source-es");
        expect(content).toContain("SOURCE_ACCOUNT_ID=111111111111");
        expect(content).toContain("TARGET_REGION=us-east-1");
        expect(content).toContain("TARGET_DDB_TABLE=wby-target-primary");
        expect(content).toContain("TARGET_S3_BUCKET=wby-target-bucket");
        expect(content).toContain("TARGET_AUDIT_LOGS_TABLE=wby-target-audit-logs");
        expect(content).toContain("TARGET_OS_TABLE=wby-target-os");
        expect(content).toContain("TARGET_OS_ENDPOINT=search-target.us-east-1.es.amazonaws.com");
        expect(content).toContain("TARGET_OS_INDEX_PREFIX=my-prefix");
        expect(content).toContain("TARGET_ACCOUNT_ID=222222222222");
        expect(content).toContain("SEGMENTS=8");
    });

    it("plain format preserves commented-out lines and blank lines", async () => {
        const plain = [
            "# --- Source ---",
            "SOURCE_REGION=eu-central-1",
            "",
            "# SOURCE_PROFILE=my-source-profile",
            "SOURCE_DDB_TABLE=",
            "# --- Target ---",
            "TARGET_REGION=us-east-1",
            "# TARGET_PROFILE=my-target-profile",
            "TARGET_DDB_TABLE="
        ].join("\n");
        await writeFile(join(tmpDir, ".env.example"), plain);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("# --- Source ---");
        expect(content).toContain("# SOURCE_PROFILE=my-source-profile");
        expect(content).toContain("# --- Target ---");
        expect(content).toContain("# TARGET_PROFILE=my-target-profile");
        expect(content).toContain("\n\n");
    });

    it("plain format writes empty string for empty values", async () => {
        const values: EnvValues = { ...SAMPLE_VALUES, targetOsIndexPrefix: "" };
        const plain = "TARGET_OS_INDEX_PREFIX=old-prefix\n";
        await writeFile(join(tmpDir, ".env.example"), plain);

        await writeEnv(tmpDir, values);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("TARGET_OS_INDEX_PREFIX=\n");
        expect(content).not.toContain("old-prefix");
    });

    it("plain format uncomments commented-out known keys and fills them", async () => {
        const plain = [
            "SOURCE_REGION=eu-central-1",
            "# SOURCE_OS_TABLE=",
            "# TARGET_OS_TABLE=",
            "# TARGET_OS_ENDPOINT="
        ].join("\n");
        await writeFile(join(tmpDir, ".env.example"), plain);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_OS_TABLE=wby-source-es");
        expect(content).toContain("TARGET_OS_TABLE=wby-target-os");
        expect(content).toContain("TARGET_OS_ENDPOINT=search-target.us-east-1.es.amazonaws.com");
        expect(content).not.toContain("# SOURCE_OS_TABLE");
        expect(content).not.toContain("# TARGET_OS_TABLE");
    });

    it("plain format appends missing known keys at the end", async () => {
        const plain = "SOURCE_REGION=eu-central-1\nSEGMENTS=4\n";
        await writeFile(join(tmpDir, ".env.example"), plain);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
        expect(content).toContain("SEGMENTS=8");
        expect(content).toContain("TARGET_OS_ENDPOINT=search-target.us-east-1.es.amazonaws.com");
        expect(content).toContain("SOURCE_ACCOUNT_ID=111111111111");
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
