import { Abstraction } from "@webiny/di";

export interface IBuildOrchestrator {
    run(): void;
}

export const BuildOrchestrator = new Abstraction<IBuildOrchestrator>(
    "Scripts/Build/BuildOrchestrator"
);

export namespace BuildOrchestrator {
    export type Interface = IBuildOrchestrator;
}
