import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/commands/transfer/handler.ts", () => ({ handler: vi.fn(async () => undefined) }));
vi.mock("~/commands/transfer/wizard/TransferWizard.ts", () => ({
    TransferWizard: vi.fn()
}));

import { handler } from "~/commands/transfer/handler.js";
import { TransferWizard } from "~/commands/transfer/wizard/TransferWizard.js";
import { TransferCommand } from "~/commands/transfer/TransferCommand.js";
import { StubPrompts } from "../prompts/StubPrompts.ts";
import { StubUI } from "../prompts/StubUI.ts";

const handlerSpy = vi.mocked(handler);
const MockWizard = vi.mocked(TransferWizard);

function mockWizardRun(result: unknown): ReturnType<typeof vi.fn> {
    const run = vi.fn().mockResolvedValue(result);
    MockWizard.mockImplementation(function (this: { run: typeof run }) {
        this.run = run;
    } as never);
    return run;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockWizardRun(null);
});

describe("TransferCommand", () => {
    it("has the yargs name and is visible in the menu", () => {
        const command = new TransferCommand(new StubPrompts(), new StubUI());
        expect(command.name).toBe("transfer");
        expect((command as unknown as { hidden?: boolean }).hidden).toBeUndefined();
    });

    it("--config + --preset skips the wizard and runs the handler", async () => {
        const code = await new TransferCommand(new StubPrompts(), new StubUI()).run({
            config: "./p/config.ts",
            preset: "copy-ddb",
            "dry-run": true,
            segments: [1, 3],
            "log-level": "warn"
        });
        expect(code).toBe(0);
        expect(handlerSpy).toHaveBeenCalledWith("./p/config.ts", "copy-ddb", [1, 3], "warn", true);
        expect(MockWizard).not.toHaveBeenCalled();
    });

    it("wizard returning null (env written) exits 0 without running handler", async () => {
        mockWizardRun(null);
        expect(await new TransferCommand(new StubPrompts(), new StubUI()).run({})).toBe(0);
        expect(handlerSpy).not.toHaveBeenCalled();
    });

    it("wizard result is passed to the handler", async () => {
        mockWizardRun({ configPath: "/c.ts", preset: "v5-to-v6-ddb", dryRun: false });
        expect(await new TransferCommand(new StubPrompts(), new StubUI()).run({})).toBe(0);
        expect(handlerSpy).toHaveBeenCalledWith(
            "/c.ts",
            "v5-to-v6-ddb",
            undefined,
            undefined,
            false
        );
    });
});
