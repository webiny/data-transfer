import { createAbstraction } from "~/base/index.js";

interface SpawnOptions {
    segment: number;
    totalSegments: number;
    runId: string;
    configPath: string;
    command: string;
}

interface IWorkerSpawner {
    spawn(options: SpawnOptions): Promise<void>;
}

export const WorkerSpawner = createAbstraction<IWorkerSpawner>("Core/WorkerSpawner");

export namespace WorkerSpawner {
    export type Interface = IWorkerSpawner;
    export type Options = SpawnOptions;
}
