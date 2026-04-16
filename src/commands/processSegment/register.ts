import type { Argv } from "yargs";
import { handler } from "./handler.ts";

export function registerProcessSegmentCommand(yargs: Argv): Argv {
    return yargs.command(
        "process-segment",
        "Process a specific DDB segment (used internally by worker processes)",
        yargs => {
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
                });
        },
        async argv => {
            await handler(argv);
        }
    );
}
