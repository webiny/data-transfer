import { Container } from "@webiny/di";
import { Commands } from "~/domain/transform/commands/Commands.js";
import { PutRecord } from "~/domain/transform/commands/PutRecord.js";
import { Scanner, Processor, Hook } from "~/domain/pipeline/index.js";
import { AccessCheck } from "~/domain/pipeline/abstractions/Processor.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { FakeRecord, FakeShard, FakeSlice, FakeContext } from "./types.ts";

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

/**
 * FakeProcessor — new-shape (Task 5/6/8): implements Processor.Interface with
 * TBase=BaseTransformContext.Interface<FakeRecord> and TSlice=FakeSlice.
 * `extendContext` contributes the slice helpers (`emit`, `putRecord`) onto
 * every transformer context; `onEnd` mirrors the DdbProcessor default of
 * auto-putting ctx.record at shard end; `execute` records every Commands
 * buffer it sees so tests can inspect shard-end flush behavior.
 */
export class FakeProcessor implements Processor.Interface<
    BaseTransformContext.Interface<FakeRecord>,
    FakeSlice
> {
    public executed: Commands[] = [];

    public extendContext(base: BaseTransformContext.Interface<FakeRecord>): FakeSlice {
        const emitted: string[] = [];
        const slice: FakeSlice = {
            emitted,
            emit(value: string): void {
                emitted.push(value);
            },
            putRecord(rec: Record<string, unknown>): void {
                base.addCommand(PutRecord.create({ table: "target-table", record: rec }));
            }
        };
        return slice;
    }

    public onEnd(ctx: BaseTransformContext.Interface<FakeRecord> & FakeSlice): void {
        ctx.putRecord(ctx.record as unknown as Record<string, unknown>);
    }

    public async execute(commands: Commands): Promise<void> {
        // Mark the well-known key we care about so unclaimed-tracking stays honest.
        commands.get(PutRecord.key);
        this.executed.push(commands);
    }

    public async checkAccess(): Promise<AccessCheck.Entry[]> {
        return [];
    }

    public afterShardCalls: Processor.AfterShardContext[] = [];

    public afterShard(ctx: Processor.AfterShardContext): void {
        this.afterShardCalls.push(ctx);
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
