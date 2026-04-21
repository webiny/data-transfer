#!/usr/bin/env node
// Install the deprecation filter FIRST so it's in place before any
// import pulls in @webiny/lexical-* (the DEP0151 source). ESM imports
// are evaluated in order within a module; this one must stay on top.
import "./utils/suppressDeprecations.ts";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
    registerRunCommand,
    registerInitCommand,
    registerProcessSegmentCommand
} from "./commands/index.ts";

let cli = yargs(hideBin(process.argv));
cli = registerInitCommand(cli);
cli = registerRunCommand(cli);
cli = registerProcessSegmentCommand(cli);
cli.help().parse();
