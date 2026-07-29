import type { Container } from "@webiny/di";
import type { Logger } from "../tools/Logger/abstractions/Logger.js";
/**
 * Look for a sibling `setup.ts` next to the user's config file and, if
 * present, dynamic-import it and await its default-exported function with
 * `{ container }`. This runs BEFORE `preset.configure(runner)` so the user
 * can register custom processors / abstractions ahead of preset wiring.
 *
 * The file is entirely optional — pure-config / pure-preset users skip it.
 * Only `.ts` is supported; all user code in this project is typed.
 */
export declare function loadUserSetup(
  configPath: string,
  container: Container,
  logger: Logger.Interface
): Promise<void>;
//# sourceMappingURL=loadUserSetup.d.ts.map
