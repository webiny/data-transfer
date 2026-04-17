import { Container } from "@webiny/di";
import { createAbstraction } from "~/base/index.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
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
        const ctx: FakeContext = {
            record,
            emitted: [],
            commands: new Commands(),
            emit(value: string): void {
                ctx.emitted.push(value);
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

// A distinct Transformer abstraction for tests — isolated from src/domain/transform/Transformer.ts
// so we can register fakes without reaching into production abstractions.
interface IFakeTransformer {
    transform(ctx: FakeContext): void | Promise<void>;
}

export const FakeTransformer = createAbstraction<IFakeTransformer>("Test/FakeTransformer");
export namespace FakeTransformer {
    export type Interface = IFakeTransformer;
}

export class TagTransformer implements IFakeTransformer {
    public tag: string = "TAG";
    public transform(ctx: FakeContext): void {
        ctx.emit(`${this.tag}:${ctx.record.id}`);
    }
}

export const TagTransformerImpl = FakeTransformer.createImplementation({
    implementation: TagTransformer,
    dependencies: []
});

export class UppercaseTransformer implements IFakeTransformer {
    public transform(ctx: FakeContext): void {
        ctx.record.type = ctx.record.type.toUpperCase();
    }
}

export const UppercaseTransformerImpl = FakeTransformer.createImplementation({
    implementation: UppercaseTransformer,
    dependencies: []
});

export function registerFakes(container: Container): void {
    container.register(FakeScannerImpl).inSingletonScope();
    container.register(FakeProcessorImpl).inSingletonScope();
}
