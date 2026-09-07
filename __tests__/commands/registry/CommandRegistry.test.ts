import { describe, it, expect } from "vitest";
import type { Argv } from "yargs";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.js";
import { Command } from "~/commands/registry/abstractions/Command.js";
import { CommandRegistry } from "~/commands/registry/abstractions/CommandRegistry.js";
import { CommandRegistryFeature } from "~/commands/registry/feature.js";

let constructed = 0;

class VisibleCommandImpl implements Command.Interface {
    public readonly name = "visible";
    public readonly description = "A visible command";
    public constructor() {
        constructed++;
    }
    public configure(yargs: Argv): Argv {
        return yargs;
    }
    public async run(): Promise<number> {
        return 0;
    }
}

class HiddenCommandImpl implements Command.Interface {
    public readonly name = "hidden <arg>";
    public readonly description = "A hidden command";
    public readonly hidden = true;
    public constructor() {
        constructed++;
    }
    public configure(yargs: Argv): Argv {
        return yargs;
    }
    public async run(): Promise<number> {
        return 7;
    }
}

const VisibleCommand = Command.createImplementation({
    implementation: VisibleCommandImpl,
    dependencies: []
});
const HiddenCommand = Command.createImplementation({
    implementation: HiddenCommandImpl,
    dependencies: []
});

function createContainer(): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.register(VisibleCommand).inSingletonScope();
    container.register(HiddenCommand).inSingletonScope();
    CommandRegistryFeature.register(container);
    return container;
}

describe("CommandRegistry", () => {
    it("lists every command in registration order", () => {
        const registry = createContainer().resolve(CommandRegistry);
        expect(registry.list().map(c => c.name)).toEqual(["visible", "hidden <arg>"]);
    });

    it("menu() excludes hidden commands", () => {
        const registry = createContainer().resolve(CommandRegistry);
        expect(registry.menu().map(c => c.name)).toEqual(["visible"]);
    });

    it("get() matches on the first token of the yargs command string", () => {
        const registry = createContainer().resolve(CommandRegistry);
        expect(registry.get("hidden").description).toBe("A hidden command");
    });

    it("get() throws for unknown names", () => {
        const registry = createContainer().resolve(CommandRegistry);
        expect(() => registry.get("nope")).toThrow(/Unknown command "nope"/);
    });

    it("resolves commands lazily on first access", () => {
        constructed = 0;
        const registry = createContainer().resolve(CommandRegistry);
        expect(constructed).toBe(0);
        registry.list();
        registry.list();
        expect(constructed).toBe(2);
    });
});
