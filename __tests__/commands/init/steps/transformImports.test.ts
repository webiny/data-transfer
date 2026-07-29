import { describe, it, expect } from "vitest";
import { transformImports } from "~/commands/init/steps/transformImports.js";

describe("transformImports", () => {
    it("replaces ~/index.ts with @webiny/data-transfer", () => {
        const input = `import { createConfig } from "~/index.js";`;
        expect(transformImports(input)).toBe(
            `import { createConfig } from "@webiny/data-transfer";`
        );
    });

    it("handles single quotes", () => {
        const input = `import { createConfig } from '~/index.ts';`;
        expect(transformImports(input)).toBe(
            `import { createConfig } from '@webiny/data-transfer';`
        );
    });

    it("handles multiple imports in same file", () => {
        const input = [
            `import { createConfig } from "~/index.js";`,
            `import { fromEnv } from "~/index.js";`
        ].join("\n");
        const expected = [
            `import { createConfig } from "@webiny/data-transfer";`,
            `import { fromEnv } from "@webiny/data-transfer";`
        ].join("\n");
        expect(transformImports(input)).toBe(expected);
    });

    it("leaves other imports untouched", () => {
        const input = `import { something } from "other-package";`;
        expect(transformImports(input)).toBe(input);
    });

    it("handles re-exports", () => {
        const input = `export { createConfig } from "~/index.js";`;
        expect(transformImports(input)).toBe(
            `export { createConfig } from "@webiny/data-transfer";`
        );
    });
});
