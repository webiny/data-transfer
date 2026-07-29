export class AuditLogPutRecord {
  table;
  record;
  static key = "AUDIT_LOG_PUT_RECORD";
  key = AuditLogPutRecord.key;
  dedupKey = undefined;
  constructor(table, record) {
    this.table = table;
    this.record = record;
  }
  static create(params) {
    return new AuditLogPutRecord(params.table, params.record);
  }
}
//# sourceMappingURL=AuditLogPutRecord.js.map
