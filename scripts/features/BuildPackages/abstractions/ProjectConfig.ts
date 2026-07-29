import { Abstraction } from "@webiny/di";

export interface IProjectConfig {
    rootDir: string;
    slices: string[];
}

export const ProjectConfig = new Abstraction<IProjectConfig>("Scripts/Build/ProjectConfig");

export namespace ProjectConfig {
    export type Interface = IProjectConfig;
}
