import type { Container } from "@webiny/di";

export interface InitDataTransferContext {
    container: Container;
}

export type InitDataTransferFn = (ctx: InitDataTransferContext) => void | Promise<void>;

/**
 * Typed identity helper for the user's `setup.ts` file.
 *
 * Usage in user-land:
 * ```typescript
 * // projects/example/setup.ts
 * import { initDataTransfer } from "@webiny/data-transfer";
 * import { MyProcessor } from "./processors/myProcessor.ts";
 *
 * export default initDataTransfer(async ({ container }) => {
 *     container.register(MyProcessor);
 * });
 * ```
 *
 * The CLI looks for `setup.ts` next to the config file; if present, it
 * dynamic-imports the default export and awaits `fn({ container })`
 * BEFORE the preset's `configure(runner)` runs.
 */
export function initDataTransfer(fn: InitDataTransferFn): InitDataTransferFn {
    return fn;
}
