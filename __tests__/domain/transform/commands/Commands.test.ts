import { describe, it, expect } from "vitest";
import { Commands } from "../../../../src/domain/transform/commands/Commands.ts";
import { PutRecord } from "../../../../src/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "../../../../src/domain/transform/commands/S3Copy.ts";
import type { Command } from "../../../../src/domain/transform/commands/Command.ts";

describe("Commands", () => {
    describe("add / get", () => {
        it("should bucket commands by key", () => {
            const commands = new Commands();
            commands.add(PutRecord.create({ table: "t", record: { PK: "a", SK: "b" } }));
            commands.add(
                S3Copy.create({
                    sourceBucket: "src",
                    sourceKey: "k1",
                    targetBucket: "tgt",
                    targetKey: "k2"
                })
            );

            expect(commands.get(PutRecord.key)).toHaveLength(1);
            expect(commands.get(S3Copy.key)).toHaveLength(1);
        });

        it("should return empty array for unknown key", () => {
            const commands = new Commands();
            expect(commands.get("UNKNOWN")).toEqual([]);
        });

        it("should preserve insertion order within a bucket", () => {
            const commands = new Commands();
            commands.add(PutRecord.create({ table: "t", record: { id: 1 } }));
            commands.add(PutRecord.create({ table: "t", record: { id: 2 } }));
            commands.add(PutRecord.create({ table: "t", record: { id: 3 } }));

            const puts = commands.get<PutRecord>(PutRecord.key);
            expect(puts.map(p => p.record.id)).toEqual([1, 2, 3]);
        });
    });

    describe("dedup", () => {
        it("should skip commands with same key + dedupKey", () => {
            class IdxEnsure implements Command {
                public static readonly key = "IDX_ENSURE";
                public readonly key = IdxEnsure.key;
                public constructor(public readonly dedupKey: string) {}
            }

            const commands = new Commands();
            commands.add(new IdxEnsure("idx-a"));
            commands.add(new IdxEnsure("idx-a"));
            commands.add(new IdxEnsure("idx-b"));
            commands.add(new IdxEnsure("idx-a"));

            expect(commands.get("IDX_ENSURE")).toHaveLength(2);
        });

        it("should not dedupe commands without dedupKey", () => {
            const commands = new Commands();
            commands.add(PutRecord.create({ table: "t", record: { id: 1 } }));
            commands.add(PutRecord.create({ table: "t", record: { id: 1 } }));
            expect(commands.get(PutRecord.key)).toHaveLength(2);
        });
    });

    describe("all", () => {
        it("should return all commands flattened", () => {
            const commands = new Commands();
            commands.add(PutRecord.create({ table: "t", record: {} }));
            commands.add(
                S3Copy.create({
                    sourceBucket: "src",
                    sourceKey: "k1",
                    targetBucket: "tgt",
                    targetKey: "k2"
                })
            );

            expect(commands.all()).toHaveLength(2);
        });

        it("should return empty array when no commands", () => {
            const commands = new Commands();
            expect(commands.all()).toEqual([]);
        });
    });

    describe("size", () => {
        it("should count commands across all buckets", () => {
            const commands = new Commands();
            commands.add(PutRecord.create({ table: "t", record: { id: 1 } }));
            commands.add(PutRecord.create({ table: "t", record: { id: 2 } }));
            commands.add(
                S3Copy.create({
                    sourceBucket: "src",
                    sourceKey: "k",
                    targetBucket: "tgt",
                    targetKey: "k"
                })
            );

            expect(commands.size()).toBe(3);
        });
    });

    describe("keys", () => {
        it("should list bucket keys", () => {
            const commands = new Commands();
            commands.add(PutRecord.create({ table: "t", record: {} }));
            commands.add(
                S3Copy.create({
                    sourceBucket: "src",
                    sourceKey: "k",
                    targetBucket: "tgt",
                    targetKey: "k"
                })
            );

            expect(commands.keys().sort()).toEqual([PutRecord.key, S3Copy.key].sort());
        });
    });

    describe("unclaimedKeys", () => {
        it("returns empty when all keys with commands have been .get()'d", () => {
            const cmds = new Commands();
            cmds.add(PutRecord.create({ table: "t", record: { PK: "1", SK: "1" } }));
            cmds.add(
                S3Copy.create({
                    sourceBucket: "s",
                    sourceKey: "k",
                    targetBucket: "tb",
                    targetKey: "tk"
                })
            );
            cmds.get<PutRecord>(PutRecord.key);
            cmds.get<S3Copy>(S3Copy.key);
            expect(cmds.unclaimedKeys()).toEqual([]);
        });

        it("returns keys with commands that nothing claimed via .get()", () => {
            const cmds = new Commands();
            cmds.add(PutRecord.create({ table: "t", record: { PK: "1", SK: "1" } }));
            cmds.add(
                S3Copy.create({
                    sourceBucket: "s",
                    sourceKey: "k",
                    targetBucket: "tb",
                    targetKey: "tk"
                })
            );
            cmds.get<PutRecord>(PutRecord.key); // only PutRecord drained
            expect(cmds.unclaimedKeys()).toEqual([S3Copy.key]);
        });

        it("does NOT report keys with empty buckets even if not claimed", () => {
            const cmds = new Commands();
            // No commands added — nothing pending.
            expect(cmds.unclaimedKeys()).toEqual([]);
        });

        it("treats a .get() of a key with zero commands as a claim — no false warning", () => {
            const cmds = new Commands();
            cmds.add(PutRecord.create({ table: "t", record: { PK: "1", SK: "1" } }));
            cmds.get<S3Copy>(S3Copy.key); // claimed but no S3 commands ever added
            cmds.get<PutRecord>(PutRecord.key);
            expect(cmds.unclaimedKeys()).toEqual([]);
        });
    });
});
