# AWS Cross-Account Transfer Script

A script that connects to a **source** AWS account and transfers data (DynamoDB, S3, etc.) to a **target** AWS account. Both systems are deployed with Webiny.

## Overview

The script needs credentials for both AWS accounts. There are three ways to run it:

1. **Locally** — from your machine, using named AWS profiles
2. **AWS CloudShell** — browser-based shell, zero setup
3. **EC2 instance** — dedicated VM, required if accessing VPC-only resources (e.g. OpenSearch)

## Prerequisites

- Node.js 22+ (or whatever version the script targets)
- AWS credentials for both source and target accounts
- IAM permissions on both accounts (see [Permissions](#permissions))

## Option 1: Run Locally

### Setup AWS profiles

Edit `~/.aws/credentials`:

```ini
[source]
aws_access_key_id = AKIA...
aws_secret_access_key = ...

[target]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
```

And `~/.aws/config`:

```ini
[profile source]
region = us-east-1

[profile target]
region = us-east-1
```

### Run

```bash
SOURCE_PROFILE=source TARGET_PROFILE=target yarn start
```

### When local works

- Source and target resources are publicly accessible AWS services (DynamoDB, S3)
- You have IAM credentials with sufficient permissions on both accounts

### When local does NOT work

- Source or target uses **VPC-only resources** (OpenSearch, RDS, private Lambdas)
- Resource policies restrict access to specific VPCs or IPs
- Large transfers — local bandwidth is the bottleneck, and egress between regions adds up

In those cases, use Option 2 or 3.

## Option 2: AWS CloudShell

CloudShell is a free browser-based shell available in the AWS Console.

1. Log into the AWS Console of **one** of the accounts (typically the target).
2. Open CloudShell (top-right toolbar).
3. Clone the repo, install deps, and run the script.

Limitations:
- 1 GB home directory
- 20-minute idle timeout
- No access to VPC-only resources

CloudShell credentials are pre-configured for the account you're logged into. You'll still need to configure credentials or role assumption for the **other** account.

## Option 3: EC2 Instance (recommended for large or VPC transfers)

Spin up a small EC2 instance in the **target account's VPC**. It will have:
- Network access to VPC-only resources
- IAM instance role for target account permissions
- Cross-account role assumption for source account access

### 1. Create IAM role in source account

Create `CrossAccountTransferReadRole` in the **source account** with:

**Trust policy** (allows target account to assume it):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::<TARGET_ACCOUNT_ID>:root"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

**Permissions policy** (read-only access to the resources you're transferring):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:Scan",
                "dynamodb:Query",
                "dynamodb:DescribeTable",
                "dynamodb:ListTables"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::<source-bucket>",
                "arn:aws:s3:::<source-bucket>/*"
            ]
        }
    ]
}
```

### 2. Create IAM role for EC2 in target account

Create `TransferEC2Role` with:

**Trust policy**:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": { "Service": "ec2.amazonaws.com" },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

**Permissions policy** (write access to target resources + ability to assume source role):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "sts:AssumeRole",
            "Resource": "arn:aws:iam::<SOURCE_ACCOUNT_ID>:role/CrossAccountTransferReadRole"
        },
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:PutItem",
                "dynamodb:BatchWriteItem",
                "dynamodb:DescribeTable"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::<target-bucket>",
                "arn:aws:s3:::<target-bucket>/*"
            ]
        }
    ]
}
```

### 3. Launch EC2 instance

- **AMI**: Amazon Linux 2023
- **Type**: `t3.small` (upgrade if transfer is large)
- **IAM instance profile**: `TransferEC2Role`
- **VPC**: same VPC as target Webiny deployment
- **Subnet**: private subnet (use Session Manager to connect)
- **Security group**: outbound to AWS APIs; inbound not needed if using SSM

### 4. Connect via SSM Session Manager

```bash
aws ssm start-session --target i-0123456789abcdef0 --profile target
```

### 5. Install Node, clone, run

```bash
sudo dnf install -y nodejs git
git clone <repo-url>
cd <repo>
yarn install
SOURCE_ROLE_ARN="arn:aws:iam::<SOURCE_ACCOUNT_ID>:role/CrossAccountTransferReadRole" yarn start
```

### 6. Tear down when done

Terminate the instance. IAM roles can be kept for future transfers or deleted.

## Script Configuration

The script reads from environment variables:

| Variable | Description | Required when |
| --- | --- | --- |
| `SOURCE_PROFILE` | AWS profile name for source account | Running locally |
| `TARGET_PROFILE` | AWS profile name for target account | Running locally |
| `SOURCE_ROLE_ARN` | ARN of source role to assume | Running on EC2 |
| `AWS_REGION` | Target region | Always |
| `SOURCE_REGION` | Source region (if different) | If source ≠ target region |

## Permissions

### Source account (read)

- DynamoDB: `Scan`, `Query`, `DescribeTable`, `ListTables` on source tables
- S3: `GetObject`, `ListBucket` on source buckets
- OpenSearch: `es:ESHttpGet`, `es:ESHttpPost` on source domains (if applicable)

### Target account (write)

- DynamoDB: `PutItem`, `BatchWriteItem`, `DescribeTable` on target tables
- S3: `PutObject`, `ListBucket` on target buckets
- OpenSearch: `es:ESHttpPost`, `es:ESHttpPut` on target domains (if applicable)

### Webiny-specific considerations

Webiny S3 buckets may have bucket policies that only allow the deployed Lambda execution roles. Two options:

1. Use **admin credentials** — bucket policies don't restrict the bucket owner's admin users.
2. Temporarily add your IAM role ARN to the bucket policy, then remove it after the transfer.

Webiny OpenSearch domains are typically deployed inside a VPC and accessed via the domain-specific endpoint. Local machines cannot reach them — use the EC2 approach.

## Troubleshooting

### `AccessDenied` on S3

Check the bucket policy — Webiny may restrict access to specific IAM principals. Add your role ARN or use admin credentials.

### `anonymous is not authorized to perform: es:ESHttpPost`

The OpenSearch client is not signing requests with SigV4, or the caller's IAM role isn't in the domain's access policy. Ensure you're using `@aws-sdk/client-opensearch` or a signed HTTP client, and that your role is listed in the domain policy.

### Timeouts connecting to OpenSearch / RDS

These resources are VPC-only. Run the script from an EC2 instance in the same VPC (Option 3).

### Throttling (`ProvisionedThroughputExceededException`)

DynamoDB hit capacity limits. Either:
- Enable on-demand capacity on target table temporarily
- Throttle the script's write rate
- Use `ExportTableToPointInTimeCommand` → S3 → `ImportTableFromS3` for large tables

## Cost Notes

- EC2 `t3.small` running for 1 hour: ~$0.02
- Cross-region data transfer: $0.02/GB (egress from source region)
- Same-region transfer: free
- DynamoDB on-demand writes during migration: $1.25 per million writes

Prefer same-region transfers when possible.
