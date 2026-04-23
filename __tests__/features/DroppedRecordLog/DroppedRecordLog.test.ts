import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { DirectoryToolFeature } from "~/tools/DirectoryTool/index.ts";
import { FileToolFeature } from "~/tools/FileTool/index.ts";
import { DroppedRecordLog, DroppedRecordLogFeature } from "~/features/DroppedRecordLog/index.ts";
import { RecordDisposition } from "~/domain/pipeline/index.ts";

function createContainer(): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(TransferContext, { runId: "test-run-id" });
    LoggerFeature.register(container, { logLevel: "error", json: false });
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);
    DroppedRecordLogFeature.register(container);
    return container;
}

describe("DroppedRecordLog", () => {
    let originalCwd: string;
    let workDir: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "dropped-record-log-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("writes [UNMATCHED] line with modelId when record has top-level modelId", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add(
            { PK: "T#root", SK: "L", TYPE: "cms.entry.l", modelId: "blogPost" },
            new RecordDisposition.Unmatched()
        );
        log.flush(0);

        const content = await readFile(
            join(workDir, ".transfer", "test-run-id", "segment-0-dropped.log"),
            "utf-8"
        );
        expect(content.trim()).toBe("[UNMATCHED] [blogPost] T#root : L : cms.entry.l");
    });

    it("writes [UNMATCHED] line with [TYPE] tag when record has no modelId", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add(
            { PK: "T#root#FLP#1", SK: "A", TYPE: "flp.record" },
            new RecordDisposition.Unmatched()
        );
        log.flush(0);

        const content = await readFile(
            join(workDir, ".transfer", "test-run-id", "segment-0-dropped.log"),
            "utf-8"
        );
        expect(content.trim()).toBe("[UNMATCHED] [flp.record] T#root#FLP#1 : A");
    });

    it("writes [BLACKHOLED] line using data.modelId as fallback", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add(
            {
                PK: "T#root#TASK#1",
                SK: "L",
                TYPE: "webinyTask",
                data: { modelId: "webinyTask" }
            },
            new RecordDisposition.Blackholed("BackgroundTasks")
        );
        log.flush(0);

        const content = await readFile(
            join(workDir, ".transfer", "test-run-id", "segment-0-dropped.log"),
            "utf-8"
        );
        expect(content.trim()).toBe("[BLACKHOLED] [webinyTask] T#root#TASK#1 : L : webinyTask");
    });

    it("writes multiple lines in add order", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add({ PK: "PK1", SK: "SK1", TYPE: "t1" }, new RecordDisposition.Unmatched());
        log.add(
            { PK: "PK2", SK: "SK2", TYPE: "t2" },
            new RecordDisposition.Blackholed("pipe")
        );
        log.flush(1);

        const content = await readFile(
            join(workDir, ".transfer", "test-run-id", "segment-1-dropped.log"),
            "utf-8"
        );
        const lines = content.trim().split("\n");
        expect(lines[0]).toBe("[UNMATCHED] [t1] PK1 : SK1");
        expect(lines[1]).toBe("[BLACKHOLED] [t2] PK2 : SK2");
    });

    it("creates no file when buffer is empty", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.flush(0);

        await expect(
            readFile(
                join(workDir, ".transfer", "test-run-id", "segment-0-dropped.log"),
                "utf-8"
            )
        ).rejects.toThrow(/ENOENT/);
    });

    it("clears buffer after flush — second flush with no new adds is a no-op", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add({ PK: "PK1", SK: "SK1", TYPE: "t1" }, new RecordDisposition.Unmatched());
        log.flush(0);
        log.flush(1);

        await expect(
            readFile(
                join(workDir, ".transfer", "test-run-id", "segment-1-dropped.log"),
                "utf-8"
            )
        ).rejects.toThrow(/ENOENT/);
    });
});
