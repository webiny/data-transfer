import { createAbstraction } from "@/src/base/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}

export interface DynamoDbConnectionConfig {
    region: string;
    credentials?: AwsCredentials;
    /** Override endpoint (for local testing with dynalite) */
    endpoint?: string;
}

export interface IDynamoDbClientConfig {
    source: DynamoDbConnectionConfig;
    target: DynamoDbConnectionConfig;
}

// ============================================================================
// Abstraction
// ============================================================================

export const DynamoDbClientConfig = createAbstraction<IDynamoDbClientConfig>(
    "Core/DynamoDbClientConfig"
);

export namespace DynamoDbClientConfig {
    export type Interface = IDynamoDbClientConfig;
    export type Connection = DynamoDbConnectionConfig;
    export type Credentials = AwsCredentials;
}
