import { join } from "node:path";
import { ContainerToken, isRetryableAwsError } from "../../base/index.js";
import { IndexConfigurationResolver } from "../../features/IndexConfigurationProvider/abstractions/IndexConfigurationResolver.js";
import { Processor } from "../../domain/pipeline/abstractions/Processor.js";
import { DdbExecutor } from "../../features/DdbExecutor/abstractions/DdbExecutor.js";
import {
  SourceDynamoDbClient,
  TargetDynamoDbClient
} from "../../services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { OpenSearchClient } from "../../services/OpenSearchClient/abstractions/OpenSearchClient.js";
import { TouchedIndexes } from "../../features/TouchedIndexes/abstractions/TouchedIndexes.js";
import { MigrationConfig } from "../../features/MigrationConfig/abstractions/MigrationConfig.js";
import { TransferContext } from "../../features/TransferLifecycle/abstractions/TransferContext.js";
import { Logger } from "../../tools/Logger/abstractions/Logger.js";
import { DirectoryTool } from "../../tools/DirectoryTool/abstractions/DirectoryTool.js";
import { FileTool } from "../../tools/FileTool/abstractions/FileTool.js";
import { PutRecord } from "../../domain/transform/commands/PutRecord.js";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
const DEFAULT_RETRY_SCHEDULE = [5000, 10000, 20000, 30000, 30000];
const DEFAULT_REFRESH_INTERVAL = "1s";
const DISABLED_REFRESH_INTERVAL = "-1";
const DEFAULT_GZIP_CONCURRENCY = 16;
class OsProcessorImpl {
  logger;
  ddbExecutor;
  container;
  compression;
  touchedIndexes;
  config;
  transferContext;
  dirTool;
  fileTool;
  sourceDb;
  targetDb;
  indexConfigurationResolver;
  _osClient = null;
  constructor(
    logger,
    ddbExecutor,
    container,
    compression,
    touchedIndexes,
    config,
    transferContext,
    dirTool,
    fileTool,
    sourceDb,
    targetDb,
    indexConfigurationResolver
  ) {
    this.logger = logger;
    this.ddbExecutor = ddbExecutor;
    this.container = container;
    this.compression = compression;
    this.touchedIndexes = touchedIndexes;
    this.config = config;
    this.transferContext = transferContext;
    this.dirTool = dirTool;
    this.fileTool = fileTool;
    this.sourceDb = sourceDb;
    this.targetDb = targetDb;
    this.indexConfigurationResolver = indexConfigurationResolver;
  }
  get osClient() {
    if (!this._osClient) {
      this._osClient = this.container.resolve(OpenSearchClient);
    }
    return this._osClient;
  }
  extendContext(base) {
    if (!this.config.target.opensearch) {
      throw new Error("OsProcessor: config.target.opensearch is not configured.");
    }
    if (!this.config.source.opensearch) {
      throw new Error("OsProcessor: config.source.opensearch is not configured.");
    }
    const sourceTable = this.config.source.opensearch.tableName;
    const targetTable = this.config.target.opensearch.tableName;
    const sourceDb = this.sourceDb;
    const targetDb = this.targetDb;
    return {
      putRecord(record) {
        base.addCommand(PutRecord.create({ table: targetTable, record }));
      },
      async querySourceRecord(pk, sk) {
        const results = await sourceDb.query(sourceTable, pk, sk);
        return results.length > 0 ? results[0] : null;
      },
      async queryTargetRecord(pk, sk) {
        const results = await targetDb.query(targetTable, pk, sk);
        return results.length > 0 ? results[0] : null;
      }
    };
  }
  onEnd(ctx) {
    ctx.putRecord(ctx.record);
  }
  async execute(commands) {
    if (this.transferContext.dryRun) {
      return;
    }
    const puts = commands.get(PutRecord.key);
    if (puts.length === 0) {
      return;
    }
    const gzippedPuts = await this.buildGzippedPuts(puts);
    const uniqueIndexes = new Set(puts.map(put => put.record.index));
    for (const indexName of uniqueIndexes) {
      await this.ensureIndex(indexName);
    }
    this.logger.info(`Writing ${gzippedPuts.length} records to database`);
    await this.ddbExecutor.execute(gzippedPuts);
  }
  async checkAccess() {
    if (!this.config.target.opensearch) {
      return [];
    }
    // Source OS data is read indirectly via the source DDB table; no source-side OS probe needed.
    const endpoint = this.config.target.opensearch.endpoint;
    const label = `OpenSearch cluster: ${endpoint}`;
    try {
      await this.osClient.listIndexes();
      return [{ label, status: "ok" }];
    } catch (error) {
      const statusCode = error.statusCode;
      if (statusCode === 401 || statusCode === 403) {
        return [{ label, status: "denied" }];
      }
      if (statusCode === 404) {
        return [{ label, status: "missing" }];
      }
      return [{ label, status: "unknown" }];
    }
  }
  afterShard(ctx) {
    const items = this.touchedIndexes.all();
    if (items.length === 0) {
      return;
    }
    const transferDir = join(process.cwd(), ".transfer", this.transferContext.runId);
    this.dirTool.create(transferDir);
    const stateFile = join(transferDir, `${ctx.segment}-indexes.json`);
    this.fileTool.writeFileOrThrow(stateFile, JSON.stringify(items));
  }
  async buildGzippedPuts(puts) {
    const concurrency = this.gzipConcurrency;
    const result = new Array(puts.length);
    for (let i = 0; i < puts.length; i += concurrency) {
      const slice = puts.slice(i, i + concurrency);
      const gzipped = await Promise.all(
        slice.map(async put => {
          const compressed = await this.compression.compress(put.record.data);
          return PutRecord.create({
            table: put.table,
            record: {
              ...put.record,
              data: compressed
            }
          });
        })
      );
      for (let j = 0; j < gzipped.length; j++) {
        result[i + j] = gzipped[j];
      }
    }
    return result;
  }
  async ensureIndex(indexName) {
    if (this.touchedIndexes.has(indexName)) {
      return;
    }
    await this.withRetry(async () => {
      const exists = await this.osClient.indexExists(indexName);
      if (exists) {
        await this.disableRefreshOnExisting(indexName);
        return;
      }
      await this.createNewIndex(indexName);
    }, `ensureIndex("${indexName}")`);
  }
  async disableRefreshOnExisting(indexName) {
    const current = await this.osClient.getIndexSettings(indexName);
    const originalRefresh =
      current.refreshInterval && current.refreshInterval !== DISABLED_REFRESH_INTERVAL
        ? current.refreshInterval
        : DEFAULT_REFRESH_INTERVAL;
    const resolved = this.indexConfigurationResolver.resolve(indexName);
    const resolvedIndexSettings = resolved.settings?.index ?? {};
    try {
      await this.osClient.putIndexSettings(indexName, {
        index: {
          ...resolvedIndexSettings,
          refresh_interval: DISABLED_REFRESH_INTERVAL
        }
      });
      this.logger.info(
        `Disabled refresh on existing index: ${indexName} (was: ${originalRefresh})`
      );
    } catch (settingsError) {
      this.logger.warn(
        `Failed to update settings on index: ${indexName}. Continuing. Error: ${settingsError}`
      );
    }
    this.touchedIndexes.record(indexName, originalRefresh);
  }
  async createNewIndex(indexName) {
    try {
      const resolved = this.indexConfigurationResolver.resolve(indexName);
      const resolvedIndexSettings = resolved.settings?.index ?? {};
      await this.osClient.createIndex(indexName, {
        mappings: resolved.mappings,
        settings: {
          index: {
            ...resolvedIndexSettings,
            refresh_interval: DISABLED_REFRESH_INTERVAL
          }
        }
      });
      this.logger.info(`Created index: ${indexName}`);
    } catch (createError) {
      if (this.isAlreadyExistsError(createError)) {
        this.logger.info(`Index already exists (race condition): ${indexName}`);
      } else {
        throw createError;
      }
    }
    // New indexes were created with "-1"; "1s" is the default we'll restore to.
    this.touchedIndexes.record(indexName, DEFAULT_REFRESH_INTERVAL);
  }
  async withRetry(fn, label) {
    let lastError;
    const schedule = this.retrySchedule;
    for (let attempt = 0; attempt <= schedule.length; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (!isRetryableAwsError(error)) {
          throw error;
        }
        if (attempt < schedule.length) {
          const wait = schedule[attempt];
          this.logger.warn(
            `${label} failed (attempt ${attempt + 1}/${schedule.length + 1}). Retrying in ${wait / 1000}s...`
          );
          await new Promise(resolve => setTimeout(resolve, wait));
        }
      }
    }
    throw lastError;
  }
  isAlreadyExistsError(error) {
    if (!error || typeof error !== "object") {
      return false;
    }
    const maybeMeta = error.meta;
    if (maybeMeta?.body?.error?.type === "resource_already_exists_exception") {
      return true;
    }
    const message = error.message ?? "";
    return message.includes("resource_already_exists_exception");
  }
  get retrySchedule() {
    return this.config.tuning?.os?.retryScheduleMs ?? DEFAULT_RETRY_SCHEDULE;
  }
  get gzipConcurrency() {
    return this.config.tuning?.os?.gzipConcurrency ?? DEFAULT_GZIP_CONCURRENCY;
  }
}
export const OsProcessor = Processor.createImplementation({
  implementation: OsProcessorImpl,
  dependencies: [
    Logger,
    DdbExecutor,
    ContainerToken,
    CompressionHandler,
    TouchedIndexes,
    MigrationConfig,
    TransferContext,
    DirectoryTool,
    FileTool,
    SourceDynamoDbClient,
    TargetDynamoDbClient,
    IndexConfigurationResolver
  ]
});
//# sourceMappingURL=OsProcessor.js.map
