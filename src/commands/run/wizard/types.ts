export interface RawOutputValues {
    region: string;
    primaryDynamodbTableName: string;
    fileManagerBucketId: string;
    osTableName: string;
    osEndpoint: string;
}

export interface EnvValues {
    sourceRegion: string;
    sourceDdbTable: string;
    sourceS3Bucket: string;
    sourceOsTable: string;
    targetRegion: string;
    targetDdbTable: string;
    targetS3Bucket: string;
    targetOsTable: string;
    targetOsEndpoint: string;
    targetOsIndexPrefix: string;
    segments: number;
}
