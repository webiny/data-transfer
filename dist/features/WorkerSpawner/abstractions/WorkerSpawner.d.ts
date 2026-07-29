interface SpawnOptions {
  segment: number;
  totalSegments: number;
  runId: string;
  configPath: string;
  command: string;
}
export interface IWorkerSpawner {
  spawn(options: SpawnOptions): Promise<void>;
}
export declare const WorkerSpawner: import("@webiny/di").Abstraction<IWorkerSpawner>;
export declare namespace WorkerSpawner {
  type Interface = IWorkerSpawner;
  type Options = SpawnOptions;
}
export {};
//# sourceMappingURL=WorkerSpawner.d.ts.map
