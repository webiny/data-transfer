import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { execa } from "execa";
import { installDeps } from "~/commands/init/steps/installDeps.js";

vi.mock("execa", () => ({
    execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" })
}));

vi.mock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
        ...actual,
        readFileSync: vi.fn()
    };
});

const MOCK_PKG = JSON.stringify({ packageManager: "yarn@4.18.0" });

describe("installDeps", () => {
    const mockExeca = vi.mocked(execa);
    const mockReadFileSync = vi.mocked(readFileSync);

    beforeEach(() => {
        mockExeca.mockClear();
        mockExeca.mockResolvedValue({ stdout: "", stderr: "" } as any);
        mockReadFileSync.mockReturnValue(MOCK_PKG);
    });

    it("checks yarn availability, sets version, then runs yarn install", async () => {
        await installDeps("/tmp/test");
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["--version"], { stdio: "ignore" });
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["set", "version", "4.18.0"], {
            cwd: "/tmp/test",
            stdio: "inherit"
        });
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["install"], {
            cwd: "/tmp/test",
            stdio: "inherit"
        });
    });

    it("tries corepack enable if yarn not found directly", async () => {
        let yarnCheckCount = 0;
        mockExeca.mockImplementation(((cmd: string, args: string[]) => {
            if (cmd === "yarn" && args[0] === "--version") {
                yarnCheckCount++;
                if (yarnCheckCount === 1) {
                    return Promise.reject(new Error("not found"));
                }
            }
            return Promise.resolve({ stdout: "", stderr: "" });
        }) as any);

        await installDeps("/tmp/test");
        expect(mockExeca).toHaveBeenCalledWith("corepack", ["enable"], { stdio: "ignore" });
    });

    it("throws clear error when yarn unavailable", async () => {
        mockExeca.mockImplementation((() => {
            return Promise.reject(new Error("not found"));
        }) as any);

        await expect(installDeps("/tmp/test")).rejects.toThrow(/yarn is required/i);
    });

    it("throws with retry hint on install failure", async () => {
        mockExeca.mockImplementation(((cmd: string, args: string[]) => {
            if (cmd === "yarn" && args[0] === "install") {
                return Promise.reject(new Error("network error"));
            }
            return Promise.resolve({ stdout: "", stderr: "" });
        }) as any);

        await expect(installDeps("/tmp/test")).rejects.toThrow(/yarn install/);
    });
});
