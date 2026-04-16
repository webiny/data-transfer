import { createAbstraction } from "@/src/base/index.ts";

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
