import { DatabaseRecord } from "../../src/database/interface.ts";

/**
 * Sample v5 records for testing
 */

// Security Group (should become Role)
export const v5SecurityGroup: DatabaseRecord = {
  PK: "T#root#L#en-US#GROUP#6983019b5119180002ccf5ee",
  SK: "A",
  createdBy: {
    displayName: "Admin User",
    id: "67af5108ac973600020bb056",
    type: "admin"
  },
  createdOn: "2026-02-04T08:21:47.519Z",
  description: "Test role",
  GSI1_PK: "T#root#L#en-US#GROUPS",
  GSI1_SK: "test-role-1",
  id: "6983019b5119180002ccf5ee",
  name: "Test Role #1",
  permissions: [
    {
      name: "security.*"
    },
    {
      name: "adminUsers.*"
    },
    {
      name: "cms.endpoint.manage"
    },
    {
      name: "content.i18n"
    },
    {
      name: "cms.contentModel",
      own: false,
      rwd: "r",
      pw: "",
      models: {
        "en-US": ["article"]
      }
    },
    {
      name: "cms.contentModelGroup",
      own: false,
      rwd: "rw",
      pw: "",
      groups: {
        "en-US": ["67af510eac973600020bb057"]
      }
    },
    {
      name: "cms.contentEntry",
      own: false,
      rwd: "rw",
      pw: ""
    }
  ],
  slug: "test-role-1",
  system: false,
  tenant: "root",
  TYPE: "security.group",
  webinyVersion: "0.0.0",
  _ct: "2026-02-04T08:21:47.520Z",
  _et: "SecurityGroup",
  _md: "2026-02-04T08:21:47.520Z"
};

export const v6SecurityRole: DatabaseRecord = {
  PK: "T#root#ROLE#6983019b5119180002ccf5ee",
  SK: "A",
  createdBy: {
    displayName: "Admin User",
    id: "67af5108ac973600020bb056",
    type: "admin"
  },
  createdOn: "2026-02-04T08:21:47.519Z",
  description: "Test role",
  GSI1_PK: "T#root#ROLES",
  GSI1_SK: "test-role-1",
  id: "6983019b5119180002ccf5ee",
  name: "Test Role #1",
  permissions: [
    {
      name: "security.*"
    },
    {
      name: "adminUsers.*"
    },
    {
      name: "cms.endpoint.manage"
    },
    {
      name: "cms.contentModel",
      own: false,
      rwd: "r",
      pw: "",
      models: ["article"]
    },
    {
      name: "cms.contentModelGroup",
      own: false,
      rwd: "rw",
      pw: "",
      groups: ["ungrouped"]
    },
    {
      name: "cms.contentEntry",
      own: false,
      rwd: "rw",
      pw: ""
    }
  ],
  slug: "test-role-1",
  system: false,
  tenant: "root",
  TYPE: "security.role",
  webinyVersion: "0.0.0",
  _ct: "2026-02-04T08:21:47.520Z",
  _et: "SecurityRole",
  _md: "2026-02-04T08:21:47.520Z"
};

// File Manager Settings
export const v5FileManagerSettings: DatabaseRecord = {
  PK: "T#root#FM#SETTINGS",
  SK: "A",
  data: {
    srcPrefix: "https://d8eqa02y4s7ns.cloudfront.net/files/",
    tenant: "root",
    uploadMaxFileSize: 10737418240,
    uploadMinFileSize: 0
  },
  TYPE: "fm.settings",
  _ct: "2025-02-14T14:19:58.794Z",
  _et: "FM.Settings",
  _md: "2025-02-14T14:19:58.794Z"
};

// Mailer Settings
export const v5MailerSettings: DatabaseRecord = {
  SK: "L",
  modelId: "mailerSettings",
  tenant: "root",
  values: {
    from: "noreply@hostname.com",
    host: "hostname.com",
    password: "U2FsdGVkX1/6k2xNUKb2oeQD+570saZOZyYGKpo+0PI=",
    port: 8000,
    replyTo: "reply@hostname.com",
    user: "user1"
  },
  PK: "T#root#MAILER",
  TYPE: "mailer.settings"
};

