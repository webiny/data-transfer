import { SourceDynamoDbClient } from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { ModelProvider as ModelProviderAbstraction } from "./abstractions/ModelProvider.ts";
export type { IModelProvider } from "./abstractions/ModelProvider.js";
declare class ModelProviderImpl implements ModelProviderAbstraction.Interface {
  private readonly database;
  private readonly logger;
  private readonly dirTool;
  private readonly fileTool;
  private models;
  private readonly tableName;
  private readonly modelsDir?;
  constructor(
    database: SourceDynamoDbClient.Interface,
    logger: Logger.Interface,
    dirTool: DirectoryTool.Interface,
    fileTool: FileTool.Interface,
    config: MigrationConfig.Interface
  );
  preloadModels(tenantLocales: Map<string, string>): Promise<void>;
  private extractModels;
  getModel(modelId: string): ModelProviderAbstraction.ModelType | undefined;
  getModelIds(): string[];
}
export declare const ModelProvider: typeof ModelProviderImpl & {
  __abstraction: import("@webiny/di").Abstraction<
    import("./abstractions/ModelProvider.ts").IModelProvider
  >;
};
//# sourceMappingURL=ModelProvider.d.ts.map
