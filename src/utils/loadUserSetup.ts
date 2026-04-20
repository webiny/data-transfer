import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Container } from "@webiny/di";
import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import type { InitDataTransferFn } from "~/utils/initDataTransfer.ts";

const SETUP_FILENAMES: ReadonlyArray<string> = ["setup.ts", "setup.js"];

/**
 * Look for a sibling `setup.ts` next to the user's config file and, if
 * present, dynamic-import it and await its default-exported function with
 * `{ container }`. This runs BEFORE `preset.configure(runner)` so the user
 * can register custom processors / abstractions ahead of preset wiring.
 *
 * The file is entirely optional — pure-config / pure-preset users skip it.
 */
export async function loadUserSetup(
    configPath: string,
    container: Container,
    logger: Logger.Interface
): Promise<void> {
    const absoluteConfigPath = isAbsolute(configPath) ? configPath : resolve(configPath);
    const configDir = dirname(absoluteConfigPath);

    const setupPath = resolveSetupPath(configDir);
    if (!setupPath) {
        return;
    }

    logger.info(`Loading setup from ${setupPath}`);

    const mod = await import(pathToFileURL(setupPath).href);
    const setupFn: unknown = mod.default;

    if (typeof setupFn !== "function") {
        throw new Error(
            `setup.ts at ${setupPath} must export a function as default. ` +
                `Use the initDataTransfer() helper to type it.`
        );
    }

    await (setupFn as InitDataTransferFn)({ container });
}

function resolveSetupPath(configDir: string): string | null {
    for (const filename of SETUP_FILENAMES) {
        const candidate = join(configDir, filename);
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}
