import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { DirectoryToolFeature } from "~/tools/DirectoryTool/index.ts";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { SnapshotWriter, SnapshotWriterFeature } from "~/features/SnapshotWriter/index.ts";

interface Entry {
    level: string;
    message: string;
}

class CapturingLogger implements Logger.Interface {
    public readonly entries: Entry[] = [];
    public debug(msg: string): void {
        this.entries.push({ level: "debug", message: msg });
    }
    public info(msg: string): void {
        this.entries.push({ level: "info", message: msg });
    }
    public warn(msg: string): void {
        this.entries.push({ level: "warn", message: msg });
    }
    public error(msg: string): void {
        this.entries.push({ level: "error", message: msg });
    }
    public fatal(msg: string): void {
        this.entries.push({ level: "fatal", message: msg });
    }
    public done(msg: string): void {
        this.entries.push({ level: "done", message: msg });
    }
    public child(): Logger.Interface {
        return this;
    }
}

interface SnapshotSettings {
    dir?: string;
    compress?: boolean;
}

interface BuildOptions {
    snapshot?: boolean | SnapshotSettings;
}

function buildContainer(options: BuildOptions = {}): {
    container: Container;
    logger: CapturingLogger;
} {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    const logger = new CapturingLogger();
    container.registerInstance(Logger, logger);
    const config: MigrationConfig.Interface = {
        storage: "ddb",
        source: {
            region: "us-east-1",
            credentials: { accessKeyId: "x", secretAccessKey: "y" },
            dynamodb: { tableName: "s-t" },
            s3: { bucket: "s-b" }
        },
        target: {
            region: "eu-central-1",
            credentials: { accessKeyId: "x", secretAccessKey: "y" },
            dynamodb: { tableName: "t-t" },
            s3: { bucket: "t-b" },
            auditLog: null
        },
        pipeline: { preset: "noop" },
        debug: options.snapshot !== undefined ? { snapshot: options.snapshot } : undefined
    };
    container.registerInstance(MigrationConfig, config);
    container.registerInstance(TransferContext, { runId: "test-run" });
    DirectoryToolFeature.register(container);
    LoggerFeature.register(container, { logLevel: "error", json: false });
    // Re-register the capturing logger AFTER the feature, overriding the pino one.
    container.registerInstance(Logger, logger);
    SnapshotWriterFeature.register(container);
    return { container, logger };
}

describe("SnapshotWriter — disabled", () => {
    let workDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "snapshot-disabled-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("write + close are no-ops when config.debug.snapshot is missing", async () => {
        const { container } = buildContainer();
        const writer = container.resolve(SnapshotWriter);

        await writer.write("any/path.jsonl", { PK: "x" });
        await writer.close();

        const contents = await readdir(workDir);
        expect(contents).toEqual([]);
    });

    it("no-op when snapshot is explicitly false", async () => {
        const { container } = buildContainer({ snapshot: false });
        const writer = container.resolve(SnapshotWriter);

        await writer.write("any/path.jsonl", { PK: "x" });
        await writer.close();

        const contents = await readdir(workDir);
        expect(contents).toEqual([]);
    });
});

describe("SnapshotWriter — enabled, uncompressed", () => {
    let workDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "snapshot-uncompressed-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("writes JSONL lines to the expected path", async () => {
        const { container } = buildContainer({
            snapshot: { dir: ".snap", compress: false }
        });
        const writer = container.resolve(SnapshotWriter);

        await writer.write("foo/segment-0.source.jsonl", { PK: "a", SK: "L" });
        await writer.write("foo/segment-0.source.jsonl", { PK: "b", SK: "L" });
        await writer.close();

        const content = await readFile(join(workDir, ".snap/foo/segment-0.source.jsonl"), "utf-8");
        expect(content).toBe('{"PK":"a","SK":"L"}\n{"PK":"b","SK":"L"}\n');
    });

    it("defaults the base dir to .transfer/<runId>/snapshot when dir is unset", async () => {
        const { container } = buildContainer({ snapshot: { compress: false } });
        const writer = container.resolve(SnapshotWriter);

        await writer.write("seg.jsonl", { id: 1 });
        await writer.close();

        const content = await readFile(
            join(workDir, ".transfer/test-run/snapshot/seg.jsonl"),
            "utf-8"
        );
        expect(content).toBe('{"id":1}\n');
    });

    it("writes to distinct files when given distinct relativePaths", async () => {
        const { container } = buildContainer({
            snapshot: { dir: ".snap", compress: false }
        });
        const writer = container.resolve(SnapshotWriter);

        await writer.write("a/seg.jsonl", { id: 1 });
        await writer.write("b/seg.jsonl", { id: 2 });
        await writer.close();

        const a = await readFile(join(workDir, ".snap/a/seg.jsonl"), "utf-8");
        const b = await readFile(join(workDir, ".snap/b/seg.jsonl"), "utf-8");
        expect(a).toBe('{"id":1}\n');
        expect(b).toBe('{"id":2}\n');
    });
});

describe("SnapshotWriter — enabled, gzipped", () => {
    let workDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "snapshot-gzipped-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("appends .gz and writes gzipped content that round-trips via gunzip", async () => {
        const { container } = buildContainer({ snapshot: { dir: ".snap" } }); // compress defaults to true
        const writer = container.resolve(SnapshotWriter);

        await writer.write("seg.jsonl", { PK: "a" });
        await writer.write("seg.jsonl", { PK: "b" });
        await writer.close();

        const raw = await readFile(join(workDir, ".snap/seg.jsonl.gz"));
        const decoded = gunzipSync(raw).toString("utf-8");
        expect(decoded).toBe('{"PK":"a"}\n{"PK":"b"}\n');
    });

    it("defaults compress to true when not specified", async () => {
        const { container } = buildContainer({ snapshot: true });
        const writer = container.resolve(SnapshotWriter);

        await writer.write("seg.jsonl", { x: 1 });
        await writer.close();

        const raw = await readFile(join(workDir, ".transfer/test-run/snapshot/seg.jsonl.gz"));
        const decoded = gunzipSync(raw).toString("utf-8");
        expect(decoded).toBe('{"x":1}\n');
    });
});

describe("SnapshotWriter — logging", () => {
    let workDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "snapshot-logging-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("logs an info line on first activation", async () => {
        const { container, logger } = buildContainer({
            snapshot: { dir: ".snap", compress: false }
        });
        // Resolving the writer triggers the constructor that logs.
        container.resolve(SnapshotWriter);

        const infoLines = logger.entries.filter(e => e.level === "info");
        expect(infoLines.some(l => /Snapshot enabled/i.test(l.message))).toBe(true);
    });

    it("does NOT log the enabled message when disabled", async () => {
        const { container, logger } = buildContainer();
        container.resolve(SnapshotWriter);
        expect(logger.entries.some(l => /Snapshot enabled/i.test(l.message))).toBe(false);
    });
});
