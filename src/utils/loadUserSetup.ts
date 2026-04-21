import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Container } from "@webiny/di";
import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import type { InitDataTransferFn } from "~/utils/initDataTransfer.ts";

const SETUP_FILENAME = "setup.ts";

/**
 * Look for a sibling `setup.ts` next to the user's config file and, if
 * present, dynamic-import it and await its default-exported function with
 * `{ container }`. This runs BEFORE `preset.configure(runner)` so the user
 * can register custom processors / abstractions ahead of preset wiring.
 *
 * The file is entirely optional — pure-config / pure-preset users skip it.
 * Only `.ts` is supported; all user code in this project is typed.
 */
export async function loadUserSetup(
    configPath: string,
    container: Container,
    logger: Logger.Interface
): Promise<void> {
    const absoluteConfigPath = isAbsolute(configPath) ? configPath : resolve(configPath);
    const configDir = dirname(absoluteConfigPath);

    const setupPath = join(configDir, SETUP_FILENAME);
    if (!container.resolve(FileTool).exists(setupPath)) {
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
