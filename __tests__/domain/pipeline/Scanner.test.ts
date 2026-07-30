import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { Scanner } from "~/domain/pipeline/index.js";

interface TestRecord {
    id: string;
}

interface TestShard {
    from: number;
    to: number;
}

class FakeScanner implements Scanner.Interface<TestRecord, TestShard> {
    public async listShards(): Promise<TestShard[]> {
        return [
            { from: 0, to: 10 },
            { from: 10, to: 20 }
        ];
    }

    public async *scan(shard: TestShard): AsyncIterable<TestRecord> {
        for (let i = shard.from; i < shard.to; i++) {
            yield { id: `record-${i}` };
        }
    }
}

const TestScanner = Scanner.createImplementation({
    implementation: FakeScanner,
    dependencies: []
});

describe("Scanner abstraction", () => {
    it("is registrable and resolvable via the DI container", () => {
        const container = new Container();
        container.register(TestScanner).inSingletonScope();

        const scanner = container.resolve(Scanner);
        expect(scanner).toBeInstanceOf(FakeScanner);
    });

    it("lists shards and yields records for each shard", async () => {
        const container = new Container();
        container.register(TestScanner).inSingletonScope();
        const scanner = container.resolve(Scanner) as Scanner.Interface<TestRecord, TestShard>;

        const shards = await scanner.listShards();
        expect(shards).toHaveLength(2);

        const collected: TestRecord[] = [];
        for await (const record of scanner.scan(shards[0]!)) {
            collected.push(record);
        }
        expect(collected).toHaveLength(10);
        expect(collected[0]).toEqual({ id: "record-0" });
    });
});
