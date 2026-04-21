import { createAbstraction } from "~/base/index.ts";

interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}

type AwsCredentialsProvider = () => Promise<AwsCredentials & { expiration?: Date }>;

interface S3ConnectionConfig {
    region: string;
    // Either a literal object or an AWS credential-provider function
    // (e.g. `fromAwsProfile`). Optional at this layer to keep test wiring
    // trivial; user config enforces presence via Zod.
    credentials?: AwsCredentials | AwsCredentialsProvider;
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
