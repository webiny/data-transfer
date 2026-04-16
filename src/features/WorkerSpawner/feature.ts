import { createFeature } from "@/src/base/index.ts";
import { WorkerSpawnerImpl } from "./WorkerSpawner.ts";
import { WorkerSpawner } from "./abstractions/WorkerSpawner.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";

export const WorkerSpawnerFeature = createFeature({
    name: "Core/WorkerSpawnerFeature",
    register(container) {
        const logger = container.resolve(Logger);
        const spawner = new WorkerSpawnerImpl(logger);
        container.registerInstance(WorkerSpawner, spawner);
    }
});
