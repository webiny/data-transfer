import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/commands/transfer/wizard/projectDiscovery.ts", () => ({
    discoverProjects: vi.fn(async () => ["acme"])
}));
vi.mock("~/commands/transfer/wizard/configDiscovery.ts", () => ({
    discoverConfig: vi.fn(async () => "/w/projects/acme/config.ts")
}));

const CREDS = { accessKeyId: "a", secretAccessKey: "b" };
const CONFIG = {
    source: {
        region: "eu-central-1",
        credentials: CREDS,
        dynamodb: { tableName: "acme-src-ddb" },
        s3: { bucket: "acme-src-s3" }
    },
    target: {
        region: "us-east-1",
        credentials: CREDS,
        accountId: "123456789012",
        dynamodb: { tableName: "acme-prod-ddb" },
        s3: { bucket: "acme-prod-s3" },
        opensearch: {
            endpoint: "https://os.example.com",
            tableName: "acme-prod-os",
            service: "opensearch" as const,
            indexPrefix: ""
        }
    },
    pipeline: { segments: 4 }
};

vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async () => CONFIG)
}));

const mockResolve = vi.fn();
const mockRegisterInstance = vi.fn();

vi.mock("~/bootstrap.ts", () => ({
    bootstrap: vi.fn(() => ({
        resolve: mockResolve,
        registerInstance: mockRegisterInstance
    }))
}));

import { FixLiveCommand } from "~/commands/fixLive/FixLiveCommand.js";
import { StubPrompts } from "../prompts/StubPrompts.ts";
import { StubUI } from "../prompts/StubUI.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { MockChangeReport } from "../../features/FixLive/MockChangeReport.ts";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { ChangeReport, DdbLiveFieldRunner, FixLiveState } from "~/features/FixLive/index.js";
import type { LiveFieldRunner } from "~/features/FixLive/abstractions/LiveFieldRunner.js";
import { createEmptyStats } from "~/features/FixLive/createEmptyStats.js";

const v6Row = {
    PK: "T#root#L#en-US#CMS#CME#abc",
    SK: "L",
    TYPE: "cms.entry.l",
    _et: "CmsEntries",
    _ct: "x",
    _md: "x",
    data: { modelId: "article", version: 1, status: "draft" }
};

const fakeRunner: LiveFieldRunner.Interface = {
    async run(options) {
        const stats = createEmptyStats();
        stats.scanned = 100;
        stats.entries = 10;
        stats.changes["missing-live"] = 5;
        options.onProgress(stats);
        return stats;
    }
};

const fakeState = {
    read: vi.fn(() => null),
    pathFor: vi.fn(() => ".transfer/state/fix-live/acme__target.json"),
    recordDryRun: vi.fn(),
    recordLiveRun: vi.fn()
};

beforeEach(() => {
    vi.clearAllMocks();
    const targetClient = new MockDynamoDbClient({
        "acme-prod-ddb": [v6Row] as never
    });
    const sourceClient = new MockDynamoDbClient({
        "acme-src-ddb": [v6Row] as never
    });
    mockResolve.mockImplementation((token: unknown) => {
        if (token === TargetDynamoDbClient) {
            return targetClient;
        }
        if (token === SourceDynamoDbClient) {
            return sourceClient;
        }
        if (token === ChangeReport) {
            return new MockChangeReport();
        }
        if (token === FixLiveState) {
            return fakeState;
        }
        if (token === DdbLiveFieldRunner) {
            return fakeRunner;
        }
        return {};
    });
});

function command(
    prompts: StubPrompts,
    ui = new StubUI()
): {
    cmd: InstanceType<typeof FixLiveCommand>;
    ui: StubUI;
} {
    const cmd = new FixLiveCommand(prompts, ui);
    return { cmd, ui };
}

describe("FixLiveCommand", () => {
    it("cancel at project select → 130", async () => {
        const { cmd } = command(new StubPrompts());
        expect(await cmd.run({})).toBe(130);
    });

    it("cancel at system select → 130", async () => {
        const { cmd } = command(new StubPrompts({ select: ["acme"] }));
        expect(await cmd.run({})).toBe(130);
    });

    it("cancel at system confirm → 130", async () => {
        const { cmd } = command(new StubPrompts({ select: ["acme", "target"] }));
        expect(await cmd.run({})).toBe(130);
    });

    it("cancel at mode select → 130", async () => {
        const { cmd } = command(new StubPrompts({ select: ["acme", "target"], confirm: [true] }));
        expect(await cmd.run({})).toBe(130);
    });

    it("--live without a dry run → 1", async () => {
        const ui = new StubUI();
        const { cmd } = command(new StubPrompts(), ui);
        const code = await cmd.run({
            project: "acme",
            system: "target",
            live: true,
            yes: true
        });
        expect(code).toBe(1);
        expect(ui.errors[0]).toMatch(/Run a dry run first/);
    });

    it("--yes --dry-run runs, records state, exits 0", async () => {
        const prompts = new StubPrompts();
        const ui = new StubUI();
        const { cmd } = command(prompts, ui);
        const code = await cmd.run({
            project: "acme",
            system: "target",
            "dry-run": true,
            yes: true,
            table: "ddb"
        });
        expect(code).toBe(0);
        expect(prompts.selectCalls).toHaveLength(0);
        expect(prompts.confirmCalls).toHaveLength(0);
        expect(fakeState.recordDryRun).toHaveBeenCalledWith(
            { project: "acme", system: "target" },
            expect.objectContaining({ changes: 5, skips: 0 })
        );
        expect(ui.outros).toEqual(["Done."]);
    });

    it("--table=os on a system without OpenSearch → 1", async () => {
        const ui = new StubUI();
        const { cmd } = command(new StubPrompts(), ui);
        const code = await cmd.run({
            project: "acme",
            system: "source",
            "dry-run": true,
            yes: true,
            table: "os"
        });
        expect(code).toBe(1);
        expect(ui.errors[0]).toMatch(/no OpenSearch table/);
    });

    it("--live --yes with state records lastLiveRun", async () => {
        fakeState.read.mockReturnValue({
            lastDryRun: {
                runId: "0",
                at: "2026-09-04T09:12:00.000Z",
                changes: 5,
                skips: 0
            }
        } as never);
        const { cmd } = command(new StubPrompts());
        const code = await cmd.run({
            project: "acme",
            system: "target",
            live: true,
            yes: true,
            table: "ddb"
        });
        expect(code).toBe(0);
        expect(fakeState.recordLiveRun).toHaveBeenCalledWith(
            { project: "acme", system: "target" },
            expect.objectContaining({ written: 0, conditionFailed: 0 })
        );
    });
});
