import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbContainer } from "./containers/index.ts";
import { MockDynamoDbClient } from "./services/DynamoDbClient/MockDynamoDbClient.ts";
import { v5SecurityGroup, v5ContentModelGroup } from "./fixtures/v5-records.ts";

interface WrappedSecurityGroup extends BaseRecord {
    GSI_TENANT?: string;
    GSI1_PK?: string;
    webinyVersion?: string;
    name?: string;
    permissions?: unknown;
    slug?: string;
    data: {
        name?: string;
        permissions?: unknown;
        slug?: string;
        webinyVersion?: string;
    };
}

async function runSecurityGroup(): Promise<WrappedSecurityGroup> {
    const container = createDdbContainer({
        sourceRecords: {
            "source-table": [v5ContentModelGroup as BaseRecord, v5SecurityGroup as BaseRecord]
        }
    });
    const runner = container.resolve(PipelineRunner);
    v5ToV6Preset.configure(runner);

    await runner.run();

    const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
    const securityRole = targetDb.batchPutRecords.find(
        r => (r as BaseRecord).TYPE === "security.role"
    );
    expect(securityRole).toBeDefined();
    return securityRole as WrappedSecurityGroup;
}

describe("Global Transformations", () => {
    it("should wrap non-reserved attributes in data envelope", async () => {
        const migratedRecord = await runSecurityGroup();

        expect(migratedRecord.PK).toBeDefined();
        expect(migratedRecord.SK).toBeDefined();
        expect(migratedRecord.TYPE).toBeDefined();
        expect(migratedRecord.GSI_TENANT).toBeDefined();

        expect(migratedRecord.name).toBeUndefined();
        expect(migratedRecord.permissions).toBeUndefined();
        expect(migratedRecord.slug).toBeUndefined();

        expect(migratedRecord.data.name).toBe("Test Role #1");
        expect(migratedRecord.data.permissions).toBeDefined();
        expect(migratedRecord.data.slug).toBe("test-role-1");
    });

    it("should add GSI_TENANT attribute", async () => {
        const migratedRecord = await runSecurityGroup();
        expect(migratedRecord.GSI_TENANT).toBe("root");
    });

    it("should remove locale from all keys", async () => {
        const migratedRecord = await runSecurityGroup();
        expect(migratedRecord.PK).not.toContain("#L#en-US#");
        expect(migratedRecord.GSI1_PK).not.toContain("#L#en-US#");
    });

    it("should remove webinyVersion attribute", async () => {
        const migratedRecord = await runSecurityGroup();
        expect(migratedRecord.webinyVersion).toBeUndefined();
        expect(migratedRecord.data.webinyVersion).toBeUndefined();
    });
});
