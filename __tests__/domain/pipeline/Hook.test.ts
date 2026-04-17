import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { Hook } from "~/domain/pipeline/index.ts";

class FakeHook implements Hook.Interface {
    public readonly calls: Array<{ runId: string; mergeGroupId: string }> = [];

    public async run(params: { runId: string; mergeGroupId: string }): Promise<void> {
        this.calls.push(params);
    }
}

const TestHook = Hook.createImplementation({
    implementation: FakeHook,
    dependencies: []
});

describe("Hook abstraction", () => {
    it("is registrable and resolvable via the DI container", () => {
        const container = new Container();
        container.register(TestHook).inSingletonScope();
        const hook = container.resolve(Hook);
        expect(hook).toBeInstanceOf(FakeHook);
    });

    it("receives runId and mergeGroupId when run is invoked", async () => {
        const container = new Container();
        container.register(TestHook).inSingletonScope();
        const hook = container.resolve(Hook) as FakeHook;

        await hook.run({ runId: "run-1", mergeGroupId: "ddb-group" });
        await hook.run({ runId: "run-1", mergeGroupId: "os-group" });

        expect(hook.calls).toHaveLength(2);
        expect(hook.calls[0]).toEqual({ runId: "run-1", mergeGroupId: "ddb-group" });
        expect(hook.calls[1]).toEqual({ runId: "run-1", mergeGroupId: "os-group" });
    });
});
