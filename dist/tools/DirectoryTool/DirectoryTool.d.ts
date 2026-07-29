import { DirectoryTool as DirectoryToolAbstraction } from "./abstractions/DirectoryTool.ts";
import { Logger } from "../Logger/abstractions/Logger.ts";
export type { IDirectoryTool } from "./abstractions/DirectoryTool.js";
declare class DirectoryToolImpl implements DirectoryToolAbstraction.Interface {
  private readonly logger;
  constructor(logger: Logger.Interface);
  exists(path: string): boolean;
  create(path: string): void;
  readDir(path: string): string[] | null;
  readDirOrThrow(path: string): string[];
  remove(path: string): void;
  copy(source: string, target: string): void;
  copyOrThrow(source: string, target: string): void;
}
export declare const DirectoryTool: typeof DirectoryToolImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/DirectoryTool.ts").IDirectoryTool
  >;
};
//# sourceMappingURL=DirectoryTool.d.ts.map
