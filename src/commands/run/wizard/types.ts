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
    sourceOsTable: string;
    targetRegion: string;
    targetDdbTable: string;
    targetS3Bucket: string;
    targetAuditLogTable: string;
    targetOsTable: string;
    targetOsEndpoint: string;
    targetOsIndexPrefix: string;
    segments: number;
}

export interface WizardResult {
    configPath: string;
    preset: string;
    dryRun: boolean;
}
