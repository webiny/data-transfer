import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Stats } from "node:fs";
import { TransferWizard } from "../../../../src/commands/transfer/wizard/TransferWizard.ts";
import type { RawOutputValues } from "../../../../src/commands/transfer/wizard/types.ts";
import { StubPrompts } from "../../prompts/StubPrompts.ts";
import { StubUI } from "../../prompts/StubUI.ts";

vi.mock("../../../../src/commands/transfer/wizard/projectDiscovery.ts");
vi.mock("../../../../src/commands/transfer/wizard/configDiscovery.ts");
vi.mock("../../../../src/commands/transfer/wizard/presetDiscovery.ts");
vi.mock("../../../../src/commands/transfer/wizard/envWriter.ts");
vi.mock("../../../../src/commands/transfer/wizard/sources/WebinyOutputSource.ts");
vi.mock("../../../../src/commands/transfer/wizard/sources/PulumiStateSource.ts");
vi.mock("node:fs/promises");
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
vi.mock("../../../../src/commands/initProject/scaffoldProject.ts", () => ({
    scaffoldProject: vi.fn().mockResolvedValue(undefined)
}));

import { discoverProjects } from "../../../../src/commands/transfer/wizard/projectDiscovery.ts";
import { discoverConfig } from "../../../../src/commands/transfer/wizard/configDiscovery.ts";
import { listAvailablePresetsWithDescriptions } from "../../../../src/commands/transfer/wizard/presetDiscovery.ts";
import { writeEnv } from "../../../../src/commands/transfer/wizard/envWriter.ts";
import { extractFromWebinyOutput } from "../../../../src/commands/transfer/wizard/sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "../../../../src/commands/transfer/wizard/sources/PulumiStateSource.ts";
import { stat } from "node:fs/promises";
import { scaffoldProject } from "../../../../src/commands/initProject/scaffoldProject.ts";

const mockDiscoverProjects = vi.mocked(discoverProjects);
const mockDiscoverConfig = vi.mocked(discoverConfig);
const mockListAvailablePresetsWithDescriptions = vi.mocked(listAvailablePresetsWithDescriptions);
const mockWriteEnv = vi.mocked(writeEnv);
const mockExtractFromWebinyOutput = vi.mocked(extractFromWebinyOutput);
const mockExtractFromPulumiState = vi.mocked(extractFromPulumiState);
const mockStat = vi.mocked(stat);
const mockScaffoldProject = vi.mocked(scaffoldProject);

const noFile = (): never => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
};

const SOURCE_VALS: RawOutputValues = {
    region: "eu-central-1",
    primaryDynamodbTableName: "wby-source-primary",
    fileManagerBucketId: "wby-source-bucket",
    osTableName: "",
    osEndpoint: ""
};

const TARGET_VALS: RawOutputValues = {
    region: "us-east-1",
    primaryDynamodbTableName: "wby-target-primary",
    fileManagerBucketId: "wby-target-bucket",
    osTableName: "",
    osEndpoint: ""
};

beforeEach(() => {
    vi.resetAllMocks();
    mockWriteEnv.mockResolvedValue(undefined);
    mockScaffoldProject.mockResolvedValue(undefined);
});

function wizard(prompts: StubPrompts, ui = new StubUI()): TransferWizard {
    return new TransferWizard(process.cwd(), prompts, ui);
}

