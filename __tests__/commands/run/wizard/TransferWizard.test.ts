import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Stats } from "node:fs";
import { TransferWizard } from "../../../../src/commands/run/wizard/TransferWizard.ts";
import type { RawOutputValues } from "../../../../src/commands/run/wizard/types.ts";

vi.mock("../../../../src/commands/run/wizard/projectDiscovery.ts");
vi.mock("../../../../src/commands/run/wizard/configDiscovery.ts");
vi.mock("../../../../src/commands/run/wizard/presetDiscovery.ts");
vi.mock("../../../../src/commands/run/wizard/envWriter.ts");
vi.mock("../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts");
vi.mock("../../../../src/commands/run/wizard/sources/PulumiStateSource.ts");
vi.mock("@inquirer/prompts");
vi.mock("node:fs/promises");
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
vi.mock("../../../../src/commands/initProject/scaffoldProject.ts", () => ({
    scaffoldProject: vi.fn().mockResolvedValue(undefined)
}));

import { discoverProjects } from "../../../../src/commands/run/wizard/projectDiscovery.ts";
import { discoverConfig } from "../../../../src/commands/run/wizard/configDiscovery.ts";
import { listAvailablePresetsWithDescriptions } from "../../../../src/commands/run/wizard/presetDiscovery.ts";
import { writeEnv } from "../../../../src/commands/run/wizard/envWriter.ts";
import { extractFromWebinyOutput } from "../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "../../../../src/commands/run/wizard/sources/PulumiStateSource.ts";
import { input, select } from "@inquirer/prompts";
import { stat } from "node:fs/promises";
import { scaffoldProject } from "../../../../src/commands/initProject/scaffoldProject.ts";

const mockDiscoverProjects = vi.mocked(discoverProjects);
const mockDiscoverConfig = vi.mocked(discoverConfig);
const mockListAvailablePresetsWithDescriptions = vi.mocked(listAvailablePresetsWithDescriptions);
const mockWriteEnv = vi.mocked(writeEnv);
const mockExtractFromWebinyOutput = vi.mocked(extractFromWebinyOutput);
const mockExtractFromPulumiState = vi.mocked(extractFromPulumiState);
const mockInput = vi.mocked(input);
const mockSelect = vi.mocked(select);
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

describe("TransferWizard", () => {
    it("env-setup path: writes .env and returns null", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
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
        mockInput.mockResolvedValue("4");

        const result = await new TransferWizard(process.cwd()).run();

        expect(result).toBeNull();
        expect(mockWriteEnv).toHaveBeenCalledOnce();
    });

    it("re-run path: .env exists, no JSON → finds config.ts, prompts for preset, returns WizardResult", async () => {
        const CONFIG_PATH = "/projects/my-project/config.ts";
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValueOnce("my-project").mockResolvedValueOnce("v5-to-v6-ddb");
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

        const result = await new TransferWizard(process.cwd()).run();

        expect(result).toEqual({ configPath: CONFIG_PATH, preset: "v5-to-v6-ddb" });
        expect(mockWriteEnv).not.toHaveBeenCalled();
    });

    it("re-run path: exits with error when no config.ts found in project", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
        mockStat.mockImplementation(async (p: unknown) => {
            if (String(p).endsWith(".env")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockDiscoverConfig.mockResolvedValue(null);

        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("exit");
        });
        await expect(new TransferWizard(process.cwd()).run()).rejects.toThrow("exit");
        exitSpy.mockRestore();
    });

    it("writes .env with correct values from webiny output", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
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
        mockInput.mockResolvedValue("4");

        await new TransferWizard(process.cwd()).run();

        expect(mockWriteEnv).toHaveBeenCalledOnce();
        const [, envValues] = mockWriteEnv.mock.calls[0]!;
        expect(envValues.sourceRegion).toBe("eu-central-1");
        expect(envValues.targetRegion).toBe("us-east-1");
        expect(envValues.segments).toBe(4);
    });

    it("warns when source and target are in different AWS accounts", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
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
        mockInput.mockResolvedValue("4");
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        await new TransferWizard(process.cwd()).run();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("111111111111"));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("999999999999"));
        warnSpy.mockRestore();
    });

    it("does not warn when source and target share the same AWS account", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
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
        mockInput.mockResolvedValue("4");
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        await new TransferWizard(process.cwd()).run();

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
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
        mockSelect.mockResolvedValue("my-project");
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
        mockInput.mockResolvedValueOnce("4").mockResolvedValueOnce("v6-");

        await new TransferWizard(process.cwd()).run();

        const [, envValues] = mockWriteEnv.mock.calls[0]!;
        expect(envValues.targetOsIndexPrefix).toBe("v6-");
    });

    it("exits with error when no presets are available", async () => {
        const CONFIG_PATH = "/projects/my-project/config.ts";
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
        mockStat.mockImplementation(async (p: unknown) => {
            if (String(p).endsWith(".env")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockDiscoverConfig.mockResolvedValue(CONFIG_PATH);
        mockListAvailablePresetsWithDescriptions.mockResolvedValue([]);

        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("exit");
        });
        await expect(new TransferWizard(process.cwd()).run()).rejects.toThrow("exit");
        exitSpy.mockRestore();
    });

    it("throws when same-side files disagree on osTableName", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
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

        await expect(new TransferWizard(process.cwd()).run()).rejects.toThrow(/osTableName/);
    });
});
