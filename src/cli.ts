#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
    registerRunCommand,
    registerProcessSegmentCommand,
    registerProcessOsSegmentCommand
} from "./commands/index.ts";

let cli = yargs(hideBin(process.argv));
cli = registerRunCommand(cli);
cli = registerProcessSegmentCommand(cli);
cli = registerProcessOsSegmentCommand(cli);
cli.help().parse();
