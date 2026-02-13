// ============================================================================
// AWS Credentials
// ============================================================================

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

// ============================================================================
// Account Configuration
// ============================================================================

export interface AccountConfiguration {
  /** AWS region for this account */
  region: string;
  /** Optional AWS credentials. If omitted, uses default AWS credential chain (IAM role, profile, etc.) */
  credentials?: AwsCredentials;
  /** DynamoDB configuration */
  dynamodb: {
    tableName: string;
  };
  /** S3 configuration */
  s3: {
    bucket: string;
  };
}

// ============================================================================
// Migration Configuration
// ============================================================================

export interface MigrationConfiguration {
  /** Source account (Account A) - where v5 data lives */
  source: AccountConfiguration;

  /** Target account (Account B) - where v6 data will be written */
  target: AccountConfiguration;

  /** Migration settings */
  migration: {
    /** Migration preset to use (e.g., "full" or path to custom preset file) */
    preset: string;
    /** Number of parallel segments to process (default: 1) */
    segments?: number;
    /** Optional directory containing CMS model JSON files */
    modelsDir?: string;
  };
}
