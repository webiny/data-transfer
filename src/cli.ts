#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
    registerRunCommand,
    registerInitCommand,
    registerProcessSegmentCommand,
    registerProcessOsSegmentCommand
} from "./commands/index.ts";

let cli = yargs(hideBin(process.argv));
cli = registerInitCommand(cli);
cli = registerRunCommand(cli);
cli = registerProcessSegmentCommand(cli);
cli = registerProcessOsSegmentCommand(cli);
cli.help().parse();
