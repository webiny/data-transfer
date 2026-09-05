import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";

class ProcessSegmentCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "process-segment";
    public readonly description =
        "Process a specific DDB segment (used internally by worker processes)";
    public readonly hidden = true;

    public configure(yargs: Argv): Argv {
        return yargs
            .option("runId", { type: "string", demandOption: true, description: "Run ID" })
            .option("segment", {
                type: "number",
                demandOption: true,
                description: "Segment number"
            })
            .option("total", {
                type: "number",
                demandOption: true,
                description: "Total segments"
            })
            .option("config", {
                type: "string",
                demandOption: true,
                description: "Config file path"
            })
            .option("preset", {
                type: "string",
                demandOption: true,
                description: "Preset name to use for this segment"
            })
            .option("log-level", {
                type: "string",
                choices: ["debug", "info", "warn", "error"] as const,
                description: "Log level"
            })
            .option("dry-run", {
                type: "boolean",
                default: false,
                description: "Skip all writes to the target system"
            });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        await handler({
            runId: argv.runId as string,
            segment: argv.segment as number,
            total: argv.total as number,
            config: argv.config as string,
            preset: argv.preset as string,
            logLevel: argv["log-level"] as string | undefined,
            dryRun: argv["dry-run"] as boolean | undefined
        });
        return EXIT_OK;
    }
}

export const ProcessSegmentCommand = CommandAbstraction.createImplementation({
    implementation: ProcessSegmentCommandImpl,
    dependencies: []
});
