import { createAbstraction } from "~/base/index.js";

export interface IDirectoryTool {
    exists(path: string): boolean;
    create(path: string): void;
    readDir(path: string): string[] | null;
    readDirOrThrow(path: string): string[];
    remove(path: string): void;
    copy(source: string, target: string): void;
    copyOrThrow(source: string, target: string): void;
}

export const DirectoryTool = createAbstraction<IDirectoryTool>("Core/DirectoryTool");

export namespace DirectoryTool {
    export type Interface = IDirectoryTool;
}
