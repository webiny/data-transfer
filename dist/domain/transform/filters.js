const getPropertyFromRecord = (record, propertyName) => {
  const value = record[propertyName];
  if (value !== undefined) {
    return value;
  }
  const data = record.data;
  if (data) {
    return data[propertyName];
  }
  return undefined;
};
export const byType = type => record => {
  return record.TYPE === type;
};
export const byTypePrefix = prefix => record => {
  const type = record.TYPE;
  return Boolean(type && type.startsWith(prefix));
};
export const isCmsGroup = record => {
  if (record.TYPE === "cms.group") {
    return true;
  }
  return record.PK.includes("#CMS#CMG");
};
export const isCmsModel = byType("cms.model");
export const isCmsEntry = input => {
  const isType = byTypePrefix("cms.entry")(input);
  if (isType) {
    return true;
  }
  return input.PK.includes("#CMS#CME#");
};
export const byIncludesModelId = target => record => {
  const input = target.toLowerCase();
  /**
   * This is for OS records. Also, we are positive that no record has index, except the OS Record one
   */
  const index = getPropertyFromRecord(record, "index");
  if (typeof index === "string" && index.toLowerCase().includes(input)) {
    return true;
  }
  const modelId = getPropertyFromRecord(record, "modelId");
  return typeof modelId === "string" && modelId.toLowerCase().includes(input);
};
export const isAcoSearchRecord = byIncludesModelId("acoSearchRecord");
export const isBackgroundTask = item => {
  if (item.modelId === "webinyTask" || item.modelId === "webinyTaskLog") {
    return true;
  } else if (typeof item.GSI1_PK !== "string") {
    return false;
  }
  return item.GSI1_PK.includes("webinyTask") || item.GSI1_PK.includes("webinyTaskLog");
};
export const isFmFile = record => {
  const modelId = record.modelId || record.data?.modelId;
  return modelId === "fmFile" || modelId === "wbyFmFile";
};
export const isFlpRecord = record => {
  return typeof record.PK === "string" && record.PK.includes("#FLP#");
};
export const isBuiltInSecurityRole = record => {
  const slug = record.slug || record.GSI1_SK;
  return ["full-access", "anonymous"].includes(slug);
};
export const isSecurityTeam = byType("security.team");
export const isOsBackgroundTask = record => {
  const data = record.data;
  const modelId = data?.modelId;
  return modelId === "webinyTask" || modelId === "webinyTaskLog";
};
export const isOsMailerSettings = record => {
  const data = record.data;
  return data?.modelId === "mailerSettings";
};
export const isAuditLogEntry = record => {
  const modelId = getPropertyFromRecord(record, "modelId");
  if (!modelId) {
    return false;
  }
  return modelId.toLowerCase() === "acosearchrecord-auditlogs" && record.SK === "L";
};
export const isMigrationRecord = record => {
  if (!record.PK) {
    return false;
  }
  return record.PK.startsWith("MIGRATION");
};
export const isFormBuilderRecord = record => {
  if (record.PK.includes("#FB#")) {
    return true;
  }
  const type = record.TYPE;
  if (!type) {
    return false;
  }
  return type.startsWith("fb.form.") || type.startsWith("fb.formSubmission");
};
export const isAdminUser = record => {
  return record.PK.includes("#SECURITY#USER#") && record.GSI1_PK === "securityRole#full-access";
};
//# sourceMappingURL=filters.js.map
