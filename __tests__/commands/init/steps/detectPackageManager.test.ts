import { describe, it, expect, afterEach } from "vitest";
import { detectPackageManager } from "~/commands/init/steps/detectPackageManager.ts";

describe("detectPackageManager", () => {
    const original = process.env["npm_config_user_agent"];

    afterEach(() => {
        if (original === undefined) {
            delete process.env["npm_config_user_agent"];
        } else {
            process.env["npm_config_user_agent"] = original;
        }
    });

    it("detects yarn", () => {
        process.env["npm_config_user_agent"] = "yarn/4.17.1 npm/? node/v24.0.0";
        expect(detectPackageManager()).toBe("yarn");
    });

    it("detects npm", () => {
        process.env["npm_config_user_agent"] = "npm/10.0.0 node/v24.0.0";
        expect(detectPackageManager()).toBe("npm");
    });

    it("detects pnpm", () => {
        process.env["npm_config_user_agent"] = "pnpm/9.0.0 npm/? node/v24.0.0";
        expect(detectPackageManager()).toBe("pnpm");
    });

    it("defaults to npm when env var is missing", () => {
        delete process.env["npm_config_user_agent"];
        expect(detectPackageManager()).toBe("npm");
    });

    it("defaults to npm for unknown agents", () => {
        process.env["npm_config_user_agent"] = "bun/1.0.0";
        expect(detectPackageManager()).toBe("npm");
    });
});
