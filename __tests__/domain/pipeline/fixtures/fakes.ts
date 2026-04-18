import { Container } from "@webiny/di";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { Scanner, Processor, Hook } from "~/domain/pipeline/index.ts";
import type { FakeRecord, FakeShard, FakeContext } from "./types.ts";

export class FakeScanner implements Scanner.Interface<FakeRecord, FakeShard> {
    public records: FakeRecord[] = [];

    public async listShards(): Promise<FakeShard[]> {
        return [{ from: 0, to: this.records.length }];
    }

    public async *scan(shard: FakeShard): AsyncIterable<FakeRecord> {
        for (let i = shard.from; i < shard.to; i++) {
            yield this.records[i]!;
        }
    }
}

export const FakeScannerImpl = Scanner.createImplementation({
    implementation: FakeScanner,
    dependencies: []
});

export class FakeProcessor implements Processor.Interface<FakeRecord, FakeContext> {
    public executed: Commands[] = [];

    public async execute(commands: Commands): Promise<void> {
        this.executed.push(commands);
    }

    public getShardState(): { count: number } {
        return { count: this.executed.length };
    }

    public createContext(record: FakeRecord): FakeContext {
        const commands = new Commands();
        const ctx: FakeContext = {
            record,
            emitted: [],
            commands,
            emit(value: string): void {
                ctx.emitted.push(value);
            },
            putRecord(rec: Record<string, unknown>): void {
                // Mirror real DdbTransformContextFactory semantics: emit a PutRecord
                // into the context's commands buffer. Keeps the fake honest so the
                // runner's auto-put is observable in unit tests.
                commands.add(PutRecord.create({ table: "target-table", record: rec }));
            }
        };
        return ctx;
    }
}

export const FakeProcessorImpl = Processor.createImplementation({
    implementation: FakeProcessor,
    dependencies: []
});

export class FakeHookA implements Hook.Interface {
    public calls: Array<{ runId: string; mergeGroupId: string }> = [];
    public async run(params: { runId: string; mergeGroupId: string }): Promise<void> {
        this.calls.push(params);
    }
}

export const FakeHookAImpl = Hook.createImplementation({
    implementation: FakeHookA,
    dependencies: []
});

export class FakeHookB implements Hook.Interface {
    public calls: Array<{ runId: string; mergeGroupId: string }> = [];
    public async run(params: { runId: string; mergeGroupId: string }): Promise<void> {
        this.calls.push(params);
    }
}

export const FakeHookBImpl = Hook.createImplementation({
    implementation: FakeHookB,
    dependencies: []
});

// Plain function transformers — no DI, no abstractions. The pipeline
// builder takes functions directly via `.use(fn)`.

export const tagTransformer = (ctx: FakeContext): void => {
    ctx.emit(`TAG:${ctx.record.id}`);
};

export const uppercaseTransformer = (ctx: FakeContext): void => {
    ctx.record.type = ctx.record.type.toUpperCase();
};

export function registerFakes(container: Container): void {
    container.register(FakeScannerImpl).inSingletonScope();
    container.register(FakeProcessorImpl).inSingletonScope();
}
