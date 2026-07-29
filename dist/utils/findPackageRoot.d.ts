/**
 * Walk up from `startDir` looking for the `package.json` belonging to
 * `@webiny/data-transfer` itself.
 *
 * Hardcoded `".."` chains from `import.meta.url` break across contexts:
 * they count the `src/` prefix depth, which changes after compilation
 * (`src/` stripped, files live in `dist/`) and after publish (`dist/`
 * becomes the package root). Walking up to the nearest matching
 * `package.json` works in source (tsx), compiled (dist/), and installed
 * (npm) contexts alike.
 *
 * @example
 *   const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
 */
export declare function findPackageRoot(startDir: string): string;
//# sourceMappingURL=findPackageRoot.d.ts.map