describe("TransferWizard", () => {
    it("env-setup path: writes .env and returns null", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("target.webiny.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockExtractFromWebinyOutput
            .mockResolvedValueOnce(SOURCE_VALS)
            .mockResolvedValueOnce(TARGET_VALS);

        const prompts = new StubPrompts({ select: ["my-project"], text: ["4"] });
        const result = await wizard(prompts).run();

        expect(result).toBeNull();
        expect(mockWriteEnv).toHaveBeenCalledOnce();
    });

    it("re-run path: .env exists, no JSON → finds config.ts, prompts for preset, returns WizardResult", async () => {
        const CONFIG_PATH = "/projects/my-project/config.ts";
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            if (String(p).endsWith(".env")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockDiscoverConfig.mockResolvedValue(CONFIG_PATH);
        mockListAvailablePresetsWithDescriptions.mockResolvedValue([
            { name: "v5-to-v6-ddb", description: "DDB only" },
            { name: "v5-to-v6-os", description: "DDB + OpenSearch" }
        ]);

        const prompts = new StubPrompts({
            select: ["my-project", "v5-to-v6-ddb"],
            confirm: [false]
        });
        const result = await wizard(prompts).run();

        expect(result).toEqual({
            configPath: CONFIG_PATH,
            preset: "v5-to-v6-ddb",
            dryRun: false
        });
        expect(mockWriteEnv).not.toHaveBeenCalled();
    });

    it("re-run path: throws when no config.ts found in project", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            if (String(p).endsWith(".env")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockDiscoverConfig.mockResolvedValue(null);

        const prompts = new StubPrompts({ select: ["my-project"] });
        await expect(wizard(prompts).run()).rejects.toThrow(/No config\.ts found/);
    });

    it("writes .env with correct values from webiny output", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("target.webiny.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockExtractFromWebinyOutput
            .mockResolvedValueOnce(SOURCE_VALS)
            .mockResolvedValueOnce(TARGET_VALS);

        const prompts = new StubPrompts({ select: ["my-project"], text: ["4"] });
        await wizard(prompts).run();

        expect(mockWriteEnv).toHaveBeenCalledOnce();
        const [, envValues] = mockWriteEnv.mock.calls[0]!;
        expect(envValues.sourceRegion).toBe("eu-central-1");
        expect(envValues.targetRegion).toBe("us-east-1");
        expect(envValues.segments).toBe(4);
    });

    it("warns when source and target are in different AWS accounts", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("target.webiny.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockExtractFromWebinyOutput
            .mockResolvedValueOnce({ ...SOURCE_VALS, accountId: "111111111111" })
            .mockResolvedValueOnce({ ...TARGET_VALS, accountId: "999999999999" });

        const prompts = new StubPrompts({ select: ["my-project"], text: ["4"] });
        const ui = new StubUI();
        await wizard(prompts, ui).run();

        expect(ui.warns[0]).toContain("111111111111");
        expect(ui.warns[0]).toContain("999999999999");
    });

    it("does not warn when source and target share the same AWS account", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("target.webiny.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockExtractFromWebinyOutput
            .mockResolvedValueOnce({ ...SOURCE_VALS, accountId: "111111111111" })
            .mockResolvedValueOnce({ ...TARGET_VALS, accountId: "111111111111" });

        const prompts = new StubPrompts({ select: ["my-project"], text: ["4"] });
        const ui = new StubUI();
        await wizard(prompts, ui).run();

        expect(ui.warns).toHaveLength(0);
    });

    it("prompts for OS index prefix when OS fields are present", async () => {
        const OS_SOURCE = {
            ...SOURCE_VALS,
            osTableName: "wby-es-source",
            osEndpoint: "https://es.source"
        };
        const OS_TARGET = {
            ...TARGET_VALS,
            osTableName: "wby-es-target",
            osEndpoint: "https://es.target"
        };
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("target.webiny.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockExtractFromWebinyOutput
            .mockResolvedValueOnce(OS_SOURCE)
            .mockResolvedValueOnce(OS_TARGET);

        const prompts = new StubPrompts({
            select: ["my-project"],
            text: ["4", "v6-"]
        });
        await wizard(prompts).run();

        const [, envValues] = mockWriteEnv.mock.calls[0]!;
        expect(envValues.targetOsIndexPrefix).toBe("v6-");
    });

    it("throws when no presets are available", async () => {
        const CONFIG_PATH = "/projects/my-project/config.ts";
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            if (String(p).endsWith(".env")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockDiscoverConfig.mockResolvedValue(CONFIG_PATH);
        mockListAvailablePresetsWithDescriptions.mockResolvedValue([]);

        const prompts = new StubPrompts({ select: ["my-project"] });
        await expect(wizard(prompts).run()).rejects.toThrow(/No presets available/);
    });

    it("throws when same-side files disagree on osTableName", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("source.pulumi.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockExtractFromWebinyOutput.mockResolvedValue({
            ...SOURCE_VALS,
            osTableName: "wby-es-webiny"
        });
        mockExtractFromPulumiState.mockResolvedValue({
            ...SOURCE_VALS,
            osTableName: "wby-es-pulumi"
        });

        const prompts = new StubPrompts({ select: ["my-project"] });
        await expect(wizard(prompts).run()).rejects.toThrow(/osTableName/);
    });

    it("returns null when the user cancels at project selection", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        const result = await wizard(new StubPrompts()).run();
        expect(result).toBeNull();
    });
});
