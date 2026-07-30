import { describe, it, expect } from "vitest";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.js";

describe("ContainerToken", () => {
    it("resolves to the container instance it was registered with", () => {
        const container = new Container();
        container.registerInstance(ContainerToken, container);

        const resolved = container.resolve(ContainerToken);
        expect(resolved).toBe(container);
    });

    it("returns the same reference on repeated resolves", () => {
        const container = new Container();
        container.registerInstance(ContainerToken, container);

        expect(container.resolve(ContainerToken)).toBe(container.resolve(ContainerToken));
    });
});
