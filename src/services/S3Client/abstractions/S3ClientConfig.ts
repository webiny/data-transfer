import { createAbstraction } from "@/src/base/index.ts";

interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}

interface S3ConnectionConfig {
    region: string;
    credentials: AwsCredentials;
}

interface IS3ClientConfig {
    source: S3ConnectionConfig;
    target: S3ConnectionConfig;
}

export const S3ClientConfig = createAbstraction<IS3ClientConfig>("Core/S3ClientConfig");

export namespace S3ClientConfig {
    export type Interface = IS3ClientConfig;
    export type Connection = S3ConnectionConfig;
    export type Credentials = AwsCredentials;
}
