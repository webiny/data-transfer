import { describe, it, expect, vi, beforeEach } from "vitest";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { AuditLogProcessor } from "~/features/AuditLogProcessor/AuditLogProcessor.ts";
import { AuditLogPutRecord } from "~/domain/transform/commands/AuditLogPutRecord.ts";
import { Commands } from "~/domain/transform/commands/Commands.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { MigrationConfigFeature } from "~/features/MigrationConfig/index.ts";
import { DdbExecutorFeature } from "~/features/DdbExecutor/index.ts";
import { AuditLogProcessorFeature } from "~/features/AuditLogProcessor/index.ts";
import {
    TargetDynamoDbClient,
    SourceDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import { createDdbContainer } from "../../containers/ddb.ts";
import { DynamoDB } from "@webiny/aws-sdk/client-dynamodb/index.js";

vi.mock("@webiny/aws-sdk/client-dynamodb/index.js", () => ({
    DynamoDB: vi.fn()
}));

const DEFAULT_CREDS = { accessKeyId: "test", secretAccessKey: "test" };

interface AuditLogSlice {
    putAuditLog(record: Record<string, unknown>): void;
}

function makeContainer(auditLogTableName: string | null = "audit-log-table"): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    MigrationConfigFeature.register(container, {
        config: {
            storage: "ddb",
            source: {
                region: "us-east-1",
                credentials: DEFAULT_CREDS,
                dynamodb: { tableName: "source-table" },
                s3: { bucket: "source-bucket" }
            },
            target: {
                region: "eu-central-1",
                credentials: DEFAULT_CREDS,
                dynamodb: { tableName: "target-table" },
                s3: { bucket: "target-bucket" },
                auditLog: auditLogTableName ? { dynamodb: { tableName: auditLogTableName } } : null
            },
            pipeline: { preset: "v5-to-v6" }
        } as MigrationConfig.Interface
    });
    container.registerInstance(SourceDynamoDbClient, new MockDynamoDbClient({}));
    container.registerInstance(TargetDynamoDbClient, new MockDynamoDbClient({}));
    DdbExecutorFeature.register(container);
    AuditLogProcessorFeature.register(container);
    return container;
}

function makeBase(): { base: BaseTransformContext.Interface<unknown>; captured: unknown[] } {
    const captured: unknown[] = [];
    const base = {
        record: {},
        original: {},
        addCommand(cmd: unknown): void {
            captured.push(cmd);
        }
    } as unknown as BaseTransformContext.Interface<unknown>;
    return { base, captured };
}

describe("AuditLogProcessor.putAuditLog", () => {
    it("emits AuditLogPutRecord when TYPE is auditLog.log", () => {
        const container = makeContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor) as unknown as Processor.Interface<
            BaseTransformContext.Interface<unknown>,
            AuditLogSlice
        >;
        const { base, captured } = makeBase();

        const slice = processor.extendContext!(base);
        slice.putAuditLog({ TYPE: "auditLog.log", PK: "T#root#AUDIT_LOG", SK: "abc123" });

        expect(captured).toHaveLength(1);
        expect((captured[0] as AuditLogPutRecord).key).toBe(AuditLogPutRecord.key);
    });

    it("does not emit when TYPE is not auditLog.log (raw CMS entry bypassed storageShape)", () => {
        const container = makeContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor) as unknown as Processor.Interface<
            BaseTransformContext.Interface<unknown>,
            AuditLogSlice
        >;
        const { base, captured } = makeBase();

        const slice = processor.extendContext!(base);
        slice.putAuditLog({ TYPE: "cms.entry.l", PK: "T#root#...", SK: "L" });

        expect(captured).toHaveLength(0);
    });

    it("does not emit when auditLog table is null regardless of TYPE", () => {
        const container = makeContainer(null);
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor) as unknown as Processor.Interface<
            BaseTransformContext.Interface<unknown>,
            AuditLogSlice
        >;
        const { base, captured } = makeBase();

        const slice = processor.extendContext!(base);
        slice.putAuditLog({ TYPE: "auditLog.log", PK: "T#root#AUDIT_LOG", SK: "abc123" });

        expect(captured).toHaveLength(0);
    });
});

describe("AuditLogProcessor.execute", () => {
    it("drains AuditLogPutRecord commands via DdbExecutor", async () => {
        const container = makeContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor) as unknown as Processor.Interface<
            BaseTransformContext.Interface<unknown>,
            AuditLogSlice
        >;

        const commands = new Commands();
        commands.add(
            AuditLogPutRecord.create({
                table: "audit-log-table",
                record: { TYPE: "auditLog.log", SK: "x" }
            })
        );

        await processor.execute(commands);
    });
});

describe("checkAccess", () => {
    let mockDescribeTable: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockDescribeTable = vi.fn();
        vi.mocked(DynamoDB).mockImplementation(function (this: {
            describeTable: typeof mockDescribeTable;
            destroy: ReturnType<typeof vi.fn>;
        }) {
            this.describeTable = mockDescribeTable;
            this.destroy = vi.fn();
        } as unknown as typeof DynamoDB);
    });

    it("returns empty array when audit log is not configured", async () => {
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor)!;

        const entries = await processor.checkAccess();

        expect(entries).toHaveLength(0);
    });

    it("returns ok when DescribeTable succeeds for the audit log table", async () => {
        mockDescribeTable.mockResolvedValue({});
        const container = createDdbContainer({ auditLogTable: "audit-log-table" });
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor)!;

        const entries = await processor.checkAccess();

        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual({
            label: "DynamoDB audit log table: audit-log-table",
            status: "ok"
        });
    });

    it("returns denied when DescribeTable throws AccessDeniedException", async () => {
        mockDescribeTable.mockRejectedValue(
            Object.assign(new Error("Access denied"), { name: "AccessDeniedException" })
        );
        const container = createDdbContainer({ auditLogTable: "audit-log-table" });
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor)!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "DynamoDB audit log table: audit-log-table",
            status: "denied"
        });
    });

    it("returns denied when DescribeTable throws ResourceNotFoundException", async () => {
        mockDescribeTable.mockRejectedValue(
            Object.assign(new Error("Table not found"), { name: "ResourceNotFoundException" })
        );
        const container = createDdbContainer({ auditLogTable: "audit-log-table" });
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor)!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "DynamoDB audit log table: audit-log-table",
            status: "denied"
        });
    });

    it("returns unknown for non-access errors", async () => {
        mockDescribeTable.mockRejectedValue(new Error("connection refused"));
        const container = createDdbContainer({ auditLogTable: "audit-log-table" });
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === AuditLogProcessor)!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "DynamoDB audit log table: audit-log-table",
            status: "unknown"
        });
    });
});
