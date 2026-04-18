import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import {
    v5SecurityGroup,
    v5ContentModelGroup,
    v5FullAccessGroup,
    v5AnonymousGroup
} from "./fixtures/v5-records.ts";

interface SecurityRolePermission {
    name: string;
    models?: string[];
    groups?: string[];
}

interface MigratedSecurityRole extends BaseRecord {
    GSI_TENANT?: string;
    GSI1_PK?: string;
    webinyVersion?: string;
    data: {
        name?: string;
        permissions: SecurityRolePermission[];
        webinyVersion?: string;
    };
}

async function runGroups(records: BaseRecord[]): Promise<BaseRecord[]> {
    const container = createDdbContainer({
        sourceRecords: { "source-table": records }
    });
    const runner = container.resolve(PipelineRunner);
    v5ToV6Preset.configure(runner);

    await runner.run();

    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    return targetDb.batchPutRecords as BaseRecord[];
}

describe("Security Groups to Roles", () => {
    it("should transform security.group to security.role", async () => {
        const migratedRecords = await runGroups([
            v5ContentModelGroup as BaseRecord,
            v5SecurityGroup as BaseRecord
        ]);

        const migratedRecord = migratedRecords.find(
            r => (r as BaseRecord).TYPE === "security.role"
        ) as MigratedSecurityRole | undefined;
        expect(migratedRecord).toBeDefined();
        const role = migratedRecord as MigratedSecurityRole;

        expect(role.TYPE).toBe("security.role");
        expect(role._et).toBe("SecurityRole");
        expect(role.PK).not.toContain("#L#en-US#");
        expect(role.GSI1_PK).not.toContain("#L#en-US#");
        expect(role.PK).toContain("#ROLE#");
        expect(role.PK).not.toContain("#GROUP#");
        expect(role.GSI1_PK).toContain("#ROLES");
        expect(role.GSI1_PK).not.toContain("#GROUPS");
        expect(role.GSI_TENANT).toBe("root");
        expect(role.data).toBeDefined();
        expect(role.data.name).toBe("Test Role #1");
        expect(role.data.permissions).toHaveLength(6);
        expect(role.webinyVersion).toBeUndefined();
        expect(role.data.webinyVersion).toBeUndefined();
    });

    it("should skip full-access role", async () => {
        const migratedRecords = await runGroups([v5FullAccessGroup as BaseRecord]);
        expect(migratedRecords).toHaveLength(0);
    });

    it("should skip anonymous role", async () => {
        const migratedRecords = await runGroups([v5AnonymousGroup as BaseRecord]);
        expect(migratedRecords).toHaveLength(0);
    });

    it("should remove content.i18n permission", async () => {
        const migratedRecords = await runGroups([
            v5ContentModelGroup as BaseRecord,
            v5SecurityGroup as BaseRecord
        ]);

        const migratedRecord = migratedRecords.find(
            r => (r as BaseRecord).TYPE === "security.role"
        ) as MigratedSecurityRole;
        const hasContentI18n = migratedRecord.data.permissions.some(p => p.name === "content.i18n");
        expect(hasContentI18n).toBe(false);
    });

    it("should flatten cms.contentModel models from locale object to array", async () => {
        const migratedRecords = await runGroups([
            v5ContentModelGroup as BaseRecord,
            v5SecurityGroup as BaseRecord
        ]);

        const migratedRecord = migratedRecords.find(
            r => (r as BaseRecord).TYPE === "security.role"
        ) as MigratedSecurityRole;
        const contentModelPerm = migratedRecord.data.permissions.find(
            p => p.name === "cms.contentModel"
        );

        expect(contentModelPerm).toBeDefined();
        const perm = contentModelPerm as SecurityRolePermission;
        expect(perm.models).toEqual(["article"]);
        expect(Array.isArray(perm.models)).toBe(true);
    });

    it("should transform cms.contentModelGroup groups from IDs to slugs", async () => {
        const migratedRecords = await runGroups([
            v5ContentModelGroup as BaseRecord,
            v5SecurityGroup as BaseRecord
        ]);

        const migratedRecord = migratedRecords.find(
            r => (r as BaseRecord).TYPE === "security.role"
        ) as MigratedSecurityRole;
        const groupPerm = migratedRecord.data.permissions.find(
            p => p.name === "cms.contentModelGroup"
        );

        expect(groupPerm).toBeDefined();
        const perm = groupPerm as SecurityRolePermission;
        expect(perm.groups).toEqual(["ungrouped"]);
        expect(Array.isArray(perm.groups)).toBe(true);
    });
});
