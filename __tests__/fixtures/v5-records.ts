import type { DatabaseRecord } from "../../src/services/DynamoDbClient/abstractions/DynamoDbClient.ts";

/**
 * Sample v5 records for testing
 */

// Security Group (should become Role)
export const v5SecurityGroup: DatabaseRecord = {
    PK: "T#root#GROUP#6983019b5119180002ccf5ee",
    SK: "A",
    createdBy: {
        displayName: "Admin User",
        id: "67af5108ac973600020bb056",
        type: "admin"
    },
    createdOn: "2026-02-04T08:21:47.519Z",
    description: "Test role",
    GSI1_PK: "T#root#GROUPS",
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
        "text@name": "NumbersGrid3.png",
        "text@tags": [],
        "text@type": "image/png"
    },
    version: 1,
    webinyVersion: "0.0.0",
    _ct: "2025-03-19T15:01:11.503Z",
    _et: "CmsEntries",
    _md: "2025-03-19T15:01:11.503Z"
};

export const v6CmsFileEntry: DatabaseRecord = {
    PK: "T#root#CMS#CME#6994322809f4a46e4a6e1bf0",
    SK: "L",
    data: {
        createdBy: {
            displayName: "Pavel Denisjuk",
            id: "697fa558f0f6060002d6c10a",
            type: "admin"
        },
        createdOn: "2026-02-17T09:17:30.170Z",
        deletedBy: null,
        deletedOn: null,
        entryId: "6994322809f4a46e4a6e1bf0",
        firstPublishedBy: null,
        firstPublishedOn: null,
        id: "6994322809f4a46e4a6e1bf0#0001",
        lastPublishedBy: null,
        lastPublishedOn: null,
        location: {
            folderId: "root"
        },
        locked: false,
        meta: {},
        modelId: "wbyFmFile",
        modifiedBy: {
            displayName: "Anonymous",
            id: "anonymous",
            type: "anonymous"
        },
        modifiedOn: "2026-02-17T09:17:39.917Z",
        restoredBy: null,
        restoredOn: null,
        revisionCreatedBy: {
            displayName: "Pavel Denisjuk",
            id: "697fa558f0f6060002d6c10a",
            type: "admin"
        },
        revisionCreatedOn: "2026-02-17T09:17:30.170Z",
        revisionDeletedBy: null,
        revisionDeletedOn: null,
        revisionFirstPublishedBy: null,
        revisionFirstPublishedOn: null,
        revisionLastPublishedBy: null,
        revisionLastPublishedOn: null,
        revisionModifiedBy: {
            displayName: "Anonymous",
            id: "anonymous",
            type: "anonymous"
        },
        revisionModifiedOn: "2026-02-17T09:17:39.917Z",
        revisionRestoredBy: null,
        revisionRestoredOn: null,
        revisionSavedBy: {
            displayName: "Anonymous",
            id: "anonymous",
            type: "anonymous"
        },
        revisionSavedOn: "2026-02-17T09:17:39.917Z",
        savedBy: {
            displayName: "Anonymous",
            id: "anonymous",
            type: "anonymous"
        },
        savedOn: "2026-02-17T09:17:39.917Z",
        status: "draft",
        tenant: "root",
        values: {
            "number@size": 92648,
            "object@accessControl": {
                "text@type": "public"
            },
            "object@metadata": {
                "object@image": {
                    "number@height": 1080,
                    "number@orientation": 1,
                    "number@width": 1920,
                    "text@format": "jpeg"
                },
                "searchable-json@exif": {
                    ColorSpace: "Uncalibrated",
                    ComponentsConfiguration: null,
                    "Exif IFD Pointer": 102,
                    ExifVersion: "0210",
                    FlashpixVersion: "0100",
                    Orientation: "top-left",
                    PixelXDimension: 1920,
                    PixelYDimension: 1080,
                    ResolutionUnit: "inches",
                    UserComment: "Picsum ID: 949",
                    XResolution: "72",
                    YCbCrPositioning: "centered",
                    YResolution: "72"
                }
            },
            "text@key": "6994322809f4a46e4a6e1bf0/image-19.jpg",
            "text@name": "image-19.jpg",
            "text@tags": [],
            "text@type": "image/jpeg"
        },
        version: 1
    },
    GSI1_PK: "T#root#CMS#CME#M#wbyFmFile#L",
    GSI1_SK: "6994322809f4a46e4a6e1bf0#0001",
    GSI_TENANT: "root",
    TYPE: "cms.entry.l",
    _ct: "2026-02-17T09:17:39.951Z",
    _et: "CmsEntries",
    _md: "2026-02-17T09:17:39.951Z"
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
        "text@path": "root/product-screenshots/file-manager",
        "text@title": "File Manager",
        "text@slug": "file-manager",
        "object@permissions": null,
        "text@type": "FmFile",
        "text@parentId": "696f439b9b76ee0002969341#0001"
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

// CMS Entry (Latest published version - cms.entry)
export const v5CmsEntryLatest: DatabaseRecord = {
    PK: "T#root#L#en-US#CMS#CME#CME#67dadc3209fa5e0002e55240",
    SK: "L",
    TYPE: "cms.entry",
    modelId: "blogPost",
    entryId: "67dadc3209fa5e0002e55240",
    tenant: "root",
    locale: "en-US",
    status: "published",
    values: {
        "text@title": "My Blog Post",
        "rich-text@content": {
            compression: "gzip",
            value: "H4sIAAAAAAAAA..."
        }
    },
    version: 2,
    webinyVersion: "5.0.0",
    _ct: "2025-03-19T15:01:11.503Z",
    _et: "CmsEntries",
    _md: "2025-03-19T15:01:11.503Z"
};

// CMS Entry (Published revision - cms.entry.p)
export const v5CmsEntryPublished: DatabaseRecord = {
    PK: "T#root#L#en-US#CMS#CME#CME#67dadc3209fa5e0002e55240",
    SK: "P",
    TYPE: "cms.entry.p",
    modelId: "blogPost",
    entryId: "67dadc3209fa5e0002e55240",
    tenant: "root",
    locale: "en-US",
    status: "published",
    values: {
        "text@title": "My Blog Post",
        "rich-text@content": {
            compression: "gzip",
            value: "H4sIAAAAAAAAA..."
        }
    },
    version: 1,
    webinyVersion: "5.0.0",
    _ct: "2025-03-19T15:01:11.503Z",
    _et: "CmsEntries",
    _md: "2025-03-19T15:01:11.503Z"
};

// Security Team
export const v5SecurityTeam: DatabaseRecord = {
    PK: "T#root#TEAM#6983017e5119180002ccf5eb",
    SK: "A",
    createdBy: {
        displayName: "Pavel Denisjuk",
        id: "67af5108ac973600020bb056",
        type: "admin"
    },
    createdOn: "2026-02-04T08:21:18.446Z",
    description: "Content editors",
    groups: ["67af50f9ac973600020bb054"],
    GSI1_PK: "T#root#TEAMS",
    GSI1_SK: "team-1",
    id: "6983017e5119180002ccf5eb",
    name: "Team #1",
    slug: "team-1",
    system: false,
    tenant: "root",
    TYPE: "security.team",
    webinyVersion: "0.0.0",
    _ct: "2026-02-04T08:21:18.459Z",
    _et: "SecurityTeam",
    _md: "2026-02-04T08:21:18.459Z"
};

// Record with no matching pipeline (should be skipped)
export const v5UnknownRecord: DatabaseRecord = {
    PK: "T#root#UNKNOWN#12345",
    SK: "A",
    TYPE: "unknown.type",
    tenant: "root",
    someData: "test"
};

// CMS Entry with nested rich-text fields (from plan/v5_rte.json)
export const v5CmsEntryWithRichText: DatabaseRecord = {
    PK: "T#root#L#en-US#CMS#CME#CME#6985aa1230935400025559ef",
    SK: "L",
    createdBy: {
        displayName: "Pavel Denisjuk",
        id: "67af5108ac973600020bb056",
        type: "admin"
    },
    createdOn: "2026-02-06T08:45:06.580Z",
    entryId: "6985aa1230935400025559ef",
    GSI1_PK: "T#root#L#en-US#CMS#CME#M#blogPost#L",
    GSI1_SK: "6985aa1230935400025559ef#0001",
    id: "6985aa1230935400025559ef#0001",
    locale: "en-US",
    location: {
        folderId: "root"
    },
    locked: false,
    meta: {},
    modelId: "blogPost",
    modifiedBy: {
        displayName: "Pavel Denisjuk",
        id: "67af5108ac973600020bb056",
        type: "admin"
    },
    modifiedOn: "2026-02-06T10:20:42.359Z",
    revisionCreatedBy: {
        displayName: "Pavel Denisjuk",
        id: "67af5108ac973600020bb056",
        type: "admin"
    },
    revisionCreatedOn: "2026-02-06T08:45:06.580Z",
    revisionModifiedBy: {
        displayName: "Pavel Denisjuk",
        id: "67af5108ac973600020bb056",
        type: "admin"
    },
    revisionModifiedOn: "2026-02-06T10:20:42.359Z",
    revisionSavedBy: {
        displayName: "Pavel Denisjuk",
        id: "67af5108ac973600020bb056",
        type: "admin"
    },
    revisionSavedOn: "2026-02-06T10:20:42.359Z",
    savedBy: {
        displayName: "Pavel Denisjuk",
        id: "67af5108ac973600020bb056",
        type: "admin"
    },
    savedOn: "2026-02-06T10:20:42.359Z",
    status: "draft",
    tenant: "root",
    TYPE: "cms.entry.l",
    values: {
        "dynamicZone@nfyelol7": [
            {
                "rich-text@xip2xhvz": {
                    compression: "gzip",
                    value: "H4sIAAAAAAAAA52QwQrCMAyGX0X+cwV37QMIXrx4FA9lja7QtaULYhl7d2kmdHr0lvwpX750Ro6RoWf0g/M2U4C+/jSW2DgPfVC4xzwalnKMlqARauKhMHHxNYAC04uhcaaJye76GJgC17yk+kLGCk/Kk4sBultuCtZl6ll6eM5ouyrRBVsRde8Hkkw2j2zSsCdP48pvxNXh2Gxre2mGIjvJdVKe7BbZbVxLipIVLLd/POV7v45d3tDYM8d0AQAA"
                },
                "text@ggkafqka": "DZ Template title",
                _templateId: "74m6szwdtcud7unp7zvuy"
            }
        ],
        "object@1reqzcq7": {
            "dynamicZone@vc5vikzr": {
                content: {
                    compression: "gzip",
                    value: "H4sIAAAAAAAAA52QMQvCMBCF/0p5cwq6ZnBSwUlQJ6VDbE4bSZOSHmIp/e+SVGh1dAn33h3vvkuP4D1D9igrY3UgB3n5EZpYGQu5ELj5UCtOZe01QcJFx0Kg5c5GAwJML4bE/vqgkrN8la3P8T2cNrHZNXEszQg8KbTGO8jlUAhoE6jkpGE5YFoYY43T5Mbln5BGBXUPqqlyslTH5jxxBNlOyFEeJ8xE3KYTU7nT88jljLVrfPI6DMU/nOmPv44d3nBz9np5AQAA"
                },
                title: "Nested DZ title",
                _templateId: "guuwad5t0u6c1z9o79ml9"
            },
            "text@48t73cke": "Seo description"
        },
        "object@f0baxz0w": [
            {
                "rich-text@5fzaks3u": {
                    compression: "gzip",
                    value: "H4sIAAAAAAAAA52QzQrCMBCEX0XmHEGveQDBc4/SQ2hWG8gfySKW0neXbIVWj952ZmD2251RUmLoGcPovC0UoW8/whIb56FPCvdUgmEZQ7IEjdgcD4XKk28GFJheDI0uBTrUYaRgmjnlFkum8KRSXYrQ56VXsK7QwKLhuWBb1OpctBTXpZ+SbIp5FJPHI3kKLdw3rgCXDbXJbsMT0iqnyXi1+8rzjnXKSbwJS/8Pp/z269jlDThmbplxAQAA"
                },
                "text@ptbb4jbi": "AI Schema"
            }
        ],
        "rich-text@8m79z9nx": {
            compression: "gzip",
            value: "H4sIAAAAAAAAA52QwQrCMAyGX0X+cwV37QMIXvUoHsoaXaFrShfEMvbu0k7o9Ogt+QNfvmRGYhboGf3gvE0UoK8/jSUxzkMfFO6cRiO1HNkSNEJJPBQmyb4EUBB6CTTOzLLrOQgFKWmOZV6HCk9Kk+MA3S03BesS9VJ7eElomwrPBVsQZesHEk0yj2TisCdP48pvxNXg2FxLe2l+VXWqt9XyZLfIbuOaI9csY7n941mf+3Xs8gZUNzE2cgEAAA=="
        },
        "text@gjpytfvd": "Title #1"
    },
    version: 1,
    webinyVersion: "0.0.0",
    _ct: "2026-02-06T10:20:42.399Z",
    _et: "CmsEntries",
    _md: "2026-02-06T10:20:42.399Z"
};

// BlogPost model definition (from plan/v5_rte_model.json)
export const v5BlogPostModel: DatabaseRecord = {
    PK: "T#root#L#en-US#CMS#CM",
    SK: "blogPost",
    TYPE: "cms.model",
    modelId: "blogPost",
    tenant: "root",
    locale: "en-US",
    fields: [
        {
            fieldId: "title",
            id: "gjpytfvd",
            label: "Title",
            storageId: "text@gjpytfvd",
            type: "text",
            multipleValues: false
        },
        {
            fieldId: "description",
            id: "8m79z9nx",
            label: "Description",
            storageId: "rich-text@8m79z9nx",
            type: "rich-text",
            multipleValues: false
        },
        {
            fieldId: "content",
            id: "nfyelol7",
            label: "Content",
            storageId: "dynamicZone@nfyelol7",
            type: "dynamicZone",
            multipleValues: true,
            settings: {
                templates: [
                    {
                        id: "74m6szwdtcud7unp7zvuy",
                        name: "RTE Content",
                        fields: [
                            {
                                fieldId: "content",
                                id: "xip2xhvz",
                                label: "Content",
                                storageId: "rich-text@xip2xhvz",
                                type: "rich-text",
                                multipleValues: false
                            },
                            {
                                fieldId: "title",
                                id: "ggkafqka",
                                label: "Title",
                                storageId: "text@ggkafqka",
                                type: "text",
                                multipleValues: false
                            }
                        ]
                    }
                ]
            }
        },
        {
            fieldId: "seo",
            id: "1reqzcq7",
            label: "SEO",
            storageId: "object@1reqzcq7",
            type: "object",
            multipleValues: false,
            settings: {
                fields: [
                    {
                        fieldId: "preset",
                        id: "vc5vikzr",
                        label: "Preset",
                        storageId: "text@vc5vikzr",
                        type: "dynamicZone",
                        multipleValues: false,
                        settings: {
                            templates: [
                                {
                                    id: "guuwad5t0u6c1z9o79ml9",
                                    name: "Generic SEO",
                                    fields: [
                                        {
                                            fieldId: "content",
                                            id: "vpn6x3nf",
                                            label: "Content",
                                            storageId: "rich-text@vpn6x3nf",
                                            type: "rich-text",
                                            multipleValues: false
                                        },
                                        {
                                            fieldId: "title",
                                            id: "gb7tffkg",
                                            label: "Title",
                                            storageId: "text@gb7tffkg",
                                            type: "text"
                                        }
                                    ]
                                }
                            ]
                        }
                    },
                    {
                        fieldId: "seoDescription",
                        id: "48t73cke",
                        label: "SEO Description",
                        storageId: "text@48t73cke",
                        type: "text",
                        multipleValues: false
                    }
                ]
            }
        },
        {
            fieldId: "schema",
            id: "f0baxz0w",
            label: "Schema",
            storageId: "object@f0baxz0w",
            type: "object",
            multipleValues: true,
            settings: {
                fields: [
                    {
                        fieldId: "type",
                        id: "ptbb4jbi",
                        label: "Type",
                        storageId: "text@ptbb4jbi",
                        type: "text",
                        multipleValues: false
                    },
                    {
                        fieldId: "schemaContent",
                        id: "5fzaks3u",
                        label: "Schema Content",
                        storageId: "rich-text@5fzaks3u",
                        type: "rich-text",
                        multipleValues: false
                    }
                ]
            }
        }
    ],
    _et: "CmsModels",
    _ct: "2026-02-06T10:20:27.362Z",
    _md: "2026-02-06T10:20:27.362Z"
};
