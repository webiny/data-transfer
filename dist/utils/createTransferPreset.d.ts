import type { MigrationPreset } from "../domain/transform/Preset.js";
/**
 * Typed identity helper for user preset files.
 *
 * Usage in user-land:
 * ```typescript
 * // projects/example/my-preset.ts
 * import { createTransferPreset } from "@webiny/data-transfer";
 *
 * export default createTransferPreset({
 *     name: "my-preset",
 *     description: "...",
 *     configure({ runner, pipelineBuilderFactory }) {
 *         // build pipelines, runner.register(...)
 *     }
 * });
 * ```
 *
 * Returning the object verbatim (identity fn) keeps type inference on
 * `configure({...})` without forcing users to import `MigrationPreset`
 * and annotate the literal. Pair with `export default` — the loader
 * picks `default` first, and a consistent convention stops users from
 * reaching for ad-hoc `export const myPreset = ...` forms.
 */
export declare function createTransferPreset(preset: MigrationPreset): MigrationPreset;
//# sourceMappingURL=createTransferPreset.d.ts.map
