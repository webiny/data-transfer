import type { InitOptions } from "../types.ts";
interface PromptArgs {
  projectName: string;
  preset?: string;
  pm?: string;
  projectsDir: string;
}
export declare function promptOptions(args: PromptArgs): Promise<InitOptions>;
export {};
//# sourceMappingURL=promptOptions.d.ts.map
