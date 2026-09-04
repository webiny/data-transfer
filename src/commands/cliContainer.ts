import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.js";
import { PromptsFeature } from "./prompts/feature.ts";
import { CommandRegistryFeature } from "./registry/feature.ts";
import {
    TransferCommand,
    InitCommand,
    InitProjectCommand,
    ProcessSegmentCommand,
    UpdateSkillsCommand
} from "./index.ts";

export function createCliContainer(): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    PromptsFeature.register(container);
    CommandRegistryFeature.register(container);
    container.register(TransferCommand).inSingletonScope();
    container.register(InitCommand).inSingletonScope();
    container.register(InitProjectCommand).inSingletonScope();
    container.register(ProcessSegmentCommand).inSingletonScope();
    container.register(UpdateSkillsCommand).inSingletonScope();
    return container;
}
