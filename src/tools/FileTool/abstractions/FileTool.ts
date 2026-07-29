import { createAbstraction } from "~/base/index.js";

interface IFileTool {
    exists(path: string): boolean;
    readFile(path: string): string | null;
    readFileOrThrow(path: string): string;
    writeFile(path: string, content: string): void;
    writeFileOrThrow(path: string, content: string): void;
    remove(path: string): void;
    copy(source: string, target: string): void;
    copyOrThrow(source: string, target: string): void;
}

export const FileTool = createAbstraction<IFileTool>("Core/FileTool");

export namespace FileTool {
    export type Interface = IFileTool;
}
