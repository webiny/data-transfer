import { createFeature } from "~/base/index.ts";
import { WorkerSpawner } from "./WorkerSpawner.ts";

export const WorkerSpawnerFeature = createFeature({
    name: "Core/WorkerSpawnerFeature",
    register(container) {
        container.register(WorkerSpawner).inSingletonScope();
    }
});
