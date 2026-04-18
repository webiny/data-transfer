import type { Commands } from "~/domain/transform/commands/Commands.ts";

export interface FakeRecord {
    id: string;
    type: string;
    payload?: Record<string, unknown>;
}

export interface FakeShard {
    from: number;
    to: number;
}

export interface FakeContext {
    record: FakeRecord;
    emitted: string[];
    emit(value: string): void;
    commands: Commands;
    putRecord(record: Record<string, unknown>): void;
}
