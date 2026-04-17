import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { DdbCommandExecutor } from "~/features/DdbCommandExecutor/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import {
    v5SecurityGroup,
    v5ContentModelGroup,
    v5FullAccessGroup,
    v5AnonymousGroup
} from "./fixtures/v5-records.ts";

function setup(withContentModelGroup = false) {
    const sourceRecords = withContentModelGroup
        ? { "source-table": [v5ContentModelGroup as any] }
        : undefined;
    const container = createDdbContainer({ sourceRecords });
    const runner = container.resolve(PipelineRunner);
    const executor = container.resolve(DdbCommandExecutor);
    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    v5ToV6Preset.configure(runner);
    return { runner, executor, targetDb };
}

describe("Security Groups to Roles", () => {
    it("should transform security.group to security.role", async () => {
        const { runner, executor, targetDb } = setup(true);

        const commands = await runner.processRecord(v5SecurityGroup as any);
        await executor.execute(commands);

        const migratedRecords = targetDb.batchPutRecords;
        expect(migratedRecords).toHaveLength(1);

        const migratedRecord = migratedRecords[0] as any;

        expect(migratedRecord.TYPE).toBe("security.role");
        expect(migratedRecord._et).toBe("SecurityRole");
        expect(migratedRecord.PK).not.toContain("#L#en-US#");
        expect(migratedRecord.GSI1_PK).not.toContain("#L#en-US#");
        expect(migratedRecord.PK).toContain("#ROLE#");
        expect(migratedRecord.PK).not.toContain("#GROUP#");
        expect(migratedRecord.GSI1_PK).toContain("#ROLES");
        expect(migratedRecord.GSI1_PK).not.toContain("#GROUPS");
        expect(migratedRecord.GSI_TENANT).toBe("root");
        expect(migratedRecord.data).toBeDefined();
        expect(migratedRecord.data.name).toBe("Test Role #1");
        expect(migratedRecord.data.permissions).toHaveLength(6);
        expect(migratedRecord.webinyVersion).toBeUndefined();
        expect(migratedRecord.data.webinyVersion).toBeUndefined();
    });

    it("should skip full-access role", async () => {
        const { runner } = setup();
        const commands = await runner.processRecord(v5FullAccessGroup as any);
        expect(commands.size()).toBe(0);
    });

    it("should skip anonymous role", async () => {
        const { runner } = setup();
        const commands = await runner.processRecord(v5AnonymousGroup as any);
        expect(commands.size()).toBe(0);
    });

    it("should remove content.i18n permission", async () => {
        const { runner, executor, targetDb } = setup(true);

        const commands = await runner.processRecord(v5SecurityGroup as any);
        await executor.execute(commands);

        const migratedRecord = targetDb.batchPutRecords[0] as any;
        const hasContentI18n = migratedRecord.data.permissions.some(
            (p: any) => p.name === "content.i18n"
        );
        expect(hasContentI18n).toBe(false);
    });

    it("should flatten cms.contentModel models from locale object to array", async () => {
        const { runner, executor, targetDb } = setup(true);

        const commands = await runner.processRecord(v5SecurityGroup as any);
        await executor.execute(commands);

        const migratedRecord = targetDb.batchPutRecords[0] as any;
        const contentModelPerm = migratedRecord.data.permissions.find(
            (p: any) => p.name === "cms.contentModel"
        );

        expect(contentModelPerm).toBeDefined();
        expect(contentModelPerm.models).toEqual(["article"]);
        expect(Array.isArray(contentModelPerm.models)).toBe(true);
    });

    it("should transform cms.contentModelGroup groups from IDs to slugs", async () => {
        const { runner, executor, targetDb } = setup(true);

        const commands = await runner.processRecord(v5SecurityGroup as any);
        await executor.execute(commands);

        const migratedRecord = targetDb.batchPutRecords[0] as any;
        const groupPerm = migratedRecord.data.permissions.find(
            (p: any) => p.name === "cms.contentModelGroup"
        );

        expect(groupPerm).toBeDefined();
        expect(groupPerm.groups).toEqual(["ungrouped"]);
        expect(Array.isArray(groupPerm.groups)).toBe(true);
    });
});
