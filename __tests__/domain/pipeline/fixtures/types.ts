import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

export interface FakeRecord {
    id: string;
    type: string;
    payload?: Record<string, unknown>;
}

export interface FakeShard {
    from: number;
    to: number;
}

/**
 * Slice contributed by FakeProcessor.extendContext. Keeps the test shape
 * close to real processors (DdbProcessor contributes `putRecord`, etc.)
 * while adding `emit` + `emitted` so transformer-function tests can
 * observe each call without reaching into Commands.
 */
export interface FakeSlice {
    emitted: string[];
    emit(value: string): void;
    putRecord(record: Record<string, unknown>): void;
}

/**
 * Effective context seen by transformer functions in Fake-backed test
 * pipelines: the base ctx merged with FakeSlice.
 */
export type FakeContext = BaseTransformContext.Interface<FakeRecord> & FakeSlice;
