import {
    existsSync,
    mkdirSync,
    readdirSync,
    rmSync,
    cpSync,
    chmodSync,
    accessSync,
    constants
} from "node:fs";
import { dirname } from "node:path";
import { DirectoryTool as DirectoryToolAbstraction } from "./abstractions/DirectoryTool.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";

export type { IDirectoryTool } from "./abstractions/DirectoryTool.js";

class DirectoryToolImpl implements DirectoryToolAbstraction.Interface {
    public constructor(private readonly logger: Logger.Interface) {}

    public exists(path: string): boolean {
        return existsSync(path);
    }

    public create(path: string): void {
        try {
            if (existsSync(path)) {
                try {
                    accessSync(path, constants.W_OK);
                } catch {
                    chmodSync(path, 0o755);
                }
                return;
            }
            mkdirSync(path, { recursive: true, mode: 0o755 });
        } catch (error) {
            this.logger.warn(`Failed to create directory "${path}": ${error}`);
        }
    }

    public readDir(path: string): string[] | null {
        if (!existsSync(path)) {
            this.logger.warn(`Directory not found: "${path}"`);
            return null;
        }
        return readdirSync(path);
    }

    public readDirOrThrow(path: string): string[] {
        if (!existsSync(path)) {
            throw new Error(`Directory not found: "${path}"`);
        }
        return readdirSync(path);
    }

    public remove(path: string): void {
        rmSync(path, { recursive: true, force: true });
    }

    public copy(source: string, target: string): void {
        if (!existsSync(source)) {
            this.logger.warn(`Source directory not found: "${source}"`);
            return;
        }
        this.create(dirname(target));
        cpSync(source, target, { recursive: true });
    }

    public copyOrThrow(source: string, target: string): void {
        if (!existsSync(source)) {
            throw new Error(`Source directory not found: "${source}"`);
        }
        this.create(dirname(target));
        cpSync(source, target, { recursive: true });
    }
}

export const DirectoryTool = DirectoryToolAbstraction.createImplementation({
    implementation: DirectoryToolImpl,
    dependencies: [Logger]
});
