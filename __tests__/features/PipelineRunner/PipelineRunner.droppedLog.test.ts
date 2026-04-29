import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { createFilter, RecordDisposition } from "~/domain/pipeline/index.ts";
import { DroppedRecordLog } from "~/features/DroppedRecordLog/index.ts";
import { MockDroppedRecordLog } from "../DroppedRecordLog/MockDroppedRecordLog.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";

function makeRecord(pk: string, sk: string, type: string, modelId?: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type,
        ...(modelId ? { modelId } : {})
    } as unknown as BaseRecord;
}

describe("PipelineRunner — DroppedRecordLog integration", () => {
    it("logs unmatched records as Unmatched disposition", async () => {
        const records = [
            makeRecord("T#root", "L", "cms.entry.l"),
            makeRecord("T#root", "A", "unknown.type")
        ];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        const builder = factory.create({
            name: "cms",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(r => r.TYPE === "cms.entry.l"));
        runner.register(builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const log = container.resolve(DroppedRecordLog) as MockDroppedRecordLog;
        expect(log.entries).toHaveLength(1);
        expect(log.entries[0]?.disposition).toBeInstanceOf(RecordDisposition.Unmatched);
        expect((log.entries[0]?.record as BaseRecord).TYPE).toBe("unknown.type");
        expect(log.flushedSegments).toContain(0);
    });

    it("logs blackholed records as Blackholed disposition with pipeline name", async () => {
        const records = [makeRecord("T#root", "L", "task.record")];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        const builder = factory.create({
            name: "task-blackhole",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(r => r.TYPE === "task.record"));
        builder.blackhole();
        runner.register(builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const log = container.resolve(DroppedRecordLog) as MockDroppedRecordLog;
        expect(log.entries).toHaveLength(1);
        const disposition = log.entries[0]?.disposition;
        expect(disposition).toBeInstanceOf(RecordDisposition.Blackholed);
        expect((disposition as RecordDisposition.Blackholed).pipelineName).toBe("task-blackhole");
        expect(log.flushedSegments).toContain(0);
    });

    it("flush is called even when no records were dropped", async () => {
        const records = [makeRecord("T#root", "L", "cms.entry.l")];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        const builder = factory.create({
            name: "cms",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(() => true));
        runner.register(builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const log = container.resolve(DroppedRecordLog) as MockDroppedRecordLog;
        expect(log.entries).toHaveLength(0);
        expect(log.flushedSegments).toContain(0);
    });
});
