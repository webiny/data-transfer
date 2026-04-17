import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { Scanner } from "~/domain/pipeline/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import type { DdbShard } from "~/features/DdbScanner/abstractions/DdbScanner.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

function makeRecord(pk: string, sk: string, type: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type
    };
}

describe("DdbScanner", () => {
    it("is registrable and resolvable through the Scanner abstraction", () => {
        const container = createDdbContainer();
        const scanner = container.resolve(Scanner);
        expect(scanner).toBeDefined();
        expect(typeof scanner.listShards).toBe("function");
        expect(typeof scanner.scan).toBe("function");
    });

    it("returns a single shard when pipeline.segments is unset", async () => {
        const container = createDdbContainer();
        const scanner = container.resolve(Scanner) as Scanner.Interface<BaseRecord, DdbShard>;
        const shards = await scanner.listShards();
        expect(shards).toEqual([{ segment: 0, total: 1 }]);
    });

    it("returns N shards when pipeline.segments is set", async () => {
        const container = createDdbContainer({
            pipelineOverride: { segments: 4 }
        });
        const scanner = container.resolve(Scanner) as Scanner.Interface<BaseRecord, DdbShard>;
        const shards = await scanner.listShards();
        expect(shards).toEqual([
            { segment: 0, total: 4 },
            { segment: 1, total: 4 },
            { segment: 2, total: 4 },
            { segment: 3, total: 4 }
        ]);
    });

    it("scans the source table for records of a single shard", async () => {
        const records = [makeRecord("a", "1", "test"), makeRecord("b", "1", "test")];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const scanner = container.resolve(Scanner) as Scanner.Interface<BaseRecord, DdbShard>;

        const collected: BaseRecord[] = [];
        for await (const record of scanner.scan({ segment: 0, total: 1 })) {
            collected.push(record);
        }
        expect(collected).toHaveLength(2);
        expect(collected[0]?.PK).toBe("a");
    });
});
