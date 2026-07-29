import { describe, it, expect, vi, beforeEach } from "vitest";
import { execa } from "execa";
import { installDeps } from "~/commands/init/steps/installDeps.js";

vi.mock("execa", () => ({
    execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" })
}));

describe("installDeps", () => {
    const mockExeca = vi.mocked(execa);

    beforeEach(() => {
        mockExeca.mockClear();
        mockExeca.mockResolvedValue({ stdout: "", stderr: "" } as any);
    });

    it("checks yarn availability then runs yarn install", async () => {
        await installDeps("/tmp/test");
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["--version"], { stdio: "ignore" });
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

    it("continues yarn install even if corepack enable fails before install", async () => {
        let callCount = 0;
        mockExeca.mockImplementation(((cmd: string, args: string[]) => {
            callCount++;
            if (cmd === "corepack" && args[0] === "enable" && callCount > 2) {
                return Promise.reject(new Error("corepack failed"));
            }
            return Promise.resolve({ stdout: "", stderr: "" });
        }) as any);

        await installDeps("/tmp/test");
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["install"], {
            cwd: "/tmp/test",
            stdio: "inherit"
        });
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
