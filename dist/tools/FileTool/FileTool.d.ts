import { FileTool as FileToolAbstraction } from "./abstractions/FileTool.ts";
import { DirectoryTool } from "../DirectoryTool/abstractions/DirectoryTool.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";
export type { IFileTool } from "./abstractions/FileTool.js";
declare class FileToolImpl implements FileToolAbstraction.Interface {
  private readonly logger;
  private readonly directoryTool;
  constructor(logger: Logger.Interface, directoryTool: DirectoryTool.Interface);
  exists(path: string): boolean;
  readFile(path: string): string | null;
  readFileOrThrow(path: string): string;
  writeFile(path: string, content: string): void;
  writeFileOrThrow(path: string, content: string): void;
  remove(path: string): void;
  copy(source: string, target: string): void;
  copyOrThrow(source: string, target: string): void;
}
export declare const FileTool: typeof FileToolImpl & {
  __abstraction: import("@webiny/di").Abstraction<import("./abstractions/FileTool.ts").IFileTool>;
};
//# sourceMappingURL=FileTool.d.ts.map
