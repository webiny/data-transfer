## Pipeline Customizer Example


`````typescript
import { createFilter, MigrationConfig, PipelineCustomizer, SourceDynamoDbClient } from "@webiny/data-transfer";
import { Logger } from "~/tools/Logger/index.js";

interface Folder {
  id: string;
  entryId: string;
}

interface FetchFolderParams {
  id: string;
  tenant: string;
  locale: string;
}

interface PossibleFolderRecord extends SourceDynamoDbClient.Record {
  PK: string;
  SK: string;
  id: string;
  entryId: string;
  modelId: string;
}

class ExampleCustomizerImpl implements PipelineCustomizer.Interface {
  public name = "ExampleCustomizer";
  
  private readonly cache: Record<string, Promise<Folder | null> | undefined> = {};
  
  public constructor(
    private readonly migrationConfig: MigrationConfig.Interface,
    private readonly sourceDynamoDbClient: SourceDynamoDbClient.Interface,
    private readonly logger: Logger.Interface
  ) {
  }
  
  public canUse(pipelineName: string): boolean {
    return pipelineName === "CmsEntries";
  }
  
  public async configure(builder: PipelineCustomizer.Builder): Promise<void> {
    builder.filter(createFilter(async record => {
        /**
         * Do you want to allow this record to be processed if there is no folderId, tenant or locale?
         */
        const folderId = record.location?.folderId;
        if(!folderId || !record.tenant || !record.locale) {
          return true;
        }
        const folder = await this.getFolder({
          id: folderId.split("#")[0],
          tenant: record.tenant,
          locale: record.locale
        });
        /**
         * Folder does not exist, lets skip this record and log it, so we can investigate later.
         */
        if(!folder) {
          this.logger.error(`Folder with id "${folderId}" not found for entry with id "${record.entryId}". Skipping this record.`);
          return false;
        }
        /**
         * Folder exists, check if its ok so we can transfer the record.
         */
        // CUSTOM LOGIC and return false if you want to skip the record.
        // yes, transfer the record
        return true;
      })
    );
  }
  /**
   * This method gets the folder promise - cached one.
   */
  private async getFolder(params: FetchFolderParams): Promise<Folder | null> {
    const { tenant, locale, id } = params;
    if (!id) {
      return null;
    } else if (this.cache[id]) {
      return this.cache[id];
    }
    return this.cache[id] = this.fetchFolder({ tenant, locale, id });
  }
  /**
   * This method fetches the folder from DynamoDB.
   * Method should not get hit every time folder is requested, we have getFolder() with cache for that.
   */
  private async fetchFolder(params: FetchFolderParams): Promise<Folder | null> {
    const result = await this.sourceDynamoDbClient.get<PossibleFolderRecord>(
      this.migrationConfig.source.dynamodb.tableName,
      `T#${params.tenant}#L#${params.locale}#CMS#CME#${params.id}`,
      "L"
    );
    if(!result) {
      return null;
    }
    else if(result.modelId === "acoFolder") {
      return result;
    }
    return null;
  }
}

export const ExampleCustomizer = PipelineCustomizer.createImplementation({
  implementation: ExampleCustomizerImpl,
  dependencies: [MigrationConfig, SourceDynamoDbClient, Logger]
});
`````
