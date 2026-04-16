import { describe, it, expect } from "vitest";
import { WorkerSpawner } from "../../../src/features/WorkerSpawner/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("WorkerSpawner Feature", () => {
    describe("DI registration", () => {
        it("should resolve WorkerSpawner from container", () => {
            const container = createDdbContainer();
            const spawner = container.resolve(WorkerSpawner);
            expect(spawner).toBeDefined();
            expect(typeof spawner.spawn).toBe("function");
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(WorkerSpawner)).toBe(container.resolve(WorkerSpawner));
        });
    });
});
