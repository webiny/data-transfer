import { createAbstraction } from "~/base/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    /** Populated when credentials come from a provider that rotates them. */
    expiration?: Date;
}

export type AwsCredentialsProvider = () => Promise<AwsCredentials>;

export interface DynamoDbConnectionConfig {
    region: string;
    /**
     * Either a literal credentials object, or an AWS SDK credential-
     * provider function (e.g. `fromAwsProfile`). Optional because
     * integration tests default to dynalite with dummy creds — user
     * config requires it via the Zod schema.
     */
    credentials?: AwsCredentials | AwsCredentialsProvider;
    /** Override endpoint (for local testing with dynalite) */
    endpoint?: string;
}

export interface DynamoDbTuning {
    maxRetries?: number;
    initialBackoffMs?: number;
}

export interface IDynamoDbClientConfig {
    source: DynamoDbConnectionConfig;
    target: DynamoDbConnectionConfig;
    tuning?: DynamoDbTuning;
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
    export type Tuning = DynamoDbTuning;
}
