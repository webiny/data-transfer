import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { Container } from "@webiny/di";
import { DirectoryTool, DirectoryToolFeature } from "../../../src/features/DirectoryTool/index.ts";
import { LoggerFeature } from "../../../src/features/Logger/index.ts";

describe("DirectoryTool Feature", () => {
    let tmpDir: string;

    function createContainer(): Container {
        const container = new Container();
        LoggerFeature.register(container, { logLevel: "error", json: false });
        DirectoryToolFeature.register(container);
        return container;
    }

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "dir-tool-test-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    describe("DI registration", () => {
        it("should resolve from container", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);
            expect(tool).toBeDefined();
        });

        it("should return same instance on multiple resolves", () => {
            const container = createContainer();
            const first = container.resolve(DirectoryTool);
            const second = container.resolve(DirectoryTool);
            expect(first).toBe(second);
        });
    });

    describe("exists", () => {
        it("should return true for existing directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);
            expect(tool.exists(tmpDir)).toBe(true);
        });

        it("should return false for non-existing directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);
            expect(tool.exists(join(tmpDir, "nonexistent"))).toBe(false);
        });
    });

    describe("create", () => {
        it("should create a new directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);
            const newDir = join(tmpDir, "new-dir");

            tool.create(newDir);

            expect(existsSync(newDir)).toBe(true);
        });

        it("should create nested directories", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);
            const nested = join(tmpDir, "a", "b", "c");

            tool.create(nested);

            expect(existsSync(nested)).toBe(true);
        });

        it("should be a no-op for existing directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            tool.create(tmpDir);

            expect(existsSync(tmpDir)).toBe(true);
        });
    });

    describe("readDir", () => {
        it("should return filenames in directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            writeFileSync(join(tmpDir, "a.txt"), "a");
            writeFileSync(join(tmpDir, "b.txt"), "b");

            const files = tool.readDir(tmpDir);
            expect(files).not.toBeNull();
            expect(files!.sort()).toEqual(["a.txt", "b.txt"]);
        });

        it("should return null for non-existing directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            const result = tool.readDir(join(tmpDir, "nonexistent"));
            expect(result).toBeNull();
        });

        it("should return empty array for empty directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            const emptyDir = join(tmpDir, "empty");
            mkdirSync(emptyDir);

            const files = tool.readDir(emptyDir);
            expect(files).toEqual([]);
        });
    });

    describe("readDirOrThrow", () => {
        it("should return filenames in directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            writeFileSync(join(tmpDir, "file.txt"), "content");

            const files = tool.readDirOrThrow(tmpDir);
            expect(files).toContain("file.txt");
        });

        it("should throw for non-existing directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            expect(() => tool.readDirOrThrow(join(tmpDir, "nonexistent"))).toThrow(
                "Directory not found"
            );
        });
    });

    describe("remove", () => {
        it("should remove existing directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            const dir = join(tmpDir, "to-remove");
            mkdirSync(dir);
            writeFileSync(join(dir, "file.txt"), "content");

            tool.remove(dir);

            expect(existsSync(dir)).toBe(false);
        });

        it("should not throw for non-existing directory", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            expect(() => tool.remove(join(tmpDir, "nonexistent"))).not.toThrow();
        });
    });

    describe("copy", () => {
        it("should copy directory recursively", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            const source = join(tmpDir, "source");
            mkdirSync(source);
            writeFileSync(join(source, "file.txt"), "hello");

            const target = join(tmpDir, "target");

            tool.copy(source, target);

            expect(existsSync(join(target, "file.txt"))).toBe(true);
        });

        it("should not throw for non-existing source", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            expect(() =>
                tool.copy(join(tmpDir, "nonexistent"), join(tmpDir, "target"))
            ).not.toThrow();
        });
    });

    describe("copyOrThrow", () => {
        it("should throw for non-existing source", () => {
            const container = createContainer();
            const tool = container.resolve(DirectoryTool);

            expect(() =>
                tool.copyOrThrow(join(tmpDir, "nonexistent"), join(tmpDir, "target"))
            ).toThrow("Source directory not found");
        });
    });
});
