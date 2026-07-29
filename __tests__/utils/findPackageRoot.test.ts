import { describe, it, expect } from "vitest";
import { findPackageRoot } from "~/utils/findPackageRoot.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

describe("findPackageRoot", () => {
    it("finds the package root from a nested source directory", () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const root = findPackageRoot(here);
        expect(root).toMatch(/data-transfer$/);
    });

    it("throws when no matching package.json is found", () => {
        expect(() => findPackageRoot("/")).toThrow(
            "Could not find @webiny/data-transfer package root"
        );
    });
});
