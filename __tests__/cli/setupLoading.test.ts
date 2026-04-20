import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Container } from "@webiny/di";
import { loadUserSetup } from "../../src/utils/loadUserSetup.ts";
import { createAbstraction } from "../../src/base/createAbstraction.ts";
import type { Logger } from "../../src/tools/Logger/abstractions/Logger.ts";

interface MarkerShape {
    name: string;
}

const Marker = createAbstraction<MarkerShape>("Test/SetupMarker");

function createTestLogger(): Logger.Interface {
    const noop = (): void => {};
    const logger: Logger.Interface = {
        debug: noop,
        info: noop,
        warn: noop,
        error: noop,
        fatal: noop,
        done: noop,
        child: () => logger
    };
    return logger;
}

describe("CLI setup.ts loading", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), "setup-loading-"));
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it("is a no-op when setup.ts is absent", async () => {
        const configPath = join(workDir, "my.config.ts");
        await writeFile(configPath, "export default {};", "utf-8");

        const container = new Container();
        const logger = createTestLogger();
        const infoSpy = vi.spyOn(logger, "info");

        await expect(loadUserSetup(configPath, container, logger)).resolves.toBeUndefined();
        expect(infoSpy).not.toHaveBeenCalled();
    });

    it("imports setup.ts sibling and runs default export with { container }", async () => {
        const configPath = join(workDir, "my.config.ts");
        await writeFile(configPath, "export default {};", "utf-8");

        // Expose the shared marker abstraction through a global so both the
        // test and the user-land setup.ts register/resolve under the same
        // Abstraction instance (importing the same file twice under tsx can
        // yield distinct module records, which would defeat the test).
        const globals = globalThis as unknown as { __SETUP_TEST_MARKER?: typeof Marker };
        globals.__SETUP_TEST_MARKER = Marker;

        const setupPath = join(workDir, "setup.ts");
        await writeFile(
            setupPath,
            `export default async ({ container }) => {\n` +
                `    const marker = globalThis.__SETUP_TEST_MARKER;\n` +
                `    container.registerInstance(marker, { name: "registered-by-setup" });\n` +
                `};\n`,
            "utf-8"
        );

        const container = new Container();
        const logger = createTestLogger();
        const infoSpy = vi.spyOn(logger, "info");

        try {
            await loadUserSetup(configPath, container, logger);

            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(setupPath));

            const resolved = container.resolve(Marker);
            expect(resolved).toEqual({ name: "registered-by-setup" });
        } finally {
            delete globals.__SETUP_TEST_MARKER;
        }
    });

    it("throws a helpful error when default export is not a function", async () => {
        const configPath = join(workDir, "my.config.ts");
        await writeFile(configPath, "export default {};", "utf-8");

        const setupPath = join(workDir, "setup.ts");
        await writeFile(setupPath, "export default { not: 'a function' };", "utf-8");

        const container = new Container();
        const logger = createTestLogger();

        await expect(loadUserSetup(configPath, container, logger)).rejects.toThrow(
            /must export a function as default/
        );
    });
});
