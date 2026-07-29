import { WorkerSpawner as WorkerSpawnerAbstraction } from "./abstractions/WorkerSpawner.ts";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
export type { IWorkerSpawner } from "./abstractions/WorkerSpawner.js";
declare class WorkerSpawnerImpl implements WorkerSpawnerAbstraction.Interface {
  private readonly logger;
  private readonly binPath;
  constructor(logger: Logger.Interface);
  spawn(options: WorkerSpawnerAbstraction.Options): Promise<void>;
}
export declare const WorkerSpawner: typeof WorkerSpawnerImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/WorkerSpawner.ts").IWorkerSpawner
  >;
};
//# sourceMappingURL=WorkerSpawner.d.ts.map
