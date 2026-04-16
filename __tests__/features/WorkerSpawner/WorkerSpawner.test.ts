import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { WorkerSpawner, WorkerSpawnerFeature } from "../../../src/features/WorkerSpawner/index.ts";
import { LoggerFeature } from "../../../src/features/Logger/index.ts";

describe("WorkerSpawner Feature", () => {
    function createContainer(): Container {
        const container = new Container();
        LoggerFeature.register(container, { logLevel: "error", json: false });
        WorkerSpawnerFeature.register(container);
        return container;
    }

    describe("DI registration", () => {
        it("should resolve WorkerSpawner from container", () => {
            const container = createContainer();
            const spawner = container.resolve(WorkerSpawner);
            expect(spawner).toBeDefined();
            expect(typeof spawner.spawn).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createContainer();
            const first = container.resolve(WorkerSpawner);
            const second = container.resolve(WorkerSpawner);
            expect(first).toBe(second);
        });
    });
});
