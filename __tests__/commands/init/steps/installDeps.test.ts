import { describe, it, expect, vi, beforeEach } from "vitest";
import { execa } from "execa";
import { installDeps } from "~/commands/init/steps/installDeps.ts";

vi.mock("execa", () => ({
    execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" })
}));

describe("installDeps", () => {
    const mockExeca = vi.mocked(execa);

    beforeEach(() => {
        mockExeca.mockClear();
        mockExeca.mockResolvedValue({ stdout: "", stderr: "" } as any);
    });

    it("runs npm install for npm", async () => {
        await installDeps("/tmp/test", "npm");
        expect(mockExeca).toHaveBeenCalledWith("npm", ["install"], {
            cwd: "/tmp/test",
            stdio: "inherit"
        });
    });

    it("runs pnpm install for pnpm", async () => {
        await installDeps("/tmp/test", "pnpm");
        expect(mockExeca).toHaveBeenCalledWith("pnpm", ["install"], {
            cwd: "/tmp/test",
            stdio: "inherit"
        });
    });

    it("attempts corepack enable then yarn install for yarn", async () => {
        await installDeps("/tmp/test", "yarn");
        expect(mockExeca).toHaveBeenCalledWith("corepack", ["enable"], {
            cwd: "/tmp/test",
            stdio: "inherit"
        });
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["install"], {
            cwd: "/tmp/test",
            stdio: "inherit"
        });
    });

    it("continues yarn install even if corepack fails", async () => {
        mockExeca.mockImplementation(((cmd: string) => {
            if (cmd === "corepack") {
                return Promise.reject(new Error("corepack not found"));
            }
            return Promise.resolve({ stdout: "", stderr: "" });
        }) as any);

        await installDeps("/tmp/test", "yarn");
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["install"], {
            cwd: "/tmp/test",
            stdio: "inherit"
        });
    });

    it("throws with hint on install failure", async () => {
        mockExeca.mockImplementation(((cmd: string) => {
            if (cmd === "npm") {
                return Promise.reject(new Error("network error"));
            }
            return Promise.resolve({ stdout: "", stderr: "" });
        }) as any);

        await expect(installDeps("/tmp/test", "npm")).rejects.toThrow(/npm install/);
    });
});
