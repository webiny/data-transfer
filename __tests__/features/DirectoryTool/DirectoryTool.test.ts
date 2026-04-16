import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DirectoryTool } from "../../../src/features/DirectoryTool/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("DirectoryTool Feature", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "dir-tool-test-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    function resolve(): DirectoryTool.Interface {
        return createDdbContainer().resolve(DirectoryTool);
    }

    describe("DI registration", () => {
        it("should resolve from container", () => {
            expect(resolve()).toBeDefined();
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(DirectoryTool)).toBe(container.resolve(DirectoryTool));
        });
    });

    describe("exists", () => {
        it("should return true for existing directory", () => {
            expect(resolve().exists(tmpDir)).toBe(true);
        });

        it("should return false for non-existing directory", () => {
            expect(resolve().exists(join(tmpDir, "nonexistent"))).toBe(false);
        });
    });

    describe("create", () => {
        it("should create a new directory", () => {
            const newDir = join(tmpDir, "new-dir");
            resolve().create(newDir);
            expect(existsSync(newDir)).toBe(true);
        });

        it("should create nested directories", () => {
            const nested = join(tmpDir, "a", "b", "c");
            resolve().create(nested);
            expect(existsSync(nested)).toBe(true);
        });

        it("should be a no-op for existing directory", () => {
            resolve().create(tmpDir);
            expect(existsSync(tmpDir)).toBe(true);
        });
    });

    describe("readDir", () => {
        it("should return filenames in directory", () => {
            writeFileSync(join(tmpDir, "a.txt"), "a");
            writeFileSync(join(tmpDir, "b.txt"), "b");

            const files = resolve().readDir(tmpDir);
            expect(files).not.toBeNull();
            expect(files!.sort()).toEqual(["a.txt", "b.txt"]);
        });

        it("should return null for non-existing directory", () => {
            expect(resolve().readDir(join(tmpDir, "nonexistent"))).toBeNull();
        });

        it("should return empty array for empty directory", () => {
            const emptyDir = join(tmpDir, "empty");
            mkdirSync(emptyDir);
            expect(resolve().readDir(emptyDir)).toEqual([]);
        });
    });

    describe("readDirOrThrow", () => {
        it("should return filenames in directory", () => {
            writeFileSync(join(tmpDir, "file.txt"), "content");
            expect(resolve().readDirOrThrow(tmpDir)).toContain("file.txt");
        });

        it("should throw for non-existing directory", () => {
            expect(() => resolve().readDirOrThrow(join(tmpDir, "nonexistent"))).toThrow(
                "Directory not found"
            );
        });
    });

    describe("remove", () => {
        it("should remove existing directory", () => {
            const dir = join(tmpDir, "to-remove");
            mkdirSync(dir);
            writeFileSync(join(dir, "file.txt"), "content");

            resolve().remove(dir);
            expect(existsSync(dir)).toBe(false);
        });

        it("should not throw for non-existing directory", () => {
            expect(() => resolve().remove(join(tmpDir, "nonexistent"))).not.toThrow();
        });
    });

    describe("copy", () => {
        it("should copy directory recursively", () => {
            const source = join(tmpDir, "source");
            mkdirSync(source);
            writeFileSync(join(source, "file.txt"), "hello");

            resolve().copy(source, join(tmpDir, "target"));
            expect(existsSync(join(tmpDir, "target", "file.txt"))).toBe(true);
        });

        it("should not throw for non-existing source", () => {
            expect(() =>
                resolve().copy(join(tmpDir, "nonexistent"), join(tmpDir, "target"))
            ).not.toThrow();
        });
    });

    describe("copyOrThrow", () => {
        it("should throw for non-existing source", () => {
            expect(() =>
                resolve().copyOrThrow(join(tmpDir, "nonexistent"), join(tmpDir, "target"))
            ).toThrow("Source directory not found");
        });
    });
});
