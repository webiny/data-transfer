import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import { UI } from "~/commands/prompts/abstractions/UI.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";
import { parseSegmentsFilter } from "./segmentsFilter.ts";
import { TransferWizard } from "./wizard/TransferWizard.ts";

class TransferCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "transfer";
    public readonly description = "Transfer Webiny data from a source system to a target system";

    public constructor(
        private readonly prompts: Prompts.Interface,
        private readonly ui: UI.Interface
    ) {}

    public configure(yargs: Argv): Argv {
        return yargs
            .option("config", {
                type: "string",
                demandOption: false,
                description: "Path to configuration file"
            })
            .option("preset", {
                type: "string",
                demandOption: false,
                description: "Preset name to run"
            })
            .option("dry-run", {
                type: "boolean",
                default: false,
                description: "Read source but skip all writes to target"
            })
            .option("segments", {
                type: "string",
                description:
                    "Comma-separated list of segment indices to run (e.g. `1,3`). " +
                    "Use to re-run specific shards after a failure. Defaults to all."
            })
            .coerce("segments", parseSegmentsFilter)
            .option("log-level", {
                type: "string",
                choices: ["debug", "info", "warn", "error"] as const,
                description: "Log level (default: info)"
            });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        const configPath = argv.config as string | undefined;
        const preset = argv.preset as string | undefined;
        const logLevel = argv["log-level"] as string | undefined;
        const dryRun = Boolean(argv["dry-run"]);
        const segments = argv.segments as number[] | undefined;

        if (configPath && preset) {
            await handler(configPath, preset, segments, logLevel, dryRun);
            return EXIT_OK;
        }

        const wizard = new TransferWizard(process.cwd(), this.prompts, this.ui);
        const result = await wizard.run();
        if (result === null) {
            return EXIT_OK;
        }
        await handler(result.configPath, result.preset, segments, logLevel, result.dryRun);
        return EXIT_OK;
    }
}

export const TransferCommand = CommandAbstraction.createImplementation({
    implementation: TransferCommandImpl,
    dependencies: [Prompts, UI]
});
