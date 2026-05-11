export default {
    source: {
        region: "eu-central-1",
        credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
        dynamodb: { tableName: "src-table" },
        s3: { bucket: "src-bucket" }
    },
    target: {
        region: "us-east-1",
        credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
        dynamodb: { tableName: "tgt-table" },
        s3: { bucket: "tgt-bucket" }
    },
    pipeline: {}
};
