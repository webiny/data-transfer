import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { Container } from "@webiny/di";
import { FileTool, FileToolFeature } from "../../../src/features/FileTool/index.ts";
import { DirectoryToolFeature } from "../../../src/features/DirectoryTool/index.ts";
import { LoggerFeature } from "../../../src/features/Logger/index.ts";

describe("FileTool Feature", () => {
    let tmpDir: string;

    function createContainer(): Container {
        const container = new Container();
        LoggerFeature.register(container, { logLevel: "error", json: false });
        DirectoryToolFeature.register(container);
        FileToolFeature.register(container);
        return container;
    }

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "file-tool-test-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    describe("DI registration", () => {
        it("should resolve from container", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);
            expect(tool).toBeDefined();
        });

        it("should return same instance on multiple resolves", () => {
            const container = createContainer();
            const first = container.resolve(FileTool);
            const second = container.resolve(FileTool);
            expect(first).toBe(second);
        });
    });

    describe("exists", () => {
        it("should return true for existing file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const filePath = join(tmpDir, "test.txt");
            writeFileSync(filePath, "content");

            expect(tool.exists(filePath)).toBe(true);
        });

        it("should return false for non-existing file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            expect(tool.exists(join(tmpDir, "nonexistent.txt"))).toBe(false);
        });
    });

    describe("readFile", () => {
        it("should return file content", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const filePath = join(tmpDir, "test.txt");
            writeFileSync(filePath, "hello world");

            expect(tool.readFile(filePath)).toBe("hello world");
        });

        it("should return null for non-existing file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            expect(tool.readFile(join(tmpDir, "nonexistent.txt"))).toBeNull();
        });
    });

    describe("readFileOrThrow", () => {
        it("should return file content", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const filePath = join(tmpDir, "test.txt");
            writeFileSync(filePath, "content");

            expect(tool.readFileOrThrow(filePath)).toBe("content");
        });

        it("should throw for non-existing file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            expect(() => tool.readFileOrThrow(join(tmpDir, "nonexistent.txt"))).toThrow(
                "File not found"
            );
        });
    });

    describe("writeFile", () => {
        it("should write content to file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const filePath = join(tmpDir, "output.txt");
            tool.writeFile(filePath, "written content");

            expect(readFileSync(filePath, "utf-8")).toBe("written content");
        });

        it("should auto-create parent directories", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const filePath = join(tmpDir, "nested", "deep", "file.txt");
            tool.writeFile(filePath, "deep content");

            expect(readFileSync(filePath, "utf-8")).toBe("deep content");
        });

        it("should overwrite existing file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const filePath = join(tmpDir, "overwrite.txt");
            writeFileSync(filePath, "original");
            tool.writeFile(filePath, "updated");

            expect(readFileSync(filePath, "utf-8")).toBe("updated");
        });
    });

    describe("writeFileOrThrow", () => {
        it("should write content to file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const filePath = join(tmpDir, "output.txt");
            tool.writeFileOrThrow(filePath, "thrown content");

            expect(readFileSync(filePath, "utf-8")).toBe("thrown content");
        });
    });

    describe("remove", () => {
        it("should remove existing file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const filePath = join(tmpDir, "to-remove.txt");
            writeFileSync(filePath, "content");

            tool.remove(filePath);

            expect(existsSync(filePath)).toBe(false);
        });

        it("should not throw for non-existing file", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            expect(() => tool.remove(join(tmpDir, "nonexistent.txt"))).not.toThrow();
        });
    });

    describe("copy", () => {
        it("should copy file to target", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const source = join(tmpDir, "source.txt");
            writeFileSync(source, "copy me");

            const target = join(tmpDir, "target.txt");
            tool.copy(source, target);

            expect(readFileSync(target, "utf-8")).toBe("copy me");
        });

        it("should auto-create target parent directories", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            const source = join(tmpDir, "source.txt");
            writeFileSync(source, "nested copy");

            const target = join(tmpDir, "nested", "dir", "target.txt");
            tool.copy(source, target);

            expect(readFileSync(target, "utf-8")).toBe("nested copy");
        });

        it("should not throw for non-existing source", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            expect(() =>
                tool.copy(join(tmpDir, "nonexistent.txt"), join(tmpDir, "target.txt"))
            ).not.toThrow();
        });
    });

    describe("copyOrThrow", () => {
        it("should throw for non-existing source", () => {
            const container = createContainer();
            const tool = container.resolve(FileTool);

            expect(() =>
                tool.copyOrThrow(join(tmpDir, "nonexistent.txt"), join(tmpDir, "target.txt"))
            ).toThrow("Source file not found");
        });
    });
});
