import { describe, it, expect } from "vitest";
import { v5ToV6Preset } from "~/presets/v5-to-v6-ddb.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { createDdbContainer } from "./containers/index.ts";
import { v5UnknownRecord } from "./fixtures/v5-records.ts";

describe("Record Filtering", () => {
    it("should skip records without matching pipeline", async () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        v5ToV6Preset.configure(runner);

        const commands = await runner.processRecord(v5UnknownRecord as any);

        expect(commands.size()).toBe(0);
    });
});
