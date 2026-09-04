import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { FileTool } from "../../../src/tools/FileTool/index.ts";
import { createDdbContainer } from "../../containers/index.ts";

describe("FileTool Feature", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "file-tool-test-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    function resolve(): FileTool.Interface {
        return createDdbContainer().resolve(FileTool);
    }

    describe("DI registration", () => {
        it("should resolve from container", () => {
            expect(resolve()).toBeDefined();
        });

        it("should return same instance on multiple resolves", () => {
            const container = createDdbContainer();
            expect(container.resolve(FileTool)).toBe(container.resolve(FileTool));
        });
    });

    describe("exists", () => {
        it("should return true for existing file", () => {
            const filePath = join(tmpDir, "test.txt");
            writeFileSync(filePath, "content");
            expect(resolve().exists(filePath)).toBe(true);
        });

        it("should return false for non-existing file", () => {
            expect(resolve().exists(join(tmpDir, "nonexistent.txt"))).toBe(false);
        });
    });

    describe("readFile", () => {
        it("should return file content", () => {
            const filePath = join(tmpDir, "test.txt");
            writeFileSync(filePath, "hello world");
            expect(resolve().readFile(filePath)).toBe("hello world");
        });

        it("should return null for non-existing file", () => {
            expect(resolve().readFile(join(tmpDir, "nonexistent.txt"))).toBeNull();
        });
    });

    describe("readFileOrThrow", () => {
        it("should return file content", () => {
            const filePath = join(tmpDir, "test.txt");
            writeFileSync(filePath, "content");
            expect(resolve().readFileOrThrow(filePath)).toBe("content");
        });

        it("should throw for non-existing file", () => {
            expect(() => resolve().readFileOrThrow(join(tmpDir, "nonexistent.txt"))).toThrow(
                "File not found"
            );
        });
    });

    describe("writeFile", () => {
        it("should write content to file", () => {
            const filePath = join(tmpDir, "output.txt");
            resolve().writeFile(filePath, "written content");
            expect(readFileSync(filePath, "utf-8")).toBe("written content");
        });

        it("should auto-create parent directories", () => {
            const filePath = join(tmpDir, "nested", "deep", "file.txt");
            resolve().writeFile(filePath, "deep content");
            expect(readFileSync(filePath, "utf-8")).toBe("deep content");
        });

        it("should overwrite existing file", () => {
            const filePath = join(tmpDir, "overwrite.txt");
            writeFileSync(filePath, "original");
            resolve().writeFile(filePath, "updated");
            expect(readFileSync(filePath, "utf-8")).toBe("updated");
        });
    });

    describe("writeFileOrThrow", () => {
        it("should write content to file", () => {
            const filePath = join(tmpDir, "output.txt");
            resolve().writeFileOrThrow(filePath, "thrown content");
            expect(readFileSync(filePath, "utf-8")).toBe("thrown content");
        });
    });

    describe("remove", () => {
        it("should remove existing file", () => {
            const filePath = join(tmpDir, "to-remove.txt");
            writeFileSync(filePath, "content");
            resolve().remove(filePath);
            expect(existsSync(filePath)).toBe(false);
        });

        it("should not throw for non-existing file", () => {
            expect(() => resolve().remove(join(tmpDir, "nonexistent.txt"))).not.toThrow();
        });
    });

    describe("copy", () => {
        it("should copy file to target", () => {
            const source = join(tmpDir, "source.txt");
            writeFileSync(source, "copy me");
            resolve().copy(source, join(tmpDir, "target.txt"));
            expect(readFileSync(join(tmpDir, "target.txt"), "utf-8")).toBe("copy me");
        });

        it("should auto-create target parent directories", () => {
            const source = join(tmpDir, "source.txt");
            writeFileSync(source, "nested copy");
            resolve().copy(source, join(tmpDir, "nested", "dir", "target.txt"));
            expect(readFileSync(join(tmpDir, "nested", "dir", "target.txt"), "utf-8")).toBe(
                "nested copy"
            );
        });

        it("should not throw for non-existing source", () => {
            expect(() =>
                resolve().copy(join(tmpDir, "nonexistent.txt"), join(tmpDir, "target.txt"))
            ).not.toThrow();
        });
    });

    describe("copyOrThrow", () => {
        it("should throw for non-existing source", () => {
            expect(() =>
                resolve().copyOrThrow(join(tmpDir, "nonexistent.txt"), join(tmpDir, "target.txt"))
            ).toThrow("Source file not found");
        });
    });

    describe("appendLineOrThrow", () => {
        it("creates the file and parent directory, then appends one line per call", () => {
            const filePath = join(tmpDir, "nested", "report.jsonl");
            const tool = resolve();

            tool.appendLineOrThrow(filePath, '{"a":1}');
            tool.appendLineOrThrow(filePath, '{"b":2}');

            expect(readFileSync(filePath, "utf-8")).toBe('{"a":1}\n{"b":2}\n');
        });
    });
});
