import { describe, it, expect, vi } from "vitest";

vi.mock("~/commands/transfer/wizard/projectDiscovery.ts", () => ({
    discoverProjects: vi.fn(async () => ["acme", "beta"])
}));

import { selectProject } from "~/commands/fixLive/steps/selectProject.js";
import { StubPrompts } from "../../prompts/StubPrompts.ts";

describe("selectProject", () => {
    it("uses --project when it exists", async () => {
        const prompts = new StubPrompts();
        const result = await selectProject({ prompts, cwd: "/w", projectArg: "beta" });
        expect(result).toEqual({ kind: "ok", value: "beta" });
        expect(prompts.selectCalls).toHaveLength(0);
    });

    it("refuses an unknown --project", async () => {
        const result = await selectProject({
            prompts: new StubPrompts(),
            cwd: "/w",
            projectArg: "x"
        });
        expect(result.kind).toBe("refused");
        expect((result as { message: string }).message).toMatch(
            /Project "x" not found.*acme, beta/
        );
    });

    it("prompts and returns the choice", async () => {
        const prompts = new StubPrompts({ select: ["acme"] });
        expect(await selectProject({ prompts, cwd: "/w" })).toEqual({
            kind: "ok",
            value: "acme"
        });
        expect(prompts.selectCalls[0]!.message).toBe("Select a project");
    });

    it("cancel → cancelled", async () => {
        expect(await selectProject({ prompts: new StubPrompts(), cwd: "/w" })).toEqual({
            kind: "cancelled"
        });
    });
});
