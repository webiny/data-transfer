#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { run } from "./commands/run.ts";
import { runProcessSegment } from "./commands/processSegment.ts";
import { runProcessOsSegment } from "./commands/processOsSegment.ts";

yargs(hideBin(process.argv))
    .command(
        "$0",
        "Transfer Webiny data using a configuration file",
        yargs => {
            return yargs.option("config", {
                type: "string",
                demandOption: true,
                description: "Path to configuration file"
            });
        },
        async argv => {
            await run(argv.config);
        }
    )
    .command(
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
            await runProcessSegment(argv);
        }
    )
    .command(
        "process-os-segment",
        "Process a specific OS table segment (used internally by worker processes)",
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
            await runProcessOsSegment(argv);
        }
    )
    .help()
    .parse();