// CMS Entry (File)
export const v5CmsFileEntry: DatabaseRecord = {
  PK: "T#root#L#en-US#CMS#CME#CME#67dadc3209fa5e0002e5523f",
  SK: "L",
  createdBy: {
    displayName: "Admin User",
    id: "67af5108ac973600020bb056",
    type: "admin"
  },
  createdOn: "2025-03-19T15:01:06.955Z",
  entryId: "67dadc3209fa5e0002e5523f",
  GSI1_PK: "T#root#L#en-US#CMS#CME#M#fmFile#L",
  GSI1_SK: "67dadc3209fa5e0002e5523f#0001",
  id: "67dadc3209fa5e0002e5523f#0001",
  locale: "en-US",
  location: {
    folderId: "root"
  },
  locked: false,
  meta: {},
  modelId: "fmFile",
  modifiedOn: "2025-03-19T15:01:11.304Z",
  revisionCreatedBy: {
    displayName: "Admin User",
    id: "67af5108ac973600020bb056",
    type: "admin"
  },
  revisionCreatedOn: "2025-03-19T15:01:06.958Z",
  revisionModifiedOn: "2025-03-19T15:01:11.460Z",
  revisionSavedOn: "2025-03-19T15:01:11.460Z",
  savedBy: {
    displayName: "Admin User",
    id: "67af5108ac973600020bb056",
    type: "admin"
  },
  savedOn: "2025-03-19T15:01:11.304Z",
  status: "draft",
  tenant: "root",
  TYPE: "cms.entry.l",
  values: {
    "number@size": 131309,
    "object@meta": {
      "boolean@private": false
    },
    "text@aliases": [],
    "text@key": "67dadc3209fa5e0002e5523f/NumbersGrid3.png",
    "text@name": "Numbers Grid 3.png",
    "text@tags": [],
    "text@type": "image/png"
  },
  version: 1,
  webinyVersion: "0.0.0",
  _ct: "2025-03-19T15:01:11.503Z",
  _et: "CmsEntries",
  _md: "2025-03-19T15:01:11.503Z"
};

const v6CmsFileEntry: DatabaseRecord = {
  PK: "T#root#CMS#CME#698255e9a099180002913d56",
  SK: "L",
  data: {
    createdBy: {
      displayName: "Admin User",
      id: "697fa558f0f6060002d6c10a",
      type: "admin"
    },
    createdOn: "2026-02-03T20:09:14.160Z",
    deletedBy: null,
    deletedOn: null,
    entryId: "698255e9a099180002913d56",
    firstPublishedBy: null,
    firstPublishedOn: null,
    id: "698255e9a099180002913d56#0001",
    lastPublishedBy: null,
    lastPublishedOn: null,
    location: {
      folderId: "698390c69d0ef4000264a05b"
    },
    locked: false,
    meta: {},
    modelId: "wbyFmFile",
    modifiedBy: {
      displayName: "Admin User",
      id: "697fa558f0f6060002d6c10a",
      type: "admin"
    },
    modifiedOn: "2026-02-04T19:06:59.197Z",
    restoredBy: null,
    restoredOn: null,
    revisionCreatedBy: {
      displayName: "Admin User",
      id: "697fa558f0f6060002d6c10a",
      type: "admin"
    },
    revisionCreatedOn: "2026-02-03T20:09:14.160Z",
    revisionDeletedBy: null,
    revisionDeletedOn: null,
    revisionFirstPublishedBy: null,
    revisionFirstPublishedOn: null,
    revisionLastPublishedBy: null,
    revisionLastPublishedOn: null,
    revisionModifiedBy: {
      displayName: "Admin User",
      id: "697fa558f0f6060002d6c10a",
      type: "admin"
    },
    revisionModifiedOn: "2026-02-04T19:06:59.197Z",
    revisionRestoredBy: null,
    revisionRestoredOn: null,
    revisionSavedBy: {
      displayName: "Admin User",
      id: "697fa558f0f6060002d6c10a",
      type: "admin"
    },
    revisionSavedOn: "2026-02-04T19:06:59.197Z",
    savedBy: {
      displayName: "Admin User",
      id: "697fa558f0f6060002d6c10a",
      type: "admin"
    },
    savedOn: "2026-02-04T19:06:59.197Z",
    status: "draft",
    tenant: "root",
    values: {
      "number@size": 271223,
      "object@meta": {},
      "text@key": "698255e9a099180002913d56/image-2.jpg",
      "text@name": "image-2.jpg",
      "text@tags": [],
      "text@type": "image/jpeg"
    },
    version: 1
  },
  GSI1_PK: "T#root#CMS#CME#M#wbyFmFile#L",
  GSI1_SK: "698255e9a099180002913d56#0001",
  GSI_TENANT: "root",
  TYPE: "cms.entry.l",
  _ct: "2026-02-04T19:06:59.287Z",
  _et: "CmsEntries",
  _md: "2026-02-04T19:06:59.287Z"
};

