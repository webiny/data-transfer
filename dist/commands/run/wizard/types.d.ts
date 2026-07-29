export interface RawOutputValues {
  region: string;
  primaryDynamodbTableName: string;
  fileManagerBucketId: string;
  auditLogTableName?: string;
  osTableName: string;
  osEndpoint: string;
  accountId?: string;
}
export interface EnvValues {
  sourceRegion: string;
  sourceDdbTable: string;
  sourceS3Bucket: string;
  sourceAuditLogTable: string;
  sourceOsTable: string;
  sourceAccountId: string;
  targetRegion: string;
  targetDdbTable: string;
  targetS3Bucket: string;
  targetAuditLogTable: string;
  targetOsTable: string;
  targetOsEndpoint: string;
  targetOsIndexPrefix: string;
  targetAccountId: string;
  segments: number;
}
export interface WizardResult {
  configPath: string;
  preset: string;
  dryRun: boolean;
}
//# sourceMappingURL=types.d.ts.map
