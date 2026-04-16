import { existsSync, readFileSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import { FileTool as FileToolAbstraction } from "./abstractions/FileTool.ts";
import { DirectoryTool } from "../DirectoryTool/abstractions/DirectoryTool.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";

class FileToolImpl implements FileToolAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly directoryTool: DirectoryTool.Interface
    ) {}

    public exists(path: string): boolean {
        return existsSync(path);
    }

    public readFile(path: string): string | null {
        if (!existsSync(path)) {
            this.logger.warn(`File not found: "${path}"`);
            return null;
        }
        return readFileSync(path, "utf-8");
    }

    public readFileOrThrow(path: string): string {
        if (!existsSync(path)) {
            throw new Error(`File not found: "${path}"`);
        }
        return readFileSync(path, "utf-8");
    }

    public writeFile(path: string, content: string): void {
        try {
            this.directoryTool.create(dirname(path));
            writeFileSync(path, content, "utf-8");
        } catch (error) {
            this.logger.warn(`Failed to write file "${path}": ${error}`);
        }
    }

    public writeFileOrThrow(path: string, content: string): void {
        this.directoryTool.create(dirname(path));
        writeFileSync(path, content, "utf-8");
    }

    public remove(path: string): void {
        rmSync(path, { force: true });
    }

    public copy(source: string, target: string): void {
        if (!existsSync(source)) {
            this.logger.warn(`Source file not found: "${source}"`);
            return;
        }
        this.directoryTool.create(dirname(target));
        copyFileSync(source, target);
    }

    public copyOrThrow(source: string, target: string): void {
        if (!existsSync(source)) {
            throw new Error(`Source file not found: "${source}"`);
        }
        this.directoryTool.create(dirname(target));
        copyFileSync(source, target);
    }
}

export const FileTool = FileToolAbstraction.createImplementation({
    implementation: FileToolImpl,
    dependencies: [Logger, DirectoryTool]
});
