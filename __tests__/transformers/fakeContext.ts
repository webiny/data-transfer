import { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { DdbCoreTransformContext } from "~/features/TransformContext/abstractions/contextAliases.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

export interface FakeContextOverrides {
    modelProvider?: unknown;
    cache?: unknown;
}

/**
 * Build a minimal BaseTransformContext stub for transformer unit tests.
 *
 * Transformer entry points (e.g. `createTransformer<BaseTransformContext.Interface<BaseRecord>>`)
 * accept a context generic of BaseRecord. We widen the caller's narrow test
 * record into BaseRecord at the seam here so tests can write plain literal
 * records without spelling out _et/_ct/_md metadata.
 */
export function makeFakeBaseContext<T extends Record<string, unknown>>(
    record: T,
    overrides: FakeContextOverrides = {}
): BaseTransformContext.Interface<BaseRecord> {
    const commands = new Commands();
    const ctx = {
        record,
        original: Object.freeze(structuredClone(record)) as Readonly<T>,
        commands,
        modelProvider: overrides.modelProvider as BaseTransformContext.Interface["modelProvider"],
        cache: overrides.cache as BaseTransformContext.Interface["cache"],
        replace(newRecord: unknown): void {
            (ctx as { record: unknown }).record = newRecord;
        },
        addCommand(cmd: unknown): void {
            commands.add(cmd as Parameters<Commands["add"]>[0]);
        }
    };
    return ctx as unknown as BaseTransformContext.Interface<BaseRecord>;
}

/**
 * Build a minimal DDB-mode ctx stub (Base + DdbProcessor slice) for unit
 * tests of transformers that call putRecord / querySourceRecord /
 * queryTargetRecord. Slice methods default to no-ops — override per test
 * by assigning onto the returned object.
 */
export function makeFakeDdbCoreContext<T extends Record<string, unknown>>(
    record: T,
    overrides: FakeContextOverrides = {}
): DdbCoreTransformContext.Interface<BaseRecord> {
    const base = makeFakeBaseContext(record, overrides);
    const ctx = Object.assign(base, {
        putRecord(_record: Record<string, unknown>): void {},
        async querySourceRecord(
            _pk: string,
            _sk?: string
        ): Promise<Record<string, unknown> | null> {
            return null;
        },
        async queryTargetRecord(
            _pk: string,
            _sk?: string
        ): Promise<Record<string, unknown> | null> {
            return null;
        }
    });
    return ctx as unknown as DdbCoreTransformContext.Interface<BaseRecord>;
}
