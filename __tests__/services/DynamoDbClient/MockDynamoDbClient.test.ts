import { describe, it, expect } from "vitest";
import { MockDynamoDbClient } from "./MockDynamoDbClient.ts";

describe("MockDynamoDbClient", () => {
    const rows = [
        { PK: "a", SK: "L", _md: "1", data: { live: null } },
        { PK: "a", SK: "P", _md: "1", data: {} },
        { PK: "b", SK: "L", _md: "2", data: {} }
    ];

    it("scan honours sortKeyEquals and limit", async () => {
        const client = new MockDynamoDbClient({ t: rows });
        const seen = [];
        for await (const row of client.scan("t", { sortKeyEquals: "L", limit: 1 })) {
            seen.push(row);
        }
        expect(seen).toEqual([rows[0]]);
    });

    it("updateAttribute writes a nested path when the condition holds", async () => {
        const client = new MockDynamoDbClient({ t: structuredClone(rows) });
        const result = await client.updateAttribute("t", {
            key: { PK: "a", SK: "L" },
            path: ["data", "live"],
            value: { version: 2 },
            condition: { attribute: "_md", equals: "1" }
        });
        expect(result).toBe("written");
        expect((client.getRecordsForTable("t")[0]!.data as Record<string, unknown>).live).toEqual({
            version: 2
        });
    });

    it("updateAttribute returns condition-failed and leaves the record untouched", async () => {
        const client = new MockDynamoDbClient({ t: structuredClone(rows) });
        const result = await client.updateAttribute("t", {
            key: { PK: "a", SK: "L" },
            path: ["data", "live"],
            value: { version: 2 },
            condition: { attribute: "_md", equals: "stale" }
        });
        expect(result).toBe("condition-failed");
        expect(
            (client.getRecordsForTable("t")[0]!.data as Record<string, unknown>).live
        ).toBeNull();
        expect(client.updateCalls).toHaveLength(1);
    });
});
