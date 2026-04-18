import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export interface FakeContextOverrides {
    modelProvider?: unknown;
    cache?: unknown;
}

export function makeFakeBaseContext<T extends Record<string, unknown>>(
    record: T,
    overrides: FakeContextOverrides = {}
): BaseTransformContext.Interface<T> {
    const commands = new Commands();
    const ctx = {
        record,
        original: { ...record } as Readonly<T>,
        commands,
        modelProvider: overrides.modelProvider as BaseTransformContext.Interface["modelProvider"],
        cache: overrides.cache as BaseTransformContext.Interface["cache"],
        replace(newRecord: unknown): void {
            (ctx as { record: unknown }).record = newRecord;
        },
        putRecord(rec: Record<string, unknown>): void {
            void rec;
        },
        async queryRecord(_pk: string, _sk?: string): Promise<Record<string, unknown> | null> {
            return null;
        },
        async executePipeline(): Promise<Commands> {
            return new Commands();
        }
    };
    return ctx as unknown as BaseTransformContext.Interface<T>;
}