// Folder (FLP) Record
export const v5FolderRecord: DatabaseRecord = {
  PK: "T#root#L#en-US#CMS#CME#FLP#folder123",
  SK: "A",
  TYPE: "cms.entry.flp",
  tenant: "root",
  data: {
    id: "folder123#0001",
    parentId: "root#0001",
    name: "My Folder",
    type: "folder"
  },
  webinyVersion: "5.0.0"
};

// CMS Entry with duplicate CME
export const v5CmsEntryWithDuplicateCme: DatabaseRecord = {
  PK: "T#root#L#en-US#CMS#CME#CME#acoFolder123",
  SK: "REV#0001",
  TYPE: "cms.entry.l",
  modelId: "acoFolder",
  tenant: "root",
  entryId: "acoFolder123",
  values: {
    "text@title": "Test Folder"
  },
  webinyVersion: "5.0.0"
};

// Content Model Group record for lookup
export const v5ContentModelGroup: DatabaseRecord = {
  PK: "T#root#GROUP#67af510eac973600020bb057",
  SK: "A",
  slug: "ungrouped",
  name: "Ungrouped",
  description: "Ungrouped content models",
  icon: "fas/folder",
  tenant: "root",
  TYPE: "cms.group",
  _ct: "2026-02-04T08:21:47.520Z",
  _et: "CmsGroup",
  _md: "2026-02-04T08:21:47.520Z"
};

// Full access group (should be skipped)
export const v5FullAccessGroup: DatabaseRecord = {
  PK: "T#root#L#en-US#GROUP#full-access-id",
  SK: "A",
  slug: "full-access",
  name: "Full Access",
  description: "Full system access",
  permissions: [],
  tenant: "root",
  TYPE: "security.group",
  _ct: "2026-02-04T08:21:47.520Z",
  _et: "SecurityGroup",
  _md: "2026-02-04T08:21:47.520Z"
};

// Anonymous group (should be skipped)
export const v5AnonymousGroup: DatabaseRecord = {
  PK: "T#root#L#en-US#GROUP#anonymous-id",
  SK: "A",
  slug: "anonymous",
  name: "Anonymous",
  description: "Anonymous users",
  permissions: [],
  tenant: "root",
  TYPE: "security.group",
  _ct: "2026-02-04T08:21:47.520Z",
  _et: "SecurityGroup",
  _md: "2026-02-04T08:21:47.520Z"
};

// Record that should be skipped (different locale)
export const v5RecordDifferentLocale: DatabaseRecord = {
  PK: "T#root#L#fr-FR#CMS#CME#698262002baa500002afd999",
  SK: "REV#0001",
  TYPE: "cms.entry.l",
  tenant: "root",
  modelId: "fmFile",
  locale: "fr-FR"
};

// Record with no matching pipeline (should be skipped)
export const v5UnknownRecord: DatabaseRecord = {
  PK: "T#root#UNKNOWN#12345",
  SK: "A",
  TYPE: "unknown.type",
  tenant: "root",
  someData: "test"
};
