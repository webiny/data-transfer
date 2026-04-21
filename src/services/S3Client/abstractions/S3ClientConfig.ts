import { createAbstraction } from "~/base/index.ts";

interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}

interface S3ConnectionConfig {
    region: string;
    credentials: AwsCredentials;
}

interface S3Tuning {
    concurrency?: number;
    maxRetries?: number;
    initialBackoffMs?: number;
}

interface IS3ClientConfig {
    source: S3ConnectionConfig;
    target: S3ConnectionConfig;
    tuning?: S3Tuning;
}

export const S3ClientConfig = createAbstraction<IS3ClientConfig>("Core/S3ClientConfig");

export namespace S3ClientConfig {
    export type Interface = IS3ClientConfig;
    export type Connection = S3ConnectionConfig;
    export type Credentials = AwsCredentials;
    export type Tuning = S3Tuning;
}
